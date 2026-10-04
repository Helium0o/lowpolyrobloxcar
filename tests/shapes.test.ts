import { describe, expect, it } from 'vitest';
import { SHAPE_TYPES, type Shape } from '../src/model';
import { shapeGeometry, triangleCount } from '../src/shapes';
import { buildPart } from '../src/build';

function shape(type: Shape['type'], extra: Partial<Shape> = {}): Shape {
  return { id: 's', type, pos: [0, 0, 0], rot: [0, 0, 0], size: [2, 1, 3], role: 'paint', sides: 8, ...extra };
}

/** Signed volume of a triangle soup; positive when all faces point outward. */
function volume(pos: ArrayLike<number>): number {
  let v = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => pos[i + k]);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

/** Every edge must be shared by exactly two triangles going opposite ways. */
function isClosed(pos: ArrayLike<number>): boolean {
  const key = (i: number) => [pos[i], pos[i + 1], pos[i + 2]].map((n) => n.toFixed(4)).join(',');
  const edges = new Map<string, number>();
  for (let t = 0; t < pos.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      edges.set(a + '|' + b, (edges.get(a + '|' + b) ?? 0) + 1);
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('|');
    if (n !== 1 || edges.get(b + '|' + a) !== 1) return false;
  }
  return true;
}

describe('shapes', () => {
  for (const type of SHAPE_TYPES) {
    it(`${type} is closed and faces outward`, () => {
      const g = shapeGeometry(shape(type));
      const pos = g.getAttribute('position').array;
      expect(triangleCount(g)).toBeGreaterThan(3);
      expect(volume(pos)).toBeGreaterThan(0);
      expect(isClosed(pos)).toBe(true);
    });
  }
  it('box is 12 triangles', () => expect(triangleCount(shapeGeometry(shape('box')))).toBe(12));
});

describe('build', () => {
  it('mirror copies face outward too', () => {
    const bp = buildPart({ id: 'p', name: 'P', slot: 'custom', variant: '', pivot: [0, 0, 0], shapes: [shape('wedge', { pos: [3, 0, 0], mirror: true, rot: [10, 20, 30] })] });
    expect(bp.tris).toBeGreaterThan(0);
    expect(volume(bp.meshes[0].positions)).toBeGreaterThan(0);
  });
  it('holes cut solids', () => {
    const bp = buildPart({
      id: 'p', name: 'P', slot: 'custom', variant: '', pivot: [0, 0, 0],
      shapes: [shape('box', { size: [4, 2, 4] }), shape('cylinder', { hole: true, size: [2, 4, 2], role: 'trim' })],
    });
    expect(bp.csgFailed).toBe(false);
    const v = volume(bp.meshes[0].positions);
    expect(v).toBeLessThan(32);
    expect(v).toBeGreaterThan(20);
  });
});
