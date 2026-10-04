import { newPart, type Car, type Params, type Part } from '../types';
import { bodyGen, detailsGen, glassGen, interiorGen, linersGen, roofGen } from './body';
import { EXTRAS } from './extras';
import type { Generator } from './kit';
import { frontBumperGen, hoodGen, rearBumperGen, sideSkirtsGen, spoilerGen } from './kitparts';
import { headlightsGen, taillightsGen } from './lights';
import { exhaustGen, wheelGen } from './wheels';

export type { Generator, ParamDef, Preset } from './kit';

export const GENERATORS: Generator[] = [
  bodyGen, glassGen, roofGen, linersGen, detailsGen, interiorGen,
  frontBumperGen, rearBumperGen, sideSkirtsGen, spoilerGen, hoodGen,
  headlightsGen, taillightsGen, wheelGen, exhaustGen, ...EXTRAS,
];

const byType = new Map(GENERATORS.map((g) => [g.type, g]));
export const generator = (type: string): Generator | undefined => byType.get(type);

/** Rebuilds a generated part's shapes from its sliders. Keeps hide / lock flags of shapes that still exist. */
export function regenerate(car: Car, part: Part): void {
  const g = part.gen && byType.get(part.gen.type);
  if (!g || !part.gen) return;
  const old = new Map(part.shapes.map((s) => [s.id, s]));
  part.shapes = g.build(car, { ...g.defaults(car), ...part.gen.params });
  for (const s of part.shapes) {
    const o = old.get(s.id);
    if (o?.hidden) s.hidden = true;
    if (o?.locked) s.locked = true;
  }
}

/** Generators read the body and windows, so those are rebuilt first. */
export function regenerateAll(car: Car): void {
  const order = (p: Part) => (p.gen?.type === 'glass' ? 0 : p.gen?.type === 'body' ? 1 : 2);
  for (const p of [...car.parts].sort((a, b) => order(a) - order(b))) if (p.gen) regenerate(car, p);
}

export function makeGenPart(car: Car, type: string, preset?: Params, name?: string): Part {
  const g = byType.get(type);
  if (!g) throw new Error(`No generator ${type}`);
  const part = newPart(g.slot, name ?? g.partName, { gen: { type, params: { ...g.defaults(car), ...(preset ?? {}) } } });
  if (g.union) part.union = true;
  regenerate(car, part);
  return part;
}
