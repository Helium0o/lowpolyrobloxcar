import type { Car, Kind, Params, Shape, SlotId, V3 } from '../types';

// Shape-building helpers for generators, modelled on the game's own CarKit / CarBodyKit helpers
// (k.B, k.slab, B.under, B.wedge, B.onSlope), so generated cars are built the same way LAS's cars are.
// Everything is in car space.

export type Opts = Partial<Pick<Shape, 'material' | 'transparency' | 'reflectance' | 'cut' | 'mirror' | 'repeat' | 'role'>>;

export class Kit {
  shapes: Shape[] = [];
  private n = 0;

  add(name: string, kind: Kind, size: V3, pos: V3, rot: V3 = [0, 0, 0], color = '@paint', o: Opts = {}): Shape {
    const s: Shape = {
      id: `g${this.n++}`,
      name,
      kind,
      size: size.map((v) => round(Math.max(0.02, Math.abs(v)))) as V3,
      pos: pos.map(round) as V3,
      rot: rot.map((v) => round(v)) as V3,
      color,
      material: o.material ?? 'SmoothPlastic',
    };
    if (o.transparency) s.transparency = o.transparency;
    if (o.reflectance) s.reflectance = o.reflectance;
    if (o.cut) s.cut = true;
    if (o.mirror) s.mirror = true;
    if (o.repeat) s.repeat = o.repeat;
    if (o.role) s.role = o.role;
    this.shapes.push(s);
    return s;
  }

  /** Block between two corners (like k.B). */
  box(name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color = '@paint', o: Opts = {}): Shape {
    return this.add(name, 'block', [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, 0], color, o);
  }

  /** Wedge filling under a sloped line (za, ya) -> (zb, yb) down to y0, across x0..x1 (like B.wedge). */
  wedge(name: string, x0: number, x1: number, y0: number, za: number, ya: number, zb: number, yb: number, color = '@paint', o: Opts = {}): Shape {
    const h = Math.max(ya, yb) - y0;
    // A Roblox wedge is tall at +Z. Turn it round when the tall end is at the front (-Z).
    return this.add(name, 'wedge', [Math.abs(x1 - x0), h, Math.abs(zb - za)], [(x0 + x1) / 2, y0 + h / 2, (za + zb) / 2], [0, ya > yb ? 180 : 0, 0], color, o);
  }

  /** Fill under a side-profile top line pts [[z, y], ...] front to back, from yb up (like B.under). */
  under(name: string, x0: number, x1: number, yb: number, pts: number[][], color = '@paint', o: Opts = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [za, ya] = pts[i], [zb, yb2] = pts[i + 1];
      if (zb - za <= 0.01) continue;
      const lo = Math.min(ya, yb2), hi = Math.max(ya, yb2);
      if (lo > yb + 0.01) this.box(name, x0, x1, yb, lo, za, zb, color, o);
      if (hi - lo > 0.02) this.wedge(name, x0, x1, Math.max(lo, yb), za, ya, zb, yb2, color, o);
    }
  }

  /** A slab whose top surface runs from (za, ya) to (zb, yb); thickness t (like k.slab). */
  slab(name: string, x0: number, x1: number, za: number, ya: number, zb: number, yb: number, t: number, off = 0, color = '@paint', o: Opts = {}): Shape {
    const L = Math.hypot(zb - za, yb - ya);
    const a = Math.atan2(yb - ya, zb - za); // rotation about X is -a
    const up: V3 = [0, Math.cos(a), -Math.sin(a)];
    const d = off - t / 2;
    const mid: V3 = [(x0 + x1) / 2, (ya + yb) / 2 + up[1] * d, (za + zb) / 2 + up[2] * d];
    return this.add(name, 'block', [Math.abs(x1 - x0), t, L], mid, [-a * (180 / Math.PI), 0, 0], color, o);
  }

  /** A cylinder whose axis runs along car Z (exhaust tips, round lamps facing front / back). */
  tubeZ(name: string, x: number, y: number, z: number, r: number, len: number, color = '@chrome', o: Opts = {}): Shape {
    return this.add(name, 'cylinder', [len, r * 2, r * 2], [x, y, z], [0, 90, 0], color, o);
  }
}

export const round = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

export const num = (p: Params, k: string, d = 0): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: Params, k: string, d = ''): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const bool = (p: Params, k: string, d = false): boolean => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);
export const pts = (p: Params, k: string): number[][] => (Array.isArray(p[k]) ? (p[k] as number[][]) : []);

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'bool' | 'color' | 'profile';
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
  /** Only shown when this returns true. */
  when?: (p: Params) => boolean;
  hint?: string;
}

export interface Preset {
  name: string;
  params: Params;
}

export interface Generator {
  type: string;
  label: string;
  slot: SlotId;
  /** Default part name (the Roblox name the game expects, where it has one). */
  partName: string;
  defs: ParamDef[];
  defaults(car: Car): Params;
  build(car: Car, p: Params): Shape[];
  presets?: Preset[];
  union?: boolean;
}

export const COLOR_OPTIONS: [string, string][] = [
  ['@paint', 'Paint'], ['@accent', 'Accent'], ['@trim', 'Black trim'], ['@carbon', 'Carbon'], ['@chrome', 'Chrome'],
];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
