// Core data model. A car is a list of parts; a part is a list of simple shapes.
// Units are Roblox studs. Y is up, the car's front faces -Z (Roblox LookVector).

export type Vec3 = [number, number, number];

export const SHAPE_TYPES = [
  'box',
  'wedge',
  'cornerWedge',
  'chamferBox',
  'taperBox',
  'cylinder',
  'halfCylinder',
  'cone',
  'sphere',
  'tire',
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

export const SHAPE_LABELS: Record<ShapeType, string> = {
  box: 'Box',
  wedge: 'Wedge',
  cornerWedge: 'Corner wedge',
  chamferBox: 'Chamfer box',
  taperBox: 'Tapered box',
  cylinder: 'Cylinder',
  halfCylinder: 'Half cylinder',
  cone: 'Cone',
  sphere: 'Sphere',
  tire: 'Ring / tyre',
};

/** What a surface is made of. Decides its colour and which exported mesh it lands in. */
export const ROLES = ['paint', 'accent', 'trim', 'chrome', 'rim', 'tire', 'tip', 'glass', 'light', 'tail', 'glow'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  paint: 'Body paint',
  accent: 'Accent / stripes',
  trim: 'Black trim',
  chrome: 'Chrome / metal',
  rim: 'Rims',
  tire: 'Tyres',
  tip: 'Exhaust tips',
  glass: 'Window tint',
  light: 'Headlight colour',
  tail: 'Taillights',
  glow: 'Underglow',
};

export interface Shape {
  id: string;
  type: ShapeType;
  name?: string;
  /** Position relative to the part's pivot. */
  pos: Vec3;
  /** Euler rotation in degrees (XYZ order). */
  rot: Vec3;
  /** Full size along local X, Y, Z. */
  size: Vec3;
  /** Sides for cylinder-like shapes (3 to 32). */
  sides?: number;
  /** Chamfer box: edge cut as a fraction of the smallest side (0 to 0.5). */
  chamfer?: number;
  /** Tapered box: [top width scale, top length scale, top shift along Z as fraction of length]. Cone: [top radius scale]. */
  taper?: Vec3;
  /** Ring / tyre: inner radius as a fraction of the outer radius. */
  inner?: number;
  role: Role;
  /** Negate: cuts the other shapes in the same part instead of adding to them. */
  hole?: boolean;
  /** Adds a copy reflected across the car's centre line (world X = 0). */
  mirror?: boolean;
  /** Internal marker used by templates (for example wheel arches that follow the wheel settings). */
  tag?: string;
  hidden?: boolean;
}

export const SLOT_IDS = [
  'body',
  'hood',
  'frontBumper',
  'rearBumper',
  'sideSkirts',
  'spoiler',
  'hoodExtras',
  'roofExtras',
  'sideExtras',
  'frontExtras',
  'rearExtras',
  'trunkExtras',
  'headlights',
  'taillights',
  'rims',
  'tyres',
  'exhaust',
  'exhaustTips',
] as const;
export type SlotId = (typeof SLOT_IDS)[number];
/** Parts can also be free-form ("custom") or generated wheels. */
export type PartSlot = SlotId | 'wheel' | 'custom';

export interface Part {
  id: string;
  name: string;
  slot: PartSlot;
  variant: string;
  /** Part origin in car space. Exported as the mesh pivot, so it sits on the slot's mount point. */
  pivot: Vec3;
  shapes: Shape[];
  hidden?: boolean;
  locked?: boolean;
  /** Free-form parts: which slot of LAS's game they export to (game id, e.g. "roofExtra"). */
  gameSlot?: import('./customparts').GameCat;
}

export interface WheelSettings {
  radius: number;
  width: number;
  wheelbase: number;
  track: number;
}

export interface Effects {
  underglow: { on: boolean; brightness: number };
  boost: { style: 'none' | 'flame' | 'neon' | 'smoke' | 'rainbow'; color: string };
  aura: { style: 'none' | 'sparkles' | 'stars' | 'glow' | 'fire' | 'bubbles'; color: string };
  headlightBeams: boolean;
}

export interface Car {
  version: 1;
  name: string;
  base: string;
  choices: Record<SlotId, string>;
  wheels: WheelSettings;
  paint: Record<Role, string>;
  /** 0 = clear, 1 = solid. Applied to the glass meshes. */
  glassOpacity: number;
  /** Finish names exported as RimFinish / ExhaustFinish (they also set the rim and tip colours). */
  rimFinish: string;
  exhaustFinish: string;
  effects: Effects;
  parts: Part[];
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function cloneCar(car: Car): Car {
  return JSON.parse(JSON.stringify(car));
}

/** Safe mesh / instance name for Roblox and FBX. */
export function safeName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return s.length ? s : 'Part';
}
