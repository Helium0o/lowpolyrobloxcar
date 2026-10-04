import { makeGenPart, regenerateAll } from './gen';
import { clone, DEFAULT_COLORS, DEFAULT_GAME, newPart, type Car, type CarParams, type ColorSlot, type Params, type Part } from './types';

// Starter cars built from generators, sized like the cars in LAS's game (about 6-7.4 studs wide,
// 14.5-18 long, roof 4-5). Every part stays slider-driven. The game's own nine cars are loaded from their
// .rbxm files instead (see io/import.ts).

export interface TemplateSpec {
  id: string;
  name: string;
  blurb: string;
  params: CarParams;
  body: Params;
  glass: Params;
  colors?: Partial<Record<ColorSlot, string>>;
  parts: { type: string; params?: Params }[];
  wheel?: Params;
}

const base: CarParams = {
  length: 16.4, width: 6.2, floor: 0.45, belt: 3.0, roof: 4.6, wheelbase: 9.5, axleOffset: -4.85,
  trackF: 2.66, trackR: 2.66, wheelRadius: 1.17, wheelWidthF: 0.95, wheelWidthR: 0.95,
};

const kit = (extra: { type: string; params?: Params }[] = []) => [
  { type: 'frontBumper' }, { type: 'rearBumper' }, { type: 'sideSkirts' }, { type: 'headlights' }, { type: 'taillights' },
  { type: 'exhaust' }, { type: 'details' }, { type: 'interior' }, { type: 'liners' }, ...extra,
];

export const TEMPLATES: TemplateSpec[] = [
  {
    id: 'sedan', name: 'Sports sedan', blurb: 'Four doors, boxy and clean. A good first car.',
    params: { ...base },
    body: { noseHeight: 1.95, noseLength: 0.5, hoodFront: 2.75, cowl: 3.0, deck: 3.05, tailTop: 3.25, tailLength: 0.35, tailHeight: 2.9 },
    glass: { windscreen: 0.37, roofFront: 0.5, roofBack: 0.67, rearGlass: 0.8 },
    colors: { paint: '#f2f3f6', accent: '#2a62d8' },
    parts: kit([{ type: 'details', params: { doors: '2' } }, { type: 'spoiler', params: { style: 'wing', height: 0.6, chord: 0.8 } }]),
  },
  {
    id: 'coupe', name: 'Sports coupe', blurb: 'Two doors, long hood, short tail.',
    params: { ...base, length: 15.6, width: 6.3, roof: 4.3, belt: 2.85, wheelbase: 9.0, axleOffset: -4.6, wheelRadius: 1.15 },
    body: { noseHeight: 1.7, noseLength: 0.7, hoodFront: 2.45, cowl: 2.85, deck: 2.95, tailTop: 3.1, tailLength: 0.4, tailHeight: 2.75, noseEdge: 0.45 },
    glass: { windscreen: 0.38, roofFront: 0.52, roofBack: 0.64, rearGlass: 0.84 },
    colors: { paint: '#d81e3a', accent: '#18191e' },
    parts: kit([{ type: 'spoiler', params: { style: 'ducktail', color: '@paint', chord: 1.0, angle: 8 } }, { type: 'hood', params: { style: 'vents', width: 2.6, length: 1.1, count: 4, pos: 0.45 } }]),
    wheel: { style: 'split', spokes: 5, spokeWidth: 0.3 },
  },
  {
    id: 'hatch', name: 'Hot hatch', blurb: 'Short and tall with a chopped tail.',
    params: { ...base, length: 14.6, width: 6.0, roof: 4.75, belt: 3.0, wheelbase: 8.9, axleOffset: -4.6, wheelRadius: 1.08, wheelWidthF: 0.85, wheelWidthR: 0.85, trackF: 2.55, trackR: 2.55 },
    body: { noseHeight: 1.9, noseLength: 0.45, hoodFront: 2.6, cowl: 2.95, deck: 3.0, tailTop: 3.15, tailLength: 0.2, tailHeight: 3.05, tailEdge: 0.15 },
    glass: { windscreen: 0.3, roofFront: 0.44, roofBack: 0.88, rearGlass: 0.97 },
    colors: { paint: '#2f6fe0', accent: '#f2f3f6' },
    parts: kit([{ type: 'spoiler', params: { style: 'lip', chord: 0.5, angle: -10, color: '@paint', shift: 0.65 } }]),
    wheel: { style: 'spokes', spokes: 6, spokeWidth: 0.16 },
  },
  {
    id: 'muscle', name: 'Muscle car', blurb: 'Long, wide and square with a big hood.',
    params: { ...base, length: 17.6, width: 6.8, roof: 4.45, belt: 2.95, wheelbase: 10.4, axleOffset: -5.4, trackF: 2.9, trackR: 2.95, wheelRadius: 1.25, wheelWidthF: 1.0, wheelWidthR: 1.1 },
    body: { noseHeight: 2.55, noseLength: 0.15, hoodFront: 2.75, cowl: 2.95, deck: 3.0, tailTop: 3.0, tailLength: 0.15, tailHeight: 2.85, noseEdge: 0.15, tailEdge: 0.15, cornerF: 0.25, cornerR: 0.2, chin: 0.2 },
    glass: { windscreen: 0.42, roofFront: 0.54, roofBack: 0.68, rearGlass: 0.82 },
    colors: { paint: '#1c1d22', accent: '#e0b020' },
    parts: kit([{ type: 'hood', params: { style: 'bulge', width: 2.4, length: 3.2, height: 0.3, pos: 0.55 } }, { type: 'spoiler', params: { style: 'ducktail', color: '@paint' } }]),
    wheel: { style: 'dish', spokes: 5, dish: 0.3, lip: 0.14 },
  },
  {
    id: 'supercar', name: 'Supercar', blurb: 'Low, wide, mid engine, cab forward.',
    params: { ...base, length: 15.4, width: 6.5, roof: 3.95, belt: 2.55, floor: 0.4, wheelbase: 9.1, axleOffset: -4.6, trackF: 2.7, trackR: 2.75, wheelRadius: 1.15, wheelWidthR: 1.05 },
    body: { noseHeight: 1.3, noseLength: 1.4, hoodFront: 2.05, cowl: 2.4, deck: 2.75, tailTop: 2.85, tailLength: 0.3, tailHeight: 2.6, noseEdge: 0.3, cornerF: 0.9, cornerR: 0.5, flare: 0.12 },
    glass: { windscreen: 0.27, roofFront: 0.43, roofBack: 0.55, rearGlass: 0.74, inset: 0.55 },
    colors: { paint: '#f0a020', accent: '#18191e' },
    parts: kit([{ type: 'spoiler', params: { style: 'swan', height: 1.0, chord: 1.0, color: '@carbon' } }, { type: 'hood', params: { style: 'vents', width: 2.4, length: 1.2, count: 5, pos: 0.6 } }]),
    wheel: { style: 'turbine', spokes: 10, spokeWidth: 0.14 },
  },
  {
    id: 'suv', name: 'SUV', blurb: 'Tall, boxy and roomy with a roof rack.',
    params: { ...base, length: 16.8, width: 6.7, floor: 0.9, belt: 3.6, roof: 5.6, wheelbase: 10.0, axleOffset: -5.0, trackF: 2.85, trackR: 2.85, wheelRadius: 1.35, wheelWidthF: 1.05, wheelWidthR: 1.05 },
    body: { noseHeight: 2.9, noseLength: 0.4, hoodFront: 3.35, cowl: 3.6, deck: 3.6, tailTop: 3.65, tailLength: 0.15, tailHeight: 3.55, noseEdge: 0.25, tailEdge: 0.15, cornerF: 0.35, cornerR: 0.25, archGap: 0.3, flare: 0.15 },
    glass: { windscreen: 0.3, roofFront: 0.42, roofBack: 0.93, rearGlass: 0.98, tumble: 0.05 },
    colors: { paint: '#3c5a46', accent: '#18191e' },
    parts: kit([{ type: 'details', params: { doors: '2' } }, { type: 'roofRack' }, { type: 'bullBar' }]),
    wheel: { style: 'steelie', faceColor: '@trim', lip: 0, caliper: false },
  },
];

const TYRE_KEYS = ['FL', 'FR', 'RL', 'RR'] as const;

/** Builds a car from a template spec. */
export function buildTemplate(spec: TemplateSpec): Car {
  const car: Car = {
    version: 2,
    name: spec.name,
    params: clone(spec.params),
    colors: { ...DEFAULT_COLORS, ...(spec.colors ?? {}) },
    parts: [],
    game: { ...DEFAULT_GAME, carName: spec.name },
  };
  const add = (p: Part) => car.parts.push(p);
  const glass = makeGenPart(car, 'glass', spec.glass);
  add(glass);
  add(makeGenPart(car, 'body', spec.body));
  add(makeGenPart(car, 'roof'));
  // later entries with the same type replace earlier ones (lets a template override the standard kit)
  const seen = new Map<string, Params | undefined>();
  for (const e of spec.parts) seen.set(e.type, { ...(seen.get(e.type) ?? {}), ...(e.params ?? {}) });
  for (const [type, params] of seen) add(makeGenPart(car, type, params));
  // wheels: FL and RL are generated; FR and RR are linked copies, so editing one rim edits all four
  const fl = makeGenPart(car, 'wheel', { ...(spec.wheel ?? {}), rear: 'front' }, 'WheelFL');
  fl.wheel = 'FL';
  const rl = makeGenPart(car, 'wheel', { ...(spec.wheel ?? {}), rear: 'rear' }, 'WheelRL');
  rl.wheel = 'RL';
  add(fl);
  add(newPart('wheel', 'WheelFR', { wheel: 'FR', link: fl.id }));
  add(rl);
  add(newPart('wheel', 'WheelRR', { wheel: 'RR', link: rl.id }));
  void TYRE_KEYS;
  regenerateAll(car);
  return car;
}

/** An empty car with only wheels, for building from scratch. */
export function blankCar(): Car {
  const spec: TemplateSpec = { id: 'blank', name: 'New car', blurb: '', params: { ...base }, body: {}, glass: {}, parts: [] };
  const car = buildTemplate(spec);
  car.parts = car.parts.filter((p) => p.slot === 'wheel');
  return car;
}
