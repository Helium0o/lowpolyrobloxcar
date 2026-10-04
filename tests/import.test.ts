import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importRbxm } from '../src/io/importCar';
import { resolveCar, piecesBox } from '../src/core/resolve';

const dir = 'src/templates/cars/';
describe('importing the game cars', () => {
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.rbxm'))) {
    it(f, () => {
      const { car, notes } = importRbxm(new Uint8Array(readFileSync(dir + f)), f);
      const all = [...resolveCar(car).values()].flat();
      const box = piecesBox(all);
      console.log(f, car.name, car.parts.length, 'parts', all.length, 'pieces', JSON.stringify(car.params), box.min.toArray().map((v) => v.toFixed(2)), box.max.toArray().map((v) => v.toFixed(2)), notes.slice(0, 3));
      expect(car.parts.find((p) => p.name === 'Body')?.shapes.length).toBeGreaterThan(2);
      expect(car.parts.filter((p) => p.wheel).length).toBe(4);
      expect(box.min.y).toBeGreaterThan(-0.3);
      expect(box.max.z - box.min.z).toBeLessThan(20);
    });
  }
});
