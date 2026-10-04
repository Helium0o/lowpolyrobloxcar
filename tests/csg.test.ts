import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isUnion, piecesBox, resolvePart } from '../src/core/resolve';
import { regenerateAll } from '../src/core/gen';
import { buildTemplate, TEMPLATES } from '../src/core/templates';
import type { Car } from '../src/core/types';
import { importRbxm } from '../src/io/importCar';
import { unionGeometry } from '../src/render/csg';

// The cut preview must stay where the solid shapes are (a wrong frame once moved bodies under the floor).
function check(car: Car) {
  for (const part of car.parts) {
    if (!isUnion(car, part)) continue;
    const pieces = resolvePart(car, part);
    const g = unionGeometry(pieces);
    if (!g) continue;
    g.computeBoundingBox();
    const solid = piecesBox(pieces.filter((p) => !p.cut), true);
    const b = g.boundingBox!;
    for (const k of ['x', 'y', 'z'] as const) {
      expect(b.min[k], `${part.name} min ${k}`).toBeGreaterThanOrEqual(solid.min[k] - 0.01);
      expect(b.max[k], `${part.name} max ${k}`).toBeLessThanOrEqual(solid.max[k] + 0.01);
    }
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  }
}

describe('cut preview', () => {
  for (const t of TEMPLATES) it(`starter ${t.id}`, () => check(buildTemplate(t)));
  const dir = 'src/templates/cars/';
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.rbxm'))) {
    it(f, () => {
      const { car } = importRbxm(new Uint8Array(readFileSync(dir + f)), f);
      regenerateAll(car);
      check(car);
    });
  }
});
