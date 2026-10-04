import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { primitiveGeometry } from '../src/render/geometry';
import type { Kind, V3 } from '../src/core/types';

// Signed volume is only right when every triangle faces outwards (wrong ones get culled and show as holes).
function volume(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

describe('primitive geometry faces outwards', () => {
  const sizes: V3[] = [[1, 1, 1], [6.8, 0.05, 7.04], [7, 0.13, 0.15], [0.2, 3, 9], [4, 4, 0.1]];
  const expected: Record<Kind, (s: V3) => number> = {
    block: ([x, y, z]) => x * y * z,
    wedge: ([x, y, z]) => (x * y * z) / 2,
    cornerwedge: ([x, y, z]) => (x * y * z) / 3,
    cylinder: () => NaN,
    ball: () => NaN,
  };
  for (const kind of ['block', 'wedge', 'cornerwedge'] as Kind[]) {
    for (const s of sizes) {
      it(`${kind} ${s.join('x')}`, () => {
        const g = primitiveGeometry(kind, s);
        expect(volume(g)).toBeCloseTo(expected[kind](s), 4);
        // every face normal points away from the inside
        const p = g.getAttribute('position');
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 3) {
          a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
          const area = b.clone().sub(a).cross(c.clone().sub(a)).length();
          if (area > 1e-9) expect(b.clone().sub(a).cross(c.clone().sub(a)).dot(a)).toBeGreaterThan(-1e-6);
        }
      });
    }
  }
  it('cylinder and ball are closed and outward', () => {
    expect(volume(primitiveGeometry('cylinder', [2, 1, 1]))).toBeGreaterThan(1.4);
    expect(volume(primitiveGeometry('ball', [1, 1, 1]))).toBeGreaterThan(0.45);
  });
});
