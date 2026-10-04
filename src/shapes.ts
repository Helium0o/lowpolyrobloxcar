import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { Shape, Vec3 } from './model';

// Every shape except the ring is convex, so it is built as the convex hull of a few
// corner points. That keeps every mesh closed (watertight) and flat shaded.

const MIN = 0.02;
const cache = new Map<string, THREE.BufferGeometry>();

function geomKey(s: Shape): string {
  return JSON.stringify([s.type, s.size, s.sides, s.chamfer, s.taper, s.inner]);
}

/** Geometry in the shape's own frame (size baked in, centred on the origin). Cached and shared: do not dispose. */
export function shapeGeometry(s: Shape): THREE.BufferGeometry {
  const key = geomKey(s);
  let g = cache.get(key);
  if (!g) {
    g = buildGeometry(s);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    cache.set(key, g);
    if (cache.size > 2000) {
      const first = cache.keys().next().value as string;
      cache.get(first)?.dispose();
      cache.delete(first);
    }
  }
  return g;
}

function buildGeometry(s: Shape): THREE.BufferGeometry {
  const sx = Math.max(MIN, Math.abs(s.size[0]));
  const sy = Math.max(MIN, Math.abs(s.size[1]));
  const sz = Math.max(MIN, Math.abs(s.size[2]));
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const sides = Math.round(clamp(s.sides ?? 8, 3, 32));
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const pts: THREE.Vector3[] = [];

  switch (s.type) {
    case 'box':
      for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) pts.push(V(x, y, z));
      break;
    case 'wedge':
      // Slope rises from the front (-Z) bottom edge to the back (+Z) top edge.
      for (const x of [-hx, hx]) {
        pts.push(V(x, -hy, -hz), V(x, -hy, hz), V(x, hy, hz));
      }
      break;
    case 'cornerWedge':
      for (const x of [-hx, hx]) for (const z of [-hz, hz]) pts.push(V(x, -hy, z));
      pts.push(V(hx, hy, hz));
      break;
    case 'chamferBox': {
      const c = clamp(s.chamfer ?? 0.2, 0, 0.49) * Math.min(sx, sy, sz);
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        pts.push(V(x * (hx - c), y * hy, z * (hz - c)));
        pts.push(V(x * hx, y * (hy - c), z * (hz - c)));
        pts.push(V(x * (hx - c), y * (hy - c), z * hz));
      }
      break;
    }
    case 'taperBox': {
      const [tx, tz, shift] = s.taper ?? [0.8, 0.7, 0];
      const thx = Math.max(MIN, hx * tx), thz = Math.max(MIN, hz * tz);
      const oz = shift * sz;
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        pts.push(V(x * hx, -hy, z * hz));
        pts.push(V(x * thx, hy, z * thz + oz));
      }
      break;
    }
    case 'cylinder':
    case 'cone': {
      const top = s.type === 'cone' ? clamp(s.taper?.[0] ?? 0, 0, 1) : 1;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const cx = Math.cos(a) * hx, cz = Math.sin(a) * hz;
        pts.push(V(cx, -hy, cz));
        if (top > 0.001) pts.push(V(cx * top, hy, cz * top));
      }
      if (top <= 0.001) pts.push(V(0, hy, 0));
      break;
    }
    case 'halfCylinder': {
      // Flat side down, the curved half bulges toward +Y; axis along Z.
      const n = Math.max(2, Math.round(sides / 2));
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI;
        const cx = Math.cos(a) * hx, cy = Math.sin(a) * sy - hy;
        pts.push(V(cx, cy, -hz), V(cx, cy, hz));
      }
      break;
    }
    case 'sphere': {
      const rings = Math.max(2, Math.round(sides / 2));
      pts.push(V(0, -hy, 0), V(0, hy, 0));
      for (let r = 1; r < rings; r++) {
        const phi = (r / rings) * Math.PI;
        const y = -Math.cos(phi) * hy, rad = Math.sin(phi);
        for (let i = 0; i < sides; i++) {
          const a = ((i + (r % 2) * 0.5) / sides) * Math.PI * 2;
          pts.push(V(Math.cos(a) * hx * rad, y, Math.sin(a) * hz * rad));
        }
      }
      break;
    }
    case 'tire':
      return ringGeometry(hx, hz, hy, clamp(s.inner ?? 0.6, 0.05, 0.95), sides);
  }
  const g = new ConvexGeometry(pts);
  g.deleteAttribute('uv');
  return g;
}

/** A flat ring (tube with a rectangular cross section), axis along Y. Not convex, so built by hand. */
function ringGeometry(rx: number, rz: number, hy: number, inner: number, sides: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const ring = (i: number, r: number, y: number): Vec3 => {
    const a = ((i % sides) / sides) * Math.PI * 2;
    return [Math.cos(a) * rx * r, y, Math.sin(a) * rz * r];
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < sides; i++) {
    const j = i + 1;
    const ot0 = ring(i, 1, hy), ot1 = ring(j, 1, hy), ob0 = ring(i, 1, -hy), ob1 = ring(j, 1, -hy);
    const it0 = ring(i, inner, hy), it1 = ring(j, inner, hy), ib0 = ring(i, inner, -hy), ib1 = ring(j, inner, -hy);
    quad(ob0, ot0, ot1, ob1); // outer
    quad(ib1, it1, it0, ib0); // inner
    quad(ot0, it0, it1, ot1); // top
    quad(ob1, ib1, ib0, ob0); // bottom
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed, so these are flat face normals
  return g;
}

export function shapeMatrix(s: Shape, target = new THREE.Matrix4()): THREE.Matrix4 {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(s.rot[0]),
    THREE.MathUtils.degToRad(s.rot[1]),
    THREE.MathUtils.degToRad(s.rot[2]),
    'XYZ',
  );
  return target.compose(new THREE.Vector3(...s.pos), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1));
}

/** Reflection across world X = 0, expressed in a part's local frame (part pivot at pivotX). */
export function mirrorMatrix(pivotX: number): THREE.Matrix4 {
  // x_local' = -2*pivotX - x_local
  return new THREE.Matrix4().set(-1, 0, 0, -2 * pivotX, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** Whether a shape's mirror copy would be distinct (shapes on the centre line are not duplicated). */
export function hasMirrorCopy(s: Shape, pivotX: number): boolean {
  return !!s.mirror && Math.abs(s.pos[0] + pivotX) > 0.01;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}
