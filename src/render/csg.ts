import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Piece } from '../core/resolve';
import { primitiveGeometry } from './geometry';

// Union / Negate preview, the same way Roblox's UnionAsync + SubtractAsync combine parts:
// every cut shape is taken away from the solid shapes of its part.
// Results are cached by the exact shapes, so dragging another part never recomputes this one.

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

const cache = new Map<string, THREE.BufferGeometry>();

export function piecesKey(pieces: Piece[]): string {
  return pieces
    .map((p) => `${p.kind}${p.cut ? '-' : '+'}${p.size.map((v) => v.toFixed(3)).join(',')}|${Array.from(p.m.elements, (v) => v.toFixed(4)).join(',')}`)
    .join(';');
}

function brush(p: Piece): Brush {
  // placement baked into its own copy: shared cached geometry with a matrix gave results in the wrong place
  const b = new Brush(pieceGeometry(p));
  b.updateMatrixWorld(true);
  return b;
}

/**
 * Car-space geometry of the solid shapes with the cut shapes taken away. Null when there is nothing solid.
 * Overlapping solids look the same as their union, so solids are not merged with CSG (chained unions of
 * touching boxes break on shared faces); each solid only has the cuts that reach it subtracted.
 */
export function unionGeometry(pieces: Piece[]): THREE.BufferGeometry | null {
  const adds = pieces.filter((p) => !p.cut);
  const cuts = pieces.filter((p) => p.cut);
  if (!adds.length) return null;
  const key = piecesKey(pieces);
  const hit = cache.get(key);
  if (hit) return hit;
  const cutBoxes = cuts.map((c) => boxOf(c));
  const parts: THREE.BufferGeometry[] = [];
  for (const a of adds) {
    const ab = boxOf(a);
    const reach = cuts.filter((_, i) => cutBoxes[i].intersectsBox(ab));
    let g = pieceGeometry(a);
    if (reach.length) {
      try {
        let acc: Brush = brush(a);
        for (const c of reach) acc = evaluator.evaluate(acc, brush(c), SUBTRACTION) as Brush;
        g = acc.geometry.index ? acc.geometry.toNonIndexed() : acc.geometry.clone();
      } catch (e) {
        console.warn('Cut preview failed', e);
      }
    }
    const pos = g.getAttribute('position');
    if (pos && pos.count) parts.push(g);
  }
  const out = mergeTris(parts);
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  cache.set(key, out);
  if (cache.size > 300) {
    const first = cache.keys().next().value as string;
    cache.get(first)?.dispose();
    cache.delete(first);
  }
  return out;
}

function boxOf(p: Piece): THREE.Box3 {
  const g = primitiveGeometry(p.kind, p.size);
  return g.boundingBox!.clone().applyMatrix4(p.m).expandByScalar(0.001);
}

function mergeTris(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++, o += 3) {
      arr[o] = pos.getX(i);
      arr[o + 1] = pos.getY(i);
      arr[o + 2] = pos.getZ(i);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** Car-space triangles of one piece. */
export function pieceGeometry(p: Piece): THREE.BufferGeometry {
  return primitiveGeometry(p.kind, p.size).clone().applyMatrix4(p.m);
}
