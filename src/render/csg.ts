import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Piece } from '../core/resolve';
import { primitiveGeometry } from './geometry';

// Union / Negate preview, the same way Roblox's UnionAsync + SubtractAsync combine parts:
// all solid shapes of a part are merged, then every cut shape is taken away.
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
  const b = new Brush(primitiveGeometry(p.kind, p.size));
  b.matrix.copy(p.m);
  b.matrix.decompose(b.position, b.quaternion, b.scale);
  b.updateMatrixWorld(true);
  return b;
}

/** Car-space geometry of the solid shapes merged, minus the cut shapes. Null when there is nothing solid. */
export function unionGeometry(pieces: Piece[]): THREE.BufferGeometry | null {
  const adds = pieces.filter((p) => !p.cut);
  const cuts = pieces.filter((p) => p.cut);
  if (!adds.length) return null;
  const key = piecesKey(pieces);
  const hit = cache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  if (adds.length === 1 && !cuts.length) {
    g = pieceGeometry(adds[0]);
  } else {
    // Evaluator results are in world (here: car) space.
    let acc: Brush = brush(adds[0]);
    let first = true;
    try {
      for (let i = 1; i < adds.length; i++) { acc = evaluator.evaluate(acc, brush(adds[i]), ADDITION) as Brush; first = false; }
      for (const c of cuts) { acc = evaluator.evaluate(acc, brush(c), SUBTRACTION) as Brush; first = false; }
    } catch (e) {
      console.warn('Union preview failed', e);
    }
    g = first ? pieceGeometry(adds[0]) : acc.geometry.clone();
  }
  const out = g.index ? g.toNonIndexed() : g;
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

/** Car-space triangles of one piece. */
export function pieceGeometry(p: Piece): THREE.BufferGeometry {
  return primitiveGeometry(p.kind, p.size).clone().applyMatrix4(p.m);
}
