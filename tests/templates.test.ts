import { describe, expect, it } from 'vitest';
import { TEMPLATES, buildTemplate } from '../src/core/templates';
import { resolveCar, isUnion, piecesBox } from '../src/core/resolve';
import { unionGeometry } from '../src/render/csg';

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.name} builds inside the game's size range`, () => {
      const car = buildTemplate(t);
      const pieces = resolveCar(car);
      const all = [...pieces.values()].flat();
      expect(all.length).toBeGreaterThan(40);
      for (const p of all) for (const v of p.size) expect(Number.isFinite(v) && v > 0).toBe(true);
      const box = piecesBox(all);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.x - box.min.x).toBeLessThan(8.5);
      expect(box.max.z - box.min.z).toBeLessThan(20);
      const body = car.parts.find((p) => p.name === 'Body')!;
      expect(isUnion(car, body)).toBe(true);
      const g = unionGeometry(pieces.get(body.id)!);
      expect(g).not.toBeNull();
      expect(g!.getAttribute('position').count).toBeGreaterThan(30);
    });
  }
});
