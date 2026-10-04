import * as THREE from 'three';
import type { V3 } from './types';

// CFrame helpers on top of THREE.Matrix4 (rotation + translation only, never scale).
// Roblox Orientation is Y, then X, then Z, which is three.js Euler order 'YXZ'.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function fromPosRot(pos: V3, rot: V3, out = new THREE.Matrix4()): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'YXZ'));
  return out.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(1, 1, 1));
}

/** Position and Roblox Orientation (degrees) of a rotation+translation matrix. */
export function toPosRot(m: THREE.Matrix4): { pos: V3; rot: V3 } {
  const e = m.elements;
  const r = new THREE.Matrix4().extractRotation(m);
  const eu = new THREE.Euler().setFromRotationMatrix(r, 'YXZ');
  return { pos: [clean(e[12]), clean(e[13]), clean(e[14])], rot: [clean(eu.x * R2D, 1e-3), clean(eu.y * R2D, 1e-3), clean(eu.z * R2D, 1e-3)] };
}

/** CFrame:GetComponents() order: x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22. */
export function components(m: THREE.Matrix4, digits = 4): number[] {
  const e = m.elements; // column-major
  const r = (v: number) => {
    const k = 10 ** digits;
    const x = Math.round(v * k) / k;
    return Object.is(x, -0) ? 0 : x;
  };
  return [e[12], e[13], e[14], e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]].map(r);
}

export function fromComponents(c: ArrayLike<number>): THREE.Matrix4 {
  return new THREE.Matrix4().set(c[3], c[4], c[5], c[0], c[6], c[7], c[8], c[1], c[9], c[10], c[11], c[2], 0, 0, 0, 1);
}

/** Reflection across car X = 0. */
export const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

/** Removes float noise: 1.0000001 -> 1, -0 -> 0. */
export function clean(v: number, eps = 1e-6): number {
  const r = Math.round(v * 1e5) / 1e5;
  if (Math.abs(r) < eps) return 0;
  return r;
}

export const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
export const arr = (v: THREE.Vector3): V3 => [clean(v.x), clean(v.y), clean(v.z)];

/** Turn degrees into a rotation matrix (Roblox order). */
export function rotMatrix(rot: V3): THREE.Matrix4 {
  return fromPosRot([0, 0, 0], rot);
}

export function snap(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}
