// The car document. Everything in the editor is one of these plain JSON objects, so saving, undo and
// templates are just copies of it.
//
// Car space is the game's car space: studs, y = 0 is the ground, the car faces -Z, +X is the car's right.
// Shapes are exactly Roblox's primitives, with Roblox's own size and orientation rules, so a shape exports to
// Studio 1:1 with nothing approximated.

export type V3 = [number, number, number];

/** Roblox part shapes. Cylinders run along local X (like Roblox); a wedge is tall at +Z and slopes down to -Z. */
export const KINDS = ['block', 'wedge', 'cornerwedge', 'cylinder', 'ball'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABELS: Record<Kind, string> = {
  block: 'Block',
  wedge: 'Wedge',
  cornerwedge: 'Corner wedge',
  cylinder: 'Cylinder',
  ball: 'Ball',
};

/** Named colours. A shape whose colour is "@paint" follows the car's paint (and exports with the game's paint role). */
export const COLOR_SLOTS = ['paint', 'accent', 'trim', 'chrome', 'glass', 'light', 'tail', 'rim', 'tyre', 'carbon'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];
export const COLOR_SLOT_LABELS: Record<ColorSlot, string> = {
  paint: 'Paint',
  accent: 'Accent',
  trim: 'Black trim',
  chrome: 'Chrome',
  glass: 'Windows',
  light: 'Headlights',
  tail: 'Taillights',
  rim: 'Rims',
  tyre: 'Tyres',
  carbon: 'Carbon',
};

/** Repeat a shape: copy i is moved by offset*i and turned by rotate*i (degrees) around the part's origin. */
export interface Repeat {
  count: number;
  offset: V3;
  rotate: V3;
}

/** A flat graphic like the game's FlushDecal: an invisible sheet with a coloured SurfaceGui frame on one face. */
export interface Decal {
  face: 'Right' | 'Top' | 'Back' | 'Left' | 'Bottom' | 'Front';
  color: string;
}

export interface Shape {
  id: string;
  /** Roblox part name. Names matter to the game (Headlight, Taillight, ReverseLight, Wing ...). */
  name: string;
  kind: Kind;
  /** Roblox Size in studs. */
  size: V3;
  /** Position in the part's space. */
  pos: V3;
  /** Roblox Orientation in degrees (applied Y, then X, then Z). */
  rot: V3;
  /** "#rrggbb" or "@slot" (see COLOR_SLOTS). */
  color: string;
  /** Roblox material name. */
  material: string;
  transparency?: number;
  reflectance?: number;
  /** Negate: cuts the other shapes of its part (the part becomes a Union). */
  cut?: boolean;
  /** Adds a linked mirror copy on the other side of the car (across car X = 0). */
  mirror?: boolean;
  repeat?: Repeat;
  /** Game role override for the CustomParts export (otherwise worked out from colour, material and name). */
  role?: string;
  decal?: Decal;
  hidden?: boolean;
  locked?: boolean;
}

/** Where a part belongs. Ids follow LAS's game (ShopCatalog categories) where the game has one. */
export const SLOTS = [
  'body', 'glass', 'roof', 'details', 'interior',
  'frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood',
  'hoodExtra', 'roofExtra', 'sideExtra', 'frontExtra', 'rearExtra', 'trunkExtra',
  'headlights', 'taillights', 'wheel', 'exhaust', 'custom',
] as const;
export type SlotId = (typeof SLOTS)[number];

export interface SlotInfo {
  label: string;
  group: string;
  /** The game's custom-part category, when the slot has one. */
  game?: string;
}

export const SLOT_INFO: Record<SlotId, SlotInfo> = {
  body: { label: 'Body', group: 'Body' },
  glass: { label: 'Windows', group: 'Body' },
  roof: { label: 'Roof & pillars', group: 'Body' },
  details: { label: 'Body details', group: 'Body' },
  interior: { label: 'Interior', group: 'Body' },
  frontBumper: { label: 'Front bumper', group: 'Body kit', game: 'frontBumper' },
  rearBumper: { label: 'Rear bumper', group: 'Body kit', game: 'rearBumper' },
  sideSkirts: { label: 'Side skirts', group: 'Body kit', game: 'sideSkirts' },
  spoiler: { label: 'Spoiler', group: 'Body kit', game: 'spoiler' },
  hood: { label: 'Hood', group: 'Body kit', game: 'hood' },
  hoodExtra: { label: 'Hood extra', group: 'Extras', game: 'hoodExtra' },
  roofExtra: { label: 'Roof extra', group: 'Extras', game: 'roofExtra' },
  sideExtra: { label: 'Side extra', group: 'Extras', game: 'sideExtra' },
  frontExtra: { label: 'Front extra', group: 'Extras', game: 'frontExtra' },
  rearExtra: { label: 'Rear extra', group: 'Extras', game: 'rearExtra' },
  trunkExtra: { label: 'Trunk extra', group: 'Extras', game: 'trunkExtra' },
  headlights: { label: 'Headlights', group: 'Lights', game: 'headlights' },
  taillights: { label: 'Taillights', group: 'Lights', game: 'taillights' },
  wheel: { label: 'Wheel', group: 'Wheels', game: 'rims' },
  exhaust: { label: 'Exhaust tips', group: 'Exhaust', game: 'exhaust' },
  custom: { label: 'Custom', group: 'Other' },
};

export type ParamValue = number | string | boolean | number[][];
export type Params = Record<string, ParamValue>;

/** Which wheel a wheel part is; its position comes from the car's wheel settings. */
export type WheelPos = 'FL' | 'FR' | 'RL' | 'RR';

export interface Part {
  id: string;
  name: string;
  slot: SlotId;
  /** Moves / turns the whole part (car space). */
  pos: V3;
  rot: V3;
  shapes: Shape[];
  /** Made by a generator: shapes are rebuilt from these sliders. Remove it to edit the shapes by hand. */
  gen?: { type: string; params: Params };
  /** Linked copy: uses the shapes of another part (edit one, all follow). */
  link?: string;
  /** Wheel parts sit on the car's axles automatically. */
  wheel?: WheelPos;
  hidden?: boolean;
  locked?: boolean;
  /** Export the shapes as one Roblox Union (always true when the part has cut shapes). */
  union?: boolean;
  /** Left out of every export (for reference pieces). */
  noExport?: boolean;
}

/** Overall sizes. Generators and wheels follow these, so changing one reshapes the whole car. */
export interface CarParams {
  length: number;
  width: number;
  /** Bottom of the body above the ground. */
  floor: number;
  /** Top of the doors / bottom of the windows. */
  belt: number;
  roof: number;
  wheelbase: number;
  /** Distance from the car's centre to the middle of the front axle (negative = in front of centre). */
  axleOffset: number;
  trackF: number;
  trackR: number;
  wheelRadius: number;
  wheelWidthF: number;
  wheelWidthR: number;
}

/** Things the game spawns itself; exported as settings / model attributes. */
export interface GameSettings {
  carName: string;
  drivetrain: 'RWD' | 'FWD' | 'AWD';
  massKg: number;
  handling: string;
  rimStyle: string;
  rimFinish: string;
  exhaustLayout: string;
  exhaustShape: string;
  exhaustFinish: string;
  exhaustSide: number;
  underglow: string;
  boostTrail: string;
  aura: string;
  headlightColor: string;
  windowTint: string;
}

export interface RefImage {
  id: string;
  view: 'side' | 'front' | 'back' | 'top';
  dataUrl: string;
  /** Width of the image in studs, and its centre offset. */
  width: number;
  offset: [number, number];
  opacity: number;
  visible: boolean;
}

export interface Car {
  version: 2;
  name: string;
  params: CarParams;
  colors: Record<ColorSlot, string>;
  parts: Part[];
  game: GameSettings;
  refs?: RefImage[];
}

let counter = 0;
export function uid(prefix = 's'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Safe Roblox instance / file name. */
export function safeName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return s.length ? s : 'Part';
}

export const DEFAULT_COLORS: Record<ColorSlot, string> = {
  paint: '#e8e9ee',
  accent: '#2f6fe0',
  trim: '#18191e',
  chrome: '#c9ced6',
  glass: '#263448',
  light: '#fffaeb',
  tail: '#d21e30',
  rim: '#cfd3da',
  tyre: '#1e1e22',
  carbon: '#2a2b30',
};

export const DEFAULT_GAME: GameSettings = {
  carName: 'My Car',
  drivetrain: 'RWD',
  massKg: 1400,
  handling: 'R34',
  rimStyle: 'split5',
  rimFinish: 'chrome',
  exhaustLayout: 'dual',
  exhaustShape: 'round',
  exhaustFinish: 'steel',
  exhaustSide: 1,
  underglow: '',
  boostTrail: '',
  aura: '',
  headlightColor: '',
  windowTint: '',
};

export function newShape(kind: Kind, over: Partial<Shape> = {}): Shape {
  const size: V3 = kind === 'cylinder' ? [1, 1, 1] : kind === 'ball' ? [1, 1, 1] : [2, 1, 2];
  return {
    id: uid(),
    name: kind === 'block' ? 'Part' : KIND_LABELS[kind].replace(' ', ''),
    kind,
    size,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    color: '@paint',
    material: 'SmoothPlastic',
    ...over,
  };
}

export function newPart(slot: SlotId, name: string, over: Partial<Part> = {}): Part {
  return { id: uid('p'), name, slot, pos: [0, 0, 0], rot: [0, 0, 0], shapes: [], ...over };
}
