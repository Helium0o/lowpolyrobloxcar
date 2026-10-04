import * as THREE from 'three';
import type { Kind, V3 } from '../core/types';

// Geometry for Roblox's primitives, sized the way Roblox sizes them:
// - Block: a box.
// - Wedge: tall at +Z, sloping down to the front (-Z) bottom edge.
// - Corner wedge: square base with its peak above the (+X, -Z) corner.
// - Cylinder: runs along local X; its diameter is the smaller of Size.Y and Size.Z.
// - Ball: a sphere whose diameter is the smallest of the three sizes.
// Geometry is cached by kind + size and shared, so never dispose it.

export const CYL_SEGMENTS = 20;
const cache = new Map<string, THREE.BufferGeometry>();

export function primitiveGeometry(kind: Kind, size: V3): THREE.BufferGeometry {
  const key = `${kind}:${size.map((v) => v.toFixed(4)).join(',')}`;
  let g = cache.get(key);
  if (!g) {
    g = build(kind, size.map((v) => Math.max(0.01, Math.abs(v))) as V3);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    cache.set(key, g);
    if (cache.size > 4000) {
      const first = cache.keys().next().value as string;
      cache.get(first)?.dispose();
      cache.delete(first);
    }
  }
  return g;
}

function fromTris(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: flat face normals
  return g;
}

function build(kind: Kind, [sx, sy, sz]: V3): THREE.BufferGeometry {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
  const quad = (a: V3, b: V3, c: V3, d: V3) => { tri(a, b, c); tri(a, c, d); };
  switch (kind) {
    case 'block': {
      const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
      g.deleteAttribute('uv');
      return g;
    }
    case 'wedge': {
      // bottom: y = -hy; top edge at z = +hz, y = +hy
      const a: V3 = [-hx, -hy, -hz], b: V3 = [hx, -hy, -hz], c: V3 = [hx, -hy, hz], d: V3 = [-hx, -hy, hz];
      const e: V3 = [-hx, hy, hz], f: V3 = [hx, hy, hz];
      quad(a, b, c, d); // bottom (facing -Y): a b c d is clockwise seen from below
      quad(d, c, f, e); // back (+Z)
      quad(a, e, f, b); // slope
      tri(a, d, e); // left (-X)
      tri(b, f, c); // right (+X)
      return fixWinding(fromTris(pos));
    }
    case 'cornerwedge': {
      const a: V3 = [-hx, -hy, -hz], b: V3 = [hx, -hy, -hz], c: V3 = [hx, -hy, hz], d: V3 = [-hx, -hy, hz];
      const p: V3 = [hx, hy, -hz];
      quad(a, b, c, d);
      tri(a, p, b); // front (-Z), vertical
      tri(b, p, c); // right (+X), vertical
      tri(c, p, d); // back slope
      tri(d, p, a); // left slope
      return fixWinding(fromTris(pos));
    }
    case 'cylinder': {
      const r = Math.min(sy, sz) / 2;
      const g = new THREE.CylinderGeometry(r, r, sx, CYL_SEGMENTS, 1).toNonIndexed();
      g.deleteAttribute('uv');
      g.rotateZ(-Math.PI / 2); // Y axis -> X axis
      g.computeVertexNormals();
      return g;
    }
    case 'ball': {
      const r = Math.min(sx, sy, sz) / 2;
      const g = new THREE.SphereGeometry(r, 16, 12).toNonIndexed();
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      return g;
    }
  }
}

/** Makes every triangle face outwards. These shapes are convex, so the average of their corners is inside
 * (the box centre is not: it lies on a wedge's slope). */
function fixWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  const corners = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) {
    a.fromBufferAttribute(p, i);
    corners.set(`${a.x.toFixed(5)},${a.y.toFixed(5)},${a.z.toFixed(5)}`, a.clone());
  }
  const inside = new THREE.Vector3();
  for (const v of corners.values()) inside.add(v);
  inside.divideScalar(corners.size);
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    if (n.dot(m.subVectors(a, inside)) < 0) {
      p.setXYZ(i + 1, c.x, c.y, c.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}
