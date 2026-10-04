import { describe, expect, it } from 'vitest';
import { BASES, CATEGORIES, applyChoice, newCar, slotVariants } from '../src/templates';
import { buildPart } from '../src/build';

describe('templates', () => {
  for (const base of BASES) {
    it(`${base.name}: every slot variant builds within budget`, () => {
      const car = newCar(base.id);
      let worst = 0;
      for (const cat of CATEGORIES) {
        for (const slot of cat.slots) {
          for (const v of slotVariants(slot)) {
            applyChoice(car, slot, v.id);
            for (const p of car.parts) {
              const bp = buildPart(p);
              expect(bp.csgFailed, `${p.name}`).toBe(false);
              for (const m of bp.meshes) {
                expect(m.tris).toBeLessThan(20000);
                expect(Number.isFinite(m.positions[0])).toBe(true);
              }
              worst = Math.max(worst, bp.tris);
            }
          }
        }
      }
      expect(worst).toBeGreaterThan(0);
    });
  }

  it('default sedan stays low poly', () => {
    const car = newCar('sedan');
    const parts = car.parts.map(buildPart);
    const total = parts.reduce((a, p) => a + p.tris, 0);
    const names = parts.flatMap((p) => p.meshes.map((m) => `${m.name}:${m.tris}`));
    console.log('sedan total tris', total, names.join(' '));
    expect(total).toBeLessThan(8000);
    expect(car.parts.map((p) => p.name)).toContain('WheelFL');
  });
});
