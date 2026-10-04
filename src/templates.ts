import { uid, type Car, type Part, type Role, type Shape, type ShapeType, type SlotId, type Vec3, type WheelSettings } from './model';

// Built-in templates. Every body base exposes the same mount points, and every part is
// generated from the base's measurements, so any hood fits any body, any bumper fits any
// base, and so on. Parts are made of a handful of boxes and wedges to keep the blocky
// Roblox look.

// ---------- helpers ----------

type Extra = Partial<Omit<Shape, 'id' | 'type' | 'pos' | 'size' | 'role'>>;
function sh(type: ShapeType, pos: Vec3, size: Vec3, role: Role, extra: Extra = {}): Shape {
  return { id: uid('s'), type, pos, rot: [0, 0, 0], size, role, ...extra };
}
const box = (pos: Vec3, size: Vec3, role: Role, extra: Extra = {}) => sh('box', pos, size, role, extra);
const deg = (r: number) => (r * 180) / Math.PI;

// ---------- body bases ----------

export interface BaseSpec {
  id: string;
  name: string;
  length: number;
  width: number;
  /** Underside of the body above the ground. */
  bottom: number;
  /** Top of the lower body (where the hood / trunk lid sit). */
  belt: number;
  roof: number;
  /** Z where the windscreen starts and the rear window ends (front is -Z). */
  cabFront: number;
  cabBack: number;
  /** Cabin top size as a fraction of its base, and how far the top is shifted back. */
  topX: number;
  topZ: number;
  topShift: number;
  wheels: WheelSettings;
  spoilerOnRoof?: boolean;
  bed?: boolean;
  /** Painted cabin with window panels (vans). */
  boxy?: boolean;
}

// Sizes follow LAS's game cars (R34: 16.55 x 6.2 studs, roof 4.68, wheel radius 1.17).
export const BASES: BaseSpec[] = [
  { id: 'hatchback', name: 'Hatchback', length: 14.6, width: 6.0, bottom: 0.5, belt: 2.9, roof: 4.75, cabFront: -2.4, cabBack: 6.1, topX: 0.86, topZ: 0.62, topShift: 0.12, spoilerOnRoof: true, wheels: { radius: 1.05, width: 0.75, wheelbase: 8.9, track: 5.1 } },
  { id: 'sedan', name: 'Sedan', length: 16.5, width: 6.2, bottom: 0.5, belt: 3.0, roof: 4.75, cabFront: -2.2, cabBack: 4.4, topX: 0.88, topZ: 0.58, topShift: 0.04, wheels: { radius: 1.17, width: 0.95, wheelbase: 9.5, track: 5.3 } },
  { id: 'coupe', name: 'Sports coupe', length: 16, width: 6.5, bottom: 0.45, belt: 2.6, roof: 4.3, cabFront: -1.6, cabBack: 4.0, topX: 0.86, topZ: 0.5, topShift: 0.1, wheels: { radius: 1.15, width: 0.85, wheelbase: 9.1, track: 5.35 } },
  { id: 'supercar', name: 'Supercar', length: 15, width: 6.4, bottom: 0.4, belt: 2.4, roof: 4.05, cabFront: -2.6, cabBack: 2.8, topX: 0.8, topZ: 0.45, topShift: 0.05, wheels: { radius: 1.1, width: 0.85, wheelbase: 8.9, track: 5.1 } },
  { id: 'muscle', name: 'Muscle car', length: 16.6, width: 6.8, bottom: 0.5, belt: 2.9, roof: 4.45, cabFront: -0.6, cabBack: 4.6, topX: 0.88, topZ: 0.6, topShift: 0.06, wheels: { radius: 1.23, width: 0.95, wheelbase: 9.8, track: 5.5 } },
  { id: 'suv', name: 'SUV', length: 16.5, width: 6.8, bottom: 1.0, belt: 3.6, roof: 6.0, cabFront: -3.0, cabBack: 7.6, topX: 0.9, topZ: 0.82, topShift: 0.06, spoilerOnRoof: true, wheels: { radius: 1.45, width: 1.0, wheelbase: 10, track: 5.8 } },
  { id: 'pickup', name: 'Pickup', length: 18, width: 6.8, bottom: 1.0, belt: 3.6, roof: 5.9, cabFront: -3.2, cabBack: 1.4, topX: 0.9, topZ: 0.72, topShift: 0.08, bed: true, wheels: { radius: 1.45, width: 1.0, wheelbase: 11, track: 5.8 } },
  { id: 'van', name: 'Van', length: 16.5, width: 6.6, bottom: 0.8, belt: 3.2, roof: 6.8, cabFront: -5.8, cabBack: 8.1, topX: 0.94, topZ: 0.86, topShift: 0.07, boxy: true, spoilerOnRoof: true, wheels: { radius: 1.25, width: 0.95, wheelbase: 10.4, track: 5.6 } },
  { id: 'kart', name: 'Kart / buggy', length: 9, width: 5, bottom: 0.4, belt: 1.3, roof: 1.3, cabFront: -1, cabBack: 2.2, topX: 1, topZ: 1, topShift: 0, wheels: { radius: 0.9, width: 0.9, wheelbase: 6.2, track: 4.6 } },
];

export function baseSpec(id: string): BaseSpec {
  return BASES.find((b) => b.id === id) ?? BASES[1];
}

/** Measurements every generator works from. All positions are in car space. */
export interface Ctx {
  spec: BaseSpec;
  w: WheelSettings;
  L: number;
  W: number;
  bottom: number;
  belt: number;
  roof: number;
  frontZ: number;
  rearZ: number;
  cabW: number;
  cabLen: number;
  cabZ: number;
  topW: number;
  topL: number;
  topZc: number;
  hoodL: number;
  hoodW: number;
  trunkL: number;
  bumperH: number;
  kart: boolean;
  mounts: Record<Exclude<SlotId, 'rims' | 'tyres'>, Vec3>;
}

export function makeCtx(spec: BaseSpec, w: WheelSettings): Ctx {
  const L = spec.length, W = spec.width;
  const frontZ = -L / 2, rearZ = L / 2;
  const cabW = W - 0.6;
  const cabLen = spec.cabBack - spec.cabFront;
  const cabZ = (spec.cabBack + spec.cabFront) / 2;
  const topW = cabW * spec.topX, topL = cabLen * spec.topZ;
  const topZc = cabZ + spec.topShift * cabLen;
  const hoodL = Math.max(1, spec.cabFront - frontZ - 0.5);
  const trunkL = Math.max(0.6, rearZ - spec.cabBack - 0.3);
  const kart = spec.id === 'kart';
  const hoodZ = (frontZ + spec.cabFront) / 2;
  const trunkZ = (spec.cabBack + rearZ) / 2;
  const spoiler: Vec3 = spec.spoilerOnRoof ? [0, spec.roof, topZc + topL / 2 - 0.3] : [0, spec.belt, rearZ - 0.7];
  return {
    spec, w, L, W, frontZ, rearZ, cabW, cabLen, cabZ, topW, topL, topZc, hoodL, trunkL, kart,
    bottom: spec.bottom, belt: spec.belt, roof: spec.roof,
    hoodW: W - 0.8,
    bumperH: (spec.belt - spec.bottom) * 0.45,
    mounts: {
      body: [0, 0, 0],
      hood: [0, spec.belt, hoodZ],
      hoodExtras: [0, spec.belt + 0.2, hoodZ],
      frontBumper: [0, spec.bottom, frontZ],
      rearBumper: [0, spec.bottom, rearZ],
      sideSkirts: [0, spec.bottom, 0],
      spoiler,
      roofExtras: [0, spec.roof, topZc],
      sideExtras: [0, spec.belt, 0],
      frontExtras: [0, spec.bottom, frontZ],
      rearExtras: [0, spec.bottom, rearZ],
      trunkExtras: [0, spec.belt, trunkZ],
      headlights: [0, spec.belt - 0.55, frontZ],
      taillights: [0, spec.belt - 0.55, rearZ],
      exhaust: [0, spec.bottom + 0.35, rearZ],
      exhaustTips: [0, spec.bottom + 0.35, rearZ],
    },
  };
}

function bodyShapes(c: Ctx): Shape[] {
  const { W, L, bottom, belt, roof, w } = c;
  const s = c.spec;
  const out: Shape[] = [];
  const lowerH = belt - bottom;
  out.push(box([0, bottom + lowerH / 2, 0], [W, lowerH, L], 'paint', { name: 'Lower body' }));
  if (c.kart) {
    out.push(box([0, belt + 0.05, c.cabZ + 0.4], [2.4, 0.1, 2.6], 'trim', { name: 'Seat base' }));
    out.push(box([0, belt + 0.9, c.cabZ + 1.6], [2.4, 1.7, 0.4], 'trim', { name: 'Seat back' }));
    out.push(sh('cylinder', [0, belt + 0.7, c.cabZ - 1.5], [1.4, 0.15, 1.4], 'trim', { name: 'Steering wheel', rot: [60, 0, 0], sides: 10 }));
    out.push(box([0, belt + 0.25, c.cabZ + 0.6], [3.4, 0.5, 4], 'paint', { name: 'Cockpit cut', hole: true }));
  }
  if (s.bed) {
    const z0 = s.cabBack + 0.3, z1 = c.rearZ - 0.4;
    out.push(box([0, belt - 0.75 + 0.06, (z0 + z1) / 2], [W - 0.8, 1.5, z1 - z0], 'paint', { name: 'Bed cut', hole: true }));
  }
  // Wheel arches follow the wheel settings (see updateArches).
  for (const z of [-w.wheelbase / 2, w.wheelbase / 2]) out.push(archShape(c, z));

  if (!c.kart) {
    const cabH = roof - belt - 0.25;
    const cabY = belt + cabH / 2;
    const topZ = c.topZc;
    if (s.boxy) {
      out.push(sh('taperBox', [0, cabY, c.cabZ], [c.cabW, cabH, c.cabLen], 'paint', { name: 'Cabin', taper: [s.topX, s.topZ, s.topShift] }));
      // Windscreen panel on the sloped front face.
      const frontBottom = c.cabZ - c.cabLen / 2, frontTop = topZ - c.topL / 2;
      const ang = Math.atan2(frontTop - frontBottom, cabH);
      const len = Math.hypot(frontTop - frontBottom, cabH) * 0.72;
      const midZ = (frontBottom + frontTop) / 2, midY = cabY + 0.15;
      out.push(box([0, midY, midZ - 0.04], [c.cabW * 0.82, len, 0.1], 'glass', { name: 'Windscreen', rot: [deg(ang), 0, 0] }));
      // Side windows near the front.
      out.push(pillarLike(c, cabH, frontBottom + 2.4, [0.1, 0.5, 2.6], 'glass', 'Side window', 0.55));
    } else {
      out.push(sh('taperBox', [0, cabY, c.cabZ], [c.cabW, cabH, c.cabLen], 'glass', { name: 'Cabin glass', taper: [s.topX, s.topZ, s.topShift] }));
      out.push(box([0, roof - 0.125, topZ], [c.topW + 0.02, 0.25, c.topL + 0.02], 'paint', { name: 'Roof' }));
      out.push(box([0, belt + 0.05, c.cabZ], [c.cabW + 0.06, 0.1, c.cabLen + 0.06], 'trim', { name: 'Window line' }));
      out.push(pillarLike(c, cabH, topZ, [0.16, 1, 0.45], 'paint', 'B pillar', 1));
    }
  }
  // Grille background between the headlights.
  out.push(box([0, belt - 0.55, c.frontZ - 0.03], [W * 0.34, lowerH * 0.32, 0.08], 'trim', { name: 'Grille' }));
  return out;
}

/** A thin panel leaning in with the cabin's side slope (pillars, side windows). */
function pillarLike(c: Ctx, cabH: number, z: number, size: Vec3, role: Role, name: string, heightFrac: number): Shape {
  const bx = c.cabW / 2, tx = c.topW / 2;
  const ang = Math.atan2(bx - tx, cabH);
  const h = Math.hypot(bx - tx, cabH) * heightFrac;
  const y = c.belt + cabH * 0.5 + (heightFrac < 1 ? cabH * 0.08 : 0);
  const x = (bx + tx) / 2 + size[0] / 2 - 0.02;
  return box([x, y, z], [size[0], h, size[2]], role, { name, rot: [0, 0, deg(ang)], mirror: true });
}

function archShape(c: Ctx, z: number): Shape {
  const r = c.w.radius + 0.3;
  return sh('cylinder', [c.W / 2, c.w.radius, z], [r * 2, 2.6, r * 2], 'paint', {
    name: z < 0 ? 'Front arch' : 'Rear arch', rot: [0, 0, 90], sides: 12, hole: true, mirror: true, tag: 'arch',
  });
}

/** Moves the body's wheel arches to match new wheel settings without touching user edits. */
export function updateArches(body: Part, c: Ctx) {
  const arches = body.shapes.filter((s) => s.tag === 'arch');
  const zs = [-c.w.wheelbase / 2, c.w.wheelbase / 2];
  arches.forEach((a, i) => {
    const n = archShape(c, zs[i % 2]);
    a.pos = n.pos;
    a.size = n.size;
  });
}

// ---------- slot parts ----------

export interface Variant {
  id: string;
  name: string;
  build: (c: Ctx) => Shape[];
}

const none: Variant = { id: 'none', name: 'None', build: () => [] };

const HOODS: Variant[] = [
  { id: 'flat', name: 'Flat', build: (c) => [box([0, 0.1, 0], [c.hoodW, 0.2, c.hoodL], 'paint')] },
  {
    id: 'vented', name: 'Vented', build: (c) => {
      const out = [box([0, 0.1, 0], [c.hoodW, 0.2, c.hoodL], 'paint')];
      for (let i = 0; i < 4; i++) out.push(box([c.hoodW * 0.26, 0.22, -c.hoodL * 0.15 + i * 0.32], [c.hoodW * 0.2, 0.06, 0.16], 'trim', { mirror: true }));
      return out;
    },
  },
  {
    id: 'scoop', name: 'Scoop', build: (c) => [
      box([0, 0.1, 0], [c.hoodW, 0.2, c.hoodL], 'paint'),
      sh('taperBox', [0, 0.38, 0.1], [c.hoodW * 0.32, 0.36, c.hoodL * 0.45], 'paint', { taper: [0.85, 0.7, 0.12] }),
      box([0, 0.38, 0.1 - c.hoodL * 0.2], [c.hoodW * 0.24, 0.22, 0.06], 'trim'),
    ],
  },
  {
    id: 'bulge', name: 'Raised bulge', build: (c) => [
      box([0, 0.1, 0], [c.hoodW, 0.2, c.hoodL], 'paint'),
      sh('taperBox', [0, 0.32, 0.1], [c.hoodW * 0.46, 0.24, c.hoodL * 0.85], 'paint', { taper: [0.7, 0.85, 0.04] }),
    ],
  },
  {
    id: 'carbon', name: 'Carbon', build: (c) => [
      box([0, 0.1, 0], [c.hoodW, 0.2, c.hoodL], 'trim'),
      box([0, 0.205, 0], [0.06, 0.02, c.hoodL * 0.96], 'chrome'),
    ],
  },
];

const FRONT_BUMPERS: Variant[] = [
  {
    id: 'stock', name: 'Stock', build: (c) => [
      box([0, c.bumperH / 2, -0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([0, c.bumperH * 0.45, -0.52], [c.W * 0.45, c.bumperH * 0.4, 0.06], 'trim'),
    ],
  },
  {
    id: 'sport', name: 'Sport splitter', build: (c) => [
      box([0, c.bumperH / 2, -0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([0, c.bumperH * 0.5, -0.52], [c.W * 0.4, c.bumperH * 0.45, 0.06], 'trim'),
      box([c.W * 0.37, c.bumperH * 0.5, -0.52], [c.W * 0.14, c.bumperH * 0.35, 0.06], 'trim', { mirror: true }),
      box([0, 0.06, -0.55], [c.W + 0.2, 0.12, 1.1], 'trim'),
    ],
  },
  {
    id: 'offroad', name: 'Off-road', build: (c) => [
      box([0, c.bumperH / 2, -0.3], [c.W + 0.2, c.bumperH, 0.6], 'trim'),
      box([c.W * 0.3, c.bumperH * 0.3, -0.7], [0.3, 0.3, 0.3], 'accent', { mirror: true }),
    ],
  },
  {
    id: 'rally', name: 'Rally', build: (c) => [
      box([0, c.bumperH / 2, -0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([0, c.bumperH * 0.45, -0.52], [c.W * 0.4, c.bumperH * 0.4, 0.06], 'trim'),
      sh('cylinder', [c.W * 0.34, c.bumperH * 0.5, -0.58], [0.6, 0.16, 0.6], 'light', { rot: [90, 0, 0], sides: 10, mirror: true }),
      box([0, 0.04, -0.4], [c.W * 0.8, 0.08, 0.6], 'chrome'),
    ],
  },
  {
    id: 'timeattack', name: 'Time attack', build: (c) => [
      box([0, c.bumperH / 2, -0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([0, c.bumperH * 0.45, -0.52], [c.W * 0.6, c.bumperH * 0.5, 0.06], 'trim'),
      box([0, 0.06, -0.9], [c.W + 0.8, 0.12, 1.8], 'trim'),
      sh('wedge', [c.W / 2 - 0.1, c.bumperH * 0.8, -0.6], [0.6, 0.12, 0.7], 'trim', { mirror: true }),
    ],
  },
];

const REAR_BUMPERS: Variant[] = [
  {
    id: 'stock', name: 'Stock', build: (c) => [
      box([0, c.bumperH / 2, 0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([0, c.bumperH * 0.3, 0.51], [c.W * 0.8, 0.12, 0.04], 'trim'),
    ],
  },
  {
    id: 'diffuser', name: 'Diffuser', build: (c) => {
      const out = [box([0, c.bumperH / 2, 0.25], [c.W, c.bumperH, 0.5], 'paint'), box([0, 0.15, 0.55], [c.W * 0.7, 0.3, 0.6], 'trim')];
      for (const x of [-0.75, -0.25, 0.25, 0.75]) out.push(box([x * c.W * 0.4, 0.3, 0.75], [0.08, 0.5, 0.5], 'trim'));
      return out;
    },
  },
  {
    id: 'step', name: 'Step (trucks)', build: (c) => [
      box([0, c.bumperH / 2, 0.25], [c.W, c.bumperH, 0.5], 'chrome'),
      box([0, c.bumperH * 0.2, 0.7], [c.W * 0.4, 0.18, 0.5], 'trim'),
    ],
  },
  {
    id: 'sport', name: 'Sport', build: (c) => [
      box([0, c.bumperH / 2, 0.25], [c.W, c.bumperH, 0.5], 'paint'),
      box([c.W * 0.34, c.bumperH * 0.45, 0.51], [c.W * 0.18, c.bumperH * 0.3, 0.04], 'trim', { mirror: true }),
      box([c.W * 0.46, c.bumperH * 0.75, 0.51], [0.3, 0.12, 0.04], 'tail', { mirror: true }),
    ],
  },
];

const SKIRTS: Variant[] = [
  none,
  { id: 'sport', name: 'Sport', build: (c) => [box([c.W / 2 + 0.12, 0.22, 0], [0.24, 0.44, skirtLen(c)], 'paint', { mirror: true })] },
  {
    id: 'sliders', name: 'Rock sliders', build: (c) => [
      sh('cylinder', [c.W / 2 + 0.2, 0.05, 0], [0.32, skirtLen(c), 0.32], 'chrome', { rot: [90, 0, 0], sides: 8, mirror: true }),
      box([c.W / 2 + 0.08, 0.15, -skirtLen(c) * 0.3], [0.24, 0.2, 0.2], 'trim', { mirror: true }),
      box([c.W / 2 + 0.08, 0.15, skirtLen(c) * 0.3], [0.24, 0.2, 0.2], 'trim', { mirror: true }),
    ],
  },
  {
    id: 'wide', name: 'Wide', build: (c) => [
      box([c.W / 2 + 0.25, 0.3, 0], [0.5, 0.6, skirtLen(c)], 'paint', { mirror: true }),
      box([c.W / 2 + 0.3, 0.03, 0], [0.6, 0.06, skirtLen(c)], 'trim', { mirror: true }),
    ],
  },
];
function skirtLen(c: Ctx) {
  return Math.max(1, c.w.wheelbase - c.w.radius * 2 - 0.9);
}

const SPOILERS: Variant[] = [
  none,
  { id: 'lip', name: 'Lip', build: (c) => [sh('wedge', [0, 0.1, 0.35], [c.W * 0.85, 0.2, 0.6], 'paint')] },
  { id: 'ducktail', name: 'Ducktail', build: (c) => [sh('wedge', [0, 0.22, 0.2], [c.W * 0.9, 0.45, 1.1], 'paint')] },
  {
    id: 'gt', name: 'GT wing', build: (c) => {
      const h = c.spec.spoilerOnRoof ? 0.45 : 0.95;
      return [
        box([c.W * 0.28, h / 2, 0], [0.14, h, 0.45], 'trim', { mirror: true }),
        box([0, h + 0.06, 0.05], [c.W * 0.92, 0.12, 0.95], 'accent', { rot: [-6, 0, 0] }),
        box([c.W * 0.46 + 0.04, h + 0.12, 0.05], [0.08, 0.5, 1.05], 'accent', { mirror: true }),
      ];
    },
  },
  {
    id: 'drag', name: 'Tall drag wing', build: (c) => {
      const h = c.spec.spoilerOnRoof ? 0.8 : 1.7;
      return [
        box([c.W * 0.3, h / 2, 0.1], [0.12, h, 0.3], 'chrome', { rot: [-10, 0, 0], mirror: true }),
        box([0, h + 0.05, 0.25], [c.W * 0.85, 0.1, 1.2], 'paint', { rot: [-10, 0, 0] }),
        box([c.W * 0.425 + 0.04, h + 0.15, 0.25], [0.08, 0.6, 1.3], 'trim', { mirror: true }),
      ];
    },
  },
];

const HOOD_EXTRAS: Variant[] = [
  none,
  { id: 'stripes', name: 'Racing stripes', build: (c) => [box([c.hoodW * 0.11, 0.01, 0], [c.hoodW * 0.16, 0.02, c.hoodL], 'accent', { mirror: true })] },
  { id: 'pins', name: 'Hood pins', build: (c) => [sh('cylinder', [c.hoodW * 0.36, 0.04, -c.hoodL * 0.4], [0.22, 0.08, 0.22], 'chrome', { sides: 8, mirror: true })] },
  {
    id: 'blower', name: 'Blower', build: (c) => [
      sh('taperBox', [0, 0.3, 0.1], [c.hoodW * 0.3, 0.6, c.hoodL * 0.32], 'chrome', { taper: [0.85, 0.85, 0] }),
      box([0, 0.75, 0.05], [c.hoodW * 0.22, 0.3, c.hoodL * 0.2], 'trim'),
    ],
  },
  {
    id: 'vents', name: 'Vents', build: (c) => {
      const out: Shape[] = [];
      for (let i = 0; i < 5; i++) out.push(box([0, 0.03, -c.hoodL * 0.1 + i * 0.25], [c.hoodW * 0.3, 0.06, 0.12], 'trim'));
      return out;
    },
  },
];

const ROOF_EXTRAS: Variant[] = [
  none,
  {
    id: 'rack', name: 'Roof rack', build: (c) => {
      const out = [sh('cylinder', [c.topW * 0.4, 0.3, 0], [0.12, c.topL * 0.9, 0.12], 'trim', { rot: [90, 0, 0], sides: 6, mirror: true })];
      for (const f of [-0.35, 0, 0.35]) out.push(box([0, 0.3, f * c.topL], [c.topW * 0.8, 0.08, 0.12], 'trim'));
      out.push(box([c.topW * 0.4, 0.13, -c.topL * 0.4], [0.12, 0.26, 0.12], 'trim', { mirror: true }));
      out.push(box([c.topW * 0.4, 0.13, c.topL * 0.4], [0.12, 0.26, 0.12], 'trim', { mirror: true }));
      return out;
    },
  },
  {
    id: 'lightbar', name: 'Light bar', build: (c) => [
      box([0, 0.12, -c.topL * 0.35], [c.topW * 0.75, 0.24, 0.35], 'trim'),
      box([c.topW * 0.12, 0.14, -c.topL * 0.35 - 0.17], [0.4, 0.16, 0.04], 'light', { mirror: true }),
      box([c.topW * 0.28, 0.14, -c.topL * 0.35 - 0.17], [0.4, 0.16, 0.04], 'light', { mirror: true }),
    ],
  },
  {
    id: 'police', name: 'Police lights', build: (c) => [
      box([0, 0.08, 0], [c.topW * 0.7, 0.16, 0.5], 'trim'),
      box([-c.topW * 0.18, 0.25, 0], [c.topW * 0.32, 0.2, 0.42], 'tail'),
      box([c.topW * 0.18, 0.25, 0], [c.topW * 0.32, 0.2, 0.42], 'accent'),
    ],
  },
  {
    id: 'scoop', name: 'Roof scoop', build: (c) => [
      sh('taperBox', [0, 0.2, 0], [c.topW * 0.35, 0.4, c.topL * 0.5], 'paint', { taper: [0.9, 0.6, 0.15] }),
      box([0, 0.22, -c.topL * 0.22], [c.topW * 0.26, 0.24, 0.05], 'trim'),
    ],
  },
  { id: 'stripes', name: 'Roof stripes', build: (c) => [box([c.topW * 0.11, 0.01, 0], [c.topW * 0.16, 0.02, c.topL], 'accent', { mirror: true })] },
];

const SIDE_EXTRAS: Variant[] = [
  none,
  {
    id: 'mirrors', name: 'Mirrors', build: (c) => [
      box([c.cabW / 2 + 0.05, 0.3, c.spec.cabFront + 0.9], [0.3, 0.1, 0.2], 'trim', { name: 'MirrorArm', mirror: true }),
      box([c.cabW / 2 + 0.38, 0.38, c.spec.cabFront + 0.9], [0.5, 0.36, 0.3], 'paint', { name: 'Mirror', mirror: true }),
    ],
  },
  { id: 'stripe', name: 'Side stripe', build: (c) => [box([c.W / 2 + 0.01, -0.5, 0], [0.04, 0.14, c.L * 0.86], 'accent', { mirror: true })] },
  {
    id: 'gills', name: 'Side vents', build: (c) => {
      const out: Shape[] = [];
      const z0 = -c.w.wheelbase / 2 + c.w.radius + 0.7;
      for (let i = 0; i < 6; i++) out.push(box([c.W / 2 + 0.01, -1.1, z0 + i * 0.32], [0.04, 0.8, 0.14], 'accent', { rot: [-25, 0, 0], mirror: true }));
      return out;
    },
  },
  {
    id: 'handles', name: 'Door handles', build: (c) => [
      box([c.W / 2 + 0.04, -0.35, c.cabZ - 0.3], [0.08, 0.1, 0.45], 'chrome', { mirror: true }),
      box([c.W / 2 + 0.01, -1.0, c.cabZ + 0.4], [0.03, lowerHeight(c) * 0.75, 0.04], 'trim', { mirror: true }),
    ],
  },
];
function lowerHeight(c: Ctx) {
  return c.belt - c.bottom;
}

const FRONT_EXTRAS: Variant[] = [
  none,
  { id: 'plate', name: 'Number plate', build: (c) => [box([0, c.bumperH * 0.45, -0.56], [1.6, 0.45, 0.04], 'chrome')] },
  {
    id: 'bullbar', name: 'Bull bar', build: (c) => [
      sh('cylinder', [c.W * 0.3, c.bumperH + 0.4, -0.8], [0.16, c.bumperH + 0.9, 0.16], 'chrome', { sides: 6, mirror: true }),
      sh('cylinder', [0, c.bumperH + 0.85, -0.8], [0.16, c.W * 0.6, 0.16], 'chrome', { rot: [0, 0, 90], sides: 6 }),
      sh('cylinder', [0, c.bumperH * 0.4, -0.8], [0.16, c.W * 0.6, 0.16], 'chrome', { rot: [0, 0, 90], sides: 6 }),
    ],
  },
  { id: 'canards', name: 'Canards', build: (c) => [sh('wedge', [c.W / 2 - 0.15, c.bumperH * 0.75, -0.35], [0.5, 0.1, 0.5], 'trim', { mirror: true })] },
  { id: 'fog', name: 'Fog lights', build: (c) => [sh('cylinder', [c.W * 0.36, c.bumperH * 0.35, -0.52], [0.45, 0.08, 0.45], 'light', { rot: [90, 0, 0], sides: 10, mirror: true })] },
  { id: 'towhook', name: 'Tow hook', build: (c) => [box([c.W * 0.25, c.bumperH * 0.2, -0.6], [0.25, 0.25, 0.25], 'accent')] },
];

const REAR_EXTRAS: Variant[] = [
  none,
  { id: 'plate', name: 'Number plate', build: (c) => [box([0, c.bumperH * 0.55, 0.52], [1.6, 0.45, 0.04], 'chrome')] },
  {
    id: 'hitch', name: 'Tow hitch', build: (c) => [
      box([0, 0.15, 0.8], [0.3, 0.2, 0.7], 'trim'),
      sh('sphere', [0, 0.38, 1.05], [0.3, 0.3, 0.3], 'chrome', { sides: 8 }),
    ],
  },
  {
    id: 'spare', name: 'Spare tyre', build: (c) => [
      sh('tire', [0, c.bumperH + 1.3, 0.35], [2.2, 0.6, 2.2], 'tire', { rot: [90, 0, 0], sides: 12, inner: 0.6 }),
      sh('cylinder', [0, c.bumperH + 1.3, 0.35], [1.35, 0.45, 1.35], 'rim', { rot: [90, 0, 0], sides: 12 }),
    ],
  },
  { id: 'canards', name: 'Rear canards', build: (c) => [sh('wedge', [c.W / 2 - 0.15, c.bumperH * 0.8, 0.4], [0.5, 0.1, 0.5], 'trim', { rot: [0, 180, 0], mirror: true })] },
];

const TRUNK_EXTRAS: Variant[] = [
  none,
  { id: 'stripes', name: 'Trunk stripes', build: (c) => [box([c.hoodW * 0.11, 0.21, 0], [c.hoodW * 0.16, 0.02, c.trunkL], 'accent', { mirror: true })] },
  { id: 'badge', name: 'Badge', build: (c) => [box([0, 0.03, c.trunkL / 2 - 0.3], [0.8, 0.06, 0.25], 'chrome')] },
  {
    id: 'rack', name: 'Luggage rack', build: (c) => [
      sh('cylinder', [c.W * 0.25, 0.12, 0], [0.1, c.trunkL * 0.8, 0.1], 'chrome', { rot: [90, 0, 0], sides: 6, mirror: true }),
      box([0, 0.12, -c.trunkL * 0.3], [c.W * 0.5, 0.06, 0.1], 'chrome'),
      box([0, 0.12, c.trunkL * 0.3], [c.W * 0.5, 0.06, 0.1], 'chrome'),
    ],
  },
  { id: 'antenna', name: 'Antenna', build: (c) => [sh('cylinder', [c.W * 0.35, 0.8, c.trunkL * 0.2], [0.05, 1.6, 0.05], 'trim', { sides: 4 })] },
];

const HEADLIGHTS: Variant[] = [
  {
    id: 'quad', name: 'Quad round', build: (c) => [
      box([c.W * 0.32, 0, -0.05], [c.W * 0.3, 0.6, 0.1], 'trim', { mirror: true }),
      sh('cylinder', [c.W * 0.25, 0, -0.12], [0.42, 0.06, 0.42], 'light', { rot: [90, 0, 0], sides: 10, mirror: true }),
      sh('cylinder', [c.W * 0.39, 0, -0.12], [0.42, 0.06, 0.42], 'light', { rot: [90, 0, 0], sides: 10, mirror: true }),
    ],
  },
  {
    id: 'square', name: 'Square', build: (c) => [
      box([c.W * 0.33, 0, -0.05], [c.W * 0.26, 0.55, 0.1], 'trim', { mirror: true }),
      box([c.W * 0.33, 0, -0.11], [c.W * 0.22, 0.42, 0.04], 'light', { mirror: true }),
    ],
  },
  { id: 'slim', name: 'Slim LED', build: (c) => [box([c.W * 0.34, 0.15, -0.05], [c.W * 0.28, 0.16, 0.1], 'light', { mirror: true })] },
  {
    id: 'round', name: 'Round', build: (c) => [
      sh('cylinder', [c.W * 0.34, 0, -0.06], [0.7, 0.12, 0.7], 'chrome', { rot: [90, 0, 0], sides: 12, mirror: true }),
      sh('cylinder', [c.W * 0.34, 0, -0.13], [0.55, 0.04, 0.55], 'light', { rot: [90, 0, 0], sides: 12, mirror: true }),
    ],
  },
  {
    id: 'popup', name: 'Pop-up (closed)', build: (c) => [
      box([c.W * 0.3, 0.62, 0.45], [c.W * 0.24, 0.1, 0.8], 'paint', { mirror: true }),
      box([c.W * 0.3, 0.2, -0.04], [c.W * 0.22, 0.12, 0.08], 'light', { mirror: true }),
    ],
  },
];

const TAILLIGHTS: Variant[] = [
  { id: 'bar', name: 'Light bar', build: (c) => [box([0, 0, 0.05], [c.W * 0.86, 0.26, 0.1], 'tail')] },
  {
    id: 'square', name: 'Square', build: (c) => [
      box([c.W * 0.36, 0, 0.05], [c.W * 0.22, 0.5, 0.1], 'trim', { mirror: true }),
      box([c.W * 0.36, 0, 0.11], [c.W * 0.18, 0.38, 0.04], 'tail', { mirror: true }),
    ],
  },
  {
    id: 'round', name: 'Round twin', build: (c) => [
      sh('cylinder', [c.W * 0.3, 0, 0.06], [0.48, 0.1, 0.48], 'tail', { rot: [90, 0, 0], sides: 10, mirror: true }),
      sh('cylinder', [c.W * 0.41, 0, 0.06], [0.48, 0.1, 0.48], 'tail', { rot: [90, 0, 0], sides: 10, mirror: true }),
    ],
  },
  { id: 'slim', name: 'Slim', build: (c) => [box([c.W * 0.36, 0.1, 0.05], [c.W * 0.24, 0.14, 0.1], 'tail', { mirror: true })] },
];


// Exhausts define where their outlets are; tips are placed on those outlets.
// Layout and tip ids match LAS's game (ExhaustLayout / ExhaustShape attributes).
export interface Outlet {
  p: Vec3;
  dir: 'back' | 'up';
}
interface ExhaustVariant extends Variant {
  outlets: (c: Ctx) => Outlet[];
}

const pipe = (x: number, y = 0, len = 2.2): Shape => sh('cylinder', [x, y, -len / 2 + 0.15], [0.3, len, 0.3], 'trim', { rot: [90, 0, 0], sides: 8 });
const back = (x: number, y = 0): Outlet => ({ p: [x, y, 0.15], dir: 'back' });

const EXHAUSTS: ExhaustVariant[] = [
  { id: 'single', name: 'Single', outlets: (c) => [back(c.W * 0.3)], build: (c) => [pipe(c.W * 0.3)] },
  { id: 'dual', name: 'Dual', outlets: (c) => [back(-c.W * 0.3), back(c.W * 0.3)], build: (c) => [{ ...pipe(c.W * 0.3), mirror: true }] },
  { id: 'dualSide', name: 'Dual, one side', outlets: (c) => [back(c.W * 0.24), back(c.W * 0.36)], build: (c) => [pipe(c.W * 0.24), pipe(c.W * 0.36)] },
  {
    id: 'quad', name: 'Quad', outlets: (c) => [-1, 1].flatMap((s) => [back(s * c.W * 0.24), back(s * c.W * 0.36)]),
    build: (c) => [{ ...pipe(c.W * 0.24), mirror: true }, { ...pipe(c.W * 0.36), mirror: true }],
  },
  {
    id: 'centerQuad', name: 'Centre quad', outlets: () => [-1, 1].flatMap((s) => [back(s * 0.3, 0.1), back(s * 0.75, 0.1)]),
    build: () => [{ ...pipe(0.3, 0.1), mirror: true }, { ...pipe(0.75, 0.1), mirror: true }],
  },
  {
    id: 'sidePipes', name: 'Side pipes', outlets: (c) => [-1, 1].map((s) => ({ p: [s * (c.W / 2 + 0.22), -0.1, sideExitZ(c) + 0.15] as Vec3, dir: 'back' as const })),
    build: (c) => {
      const len = skirtLen(c);
      return [sh('cylinder', [c.W / 2 + 0.22, -0.1, sideExitZ(c) - len / 2 + 0.15], [0.3, len, 0.3], 'chrome', { rot: [90, 0, 0], sides: 8, mirror: true })];
    },
  },
  {
    id: 'stack', name: 'Stacks (trucks)', outlets: (c) => [-1, 1].map((s) => ({ p: [s * (c.W / 2 - 0.4), stackTop(c), stackZ(c)] as Vec3, dir: 'up' as const })),
    build: (c) => [sh('cylinder', [c.W / 2 - 0.4, stackTop(c) / 2, stackZ(c)], [0.3, stackTop(c), 0.3], 'chrome', { sides: 8, mirror: true })],
  },
];
function sideExitZ(c: Ctx) {
  // Relative to the rear mount: just ahead of the rear wheel.
  return c.w.wheelbase / 2 - c.w.radius - 0.4 - c.rearZ;
}
function stackZ(c: Ctx) {
  return c.spec.cabBack + 0.4 - c.rearZ;
}
function stackTop(c: Ctx) {
  return c.roof + 0.8 - (c.bottom + 0.35);
}

export function exhaustOutlets(c: Ctx, variant: string): Outlet[] {
  return (EXHAUSTS.find((e) => e.id === variant) ?? EXHAUSTS[1]).outlets(c);
}

function tipRot(o: Outlet): Vec3 {
  return o.dir === 'up' ? [0, 0, 0] : [90, 0, 0];
}
function along(o: Outlet, d: number): Vec3 {
  return o.dir === 'up' ? [o.p[0], o.p[1] + d, o.p[2]] : [o.p[0], o.p[1], o.p[2] + d];
}
/** A short solid cylinder section along the outlet, like LAS's Tip / TipLip / TipMouth parts. */
function tipDisc(o: Outlet, at: number, dia: number, len: number, role: Role, sides = 10): Shape {
  return sh('cylinder', along(o, at + len / 2), [dia, len, dia], role, { rot: tipRot(o), sides });
}
interface TipStyle {
  id: string;
  name: string;
  tip: (o: Outlet) => Shape[];
}
const TIP_STYLES: TipStyle[] = [
  { id: 'round', name: 'Round', tip: (o) => [tipDisc(o, 0, 0.46, 0.4, 'tip'), tipDisc(o, 0.4, 0.36, 0.02, 'trim')] },
  { id: 'bigbore', name: 'Big bore', tip: (o) => [tipDisc(o, 0, 0.62, 0.5, 'tip', 12), tipDisc(o, 0.45, 0.67, 0.05, 'chrome', 12), tipDisc(o, 0.5, 0.5, 0.02, 'trim', 12)] },
  { id: 'doublewall', name: 'Double wall', tip: (o) => [tipDisc(o, 0, 0.56, 0.42, 'tip'), tipDisc(o, 0.42, 0.44, 0.03, 'chrome'), tipDisc(o, 0.45, 0.34, 0.02, 'trim')] },
  {
    id: 'square', name: 'Square', tip: (o) => [
      box(along(o, 0.2), [0.5, 0.4, 0.4], 'tip', { rot: tipRot(o) }),
      box(along(o, 0.41), [0.4, 0.02, 0.3], 'trim', { rot: tipRot(o) }),
    ],
  },
];

// Wheels: each wheel is its own part (WheelFL, WheelFR, WheelRL, WheelRR) with its pivot at
// the hub. Like LAS's cars, the tyre is a plain cylinder and the rim is a stack of thin
// plates on the outer face (lip, barrel, spokes, hub, lug nuts, cap).
interface TyreStyle {
  id: string;
  name: string;
  /** Rim lip radius as a fraction of the tyre radius. */
  rim: number;
  build: (r: number, w: number) => Shape[];
}
const tyre = (r: number, w: number, sides = 18) => sh('cylinder', [0, 0, 0], [r * 2, w, r * 2], 'tire', { name: 'Tyre', rot: [0, 0, 90], sides });

const TYRES: TyreStyle[] = [
  { id: 'street', name: 'Street', rim: 0.8, build: (r, w) => [tyre(r, w)] },
  { id: 'lowpro', name: 'Low profile', rim: 0.88, build: (r, w) => [tyre(r, w)] },
  {
    id: 'offroad', name: 'Off-road', rim: 0.68, build: (r, w) => {
      const out = [tyre(r, w, 12)];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        out.push(box([0, Math.cos(a) * r, Math.sin(a) * r], [w * 0.9, 0.16, 0.36], 'tire', { name: 'Tread', rot: [deg(a), 0, 0] }));
      }
      return out;
    },
  },
  { id: 'slick', name: 'Slick', rim: 0.8, build: (r, w) => [tyre(r, w * 1.12, 20)] },
  { id: 'kart', name: 'Kart', rim: 0.6, build: (r, w) => [tyre(r, w, 12)] },
];

interface RimCtx {
  rr: number; // rim lip radius
  x: (layer: number) => number; // x of a plate on the outer face
}
function disc(rc: RimCtx, layer: number, radius: number, thick: number, role: Role, name: string, sides = 16): Shape {
  return sh('cylinder', [rc.x(layer), 0, 0], [radius * 2, thick, radius * 2], role, { name, rot: [0, 0, 90], sides });
}
function spoke(rc: RimCtx, a: number, d0: number, d1: number, width: number, tilt = 0, role: Role = 'rim', taper?: number): Shape {
  const dir = a + tilt;
  const len = (d1 - d0) * rc.rr;
  const cy = Math.cos(a) * d0 * rc.rr + (Math.cos(dir) * len) / 2;
  const cz = Math.sin(a) * d0 * rc.rr + (Math.sin(dir) * len) / 2;
  const extra: Extra = { name: 'Spoke', rot: [deg(dir), 0, 0] };
  if (taper) return sh('taperBox', [rc.x(2), cy, cz], [0.06, len, width * rc.rr], role, { ...extra, taper: [1, taper, 0] });
  return box([rc.x(2), cy, cz], [0.06, len, width * rc.rr], role, extra);
}
function ringOf(n: number, f: (a: number, i: number) => Shape | Shape[]): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) out.push(...[f((i / n) * Math.PI * 2, i)].flat());
  return out;
}
/** Lip, barrel, hub, lug nuts and cap. Spokes sit between the barrel and the hub. */
function rimBase(rc: RimCtx, opts: { barrel?: Role; lugs?: boolean; hubScale?: number } = {}): Shape[] {
  const out = [
    disc(rc, 0, rc.rr, 0.04, 'rim', 'RimLip'),
    disc(rc, 1, rc.rr * 0.9, 0.04, opts.barrel ?? 'trim', 'RimBarrel'),
    disc(rc, 3, rc.rr * 0.26 * (opts.hubScale ?? 1), 0.06, 'rim', 'RimHub', 8),
    disc(rc, 4, rc.rr * 0.09 * (opts.hubScale ?? 1), 0.03, 'trim', 'RimCap', 8),
  ];
  if (opts.lugs !== false) out.push(...ringOf(5, (a) => box([rc.x(4), Math.cos(a) * rc.rr * 0.17, Math.sin(a) * rc.rr * 0.17], [0.03, 0.07, 0.07], 'chrome', { name: 'LugNut' })));
  return out;
}
interface RimStyle {
  id: string;
  name: string;
  build: (rc: RimCtx) => Shape[];
}
const RIMS: RimStyle[] = [
  { id: 'stock', name: 'Stock', build: (rc) => [...rimBase(rc), ...ringOf(5, (a) => spoke(rc, a, 0.2, 0.92, 0.16))] },
  { id: 'star5', name: 'Classic Star', build: (rc) => [...rimBase(rc), ...ringOf(5, (a) => [spoke(rc, a, 0.15, 0.55, 0.3), spoke(rc, a, 0.5, 0.92, 0.19)])] },
  { id: 'mono6', name: 'Mono Six', build: (rc) => [...rimBase(rc), ...ringOf(6, (a) => spoke(rc, a, 0.2, 0.92, 0.14))] },
  { id: 'octane8', name: 'Octane Eight', build: (rc) => [...rimBase(rc), ...ringOf(8, (a) => spoke(rc, a, 0.2, 0.92, 0.12))] },
  { id: 'twin7', name: 'Twin Seven', build: (rc) => [...rimBase(rc), ...ringOf(7, (a) => [spoke(rc, a - 0.07, 0.22, 0.92, 0.07), spoke(rc, a + 0.07, 0.22, 0.92, 0.07)])] },
  { id: 'split5', name: 'Split Five', build: (rc) => [...rimBase(rc), ...ringOf(5, (a) => [spoke(rc, a, 0.2, 0.92, 0.09, -0.08), spoke(rc, a, 0.2, 0.92, 0.09, 0.08)])] },
  { id: 'needle', name: 'Needle Fifteen', build: (rc) => [...rimBase(rc), ...ringOf(15, (a) => spoke(rc, a, 0.2, 0.92, 0.05))] },
  { id: 'yspoke', name: 'Y-Spoke', build: (rc) => [...rimBase(rc), ...ringOf(5, (a) => [spoke(rc, a, 0.2, 0.5, 0.14), spoke(rc, a, 0.5, 0.92, 0.09, -0.3), spoke(rc, a, 0.5, 0.92, 0.09, 0.3)])] },
  { id: 'fuchs', name: 'Fuchs Petal', build: (rc) => [...rimBase(rc), ...ringOf(5, (a) => spoke(rc, a, 0.2, 0.9, 0.24, 0, 'rim', 1.9))] },
  {
    id: 'rallye', name: 'Rallye Dish', build: (rc) => [
      ...rimBase(rc, { barrel: 'rim', hubScale: 1.4 }),
      ...ringOf(5, (a) => box([rc.x(2), Math.cos(a) * rc.rr * 0.6, Math.sin(a) * rc.rr * 0.6], [0.04, rc.rr * 0.32, rc.rr * 0.16], 'trim', { name: 'Slot', rot: [deg(a), 0, 0] })),
    ],
  },
  { id: 'turbine', name: 'Turbine', build: (rc) => [...rimBase(rc), ...ringOf(16, (a) => spoke(rc, a, 0.28, 0.9, 0.08, 0.5))] },
  { id: 'twist', name: 'Twister', build: (rc) => [...rimBase(rc), ...ringOf(10, (a) => spoke(rc, a, 0.2, 0.92, 0.1, 0.35))] },
  {
    id: 'aero', name: 'Aero', build: (rc) => [
      ...rimBase(rc, { barrel: 'rim' }),
      ...ringOf(6, (a) => sh('cylinder', [rc.x(2), Math.cos(a) * rc.rr * 0.6, Math.sin(a) * rc.rr * 0.6], [rc.rr * 0.26, 0.04, rc.rr * 0.26], 'trim', { name: 'Vent', rot: [0, 0, 90], sides: 8 })),
    ],
  },
  {
    id: 'deepdish', name: 'Deep Dish', build: (rc) => [
      ...rimBase(rc, { barrel: 'chrome' }),
      disc(rc, 1.5, rc.rr * 0.6, 0.04, 'trim', 'DishFace'),
      ...ringOf(5, (a) => spoke(rc, a, 0.2, 0.6, 0.18)),
    ],
  },
  { id: 'centrelock', name: 'Centre Lock', build: (rc) => [...rimBase(rc, { lugs: false, hubScale: 1.3 }), ...ringOf(10, (a) => spoke(rc, a, 0.25, 0.92, 0.09)), disc(rc, 5, rc.rr * 0.16, 0.05, 'chrome', 'LockNut', 6)] },
  { id: 'mesh', name: 'Mesh', build: (rc) => [...rimBase(rc), ...ringOf(10, (a) => [spoke(rc, a, 0.25, 0.92, 0.05, 0.4), spoke(rc, a, 0.25, 0.92, 0.05, -0.4)])] },
];

export const RIM_FINISHES: Record<string, string> = {
  chrome: '#f0f1f5', silver: '#c8ccd4', titanium: '#6e70af', gunmetal: '#4b4f57', black: '#1d1d22', white: '#f4f4f6', gold: '#d6aa60', magnesium: '#8e9088', orange: '#e8741c',
};
export const EXHAUST_FINISHES: Record<string, string> = { steel: '#a9adb5', chrome: '#e6e8ee', titanium: '#6e70af', black: '#222226', burnt: '#8a5a9e' };

// ---------- registry ----------

export interface SlotDef {
  id: SlotId;
  name: string;
  variants: { id: string; name: string }[];
}
export interface CategoryDef {
  name: string;
  slots: SlotId[];
}

const VARIANTS: Partial<Record<SlotId, Variant[]>> = {
  hood: HOODS,
  frontBumper: FRONT_BUMPERS,
  rearBumper: REAR_BUMPERS,
  sideSkirts: SKIRTS,
  spoiler: SPOILERS,
  hoodExtras: HOOD_EXTRAS,
  roofExtras: ROOF_EXTRAS,
  sideExtras: SIDE_EXTRAS,
  frontExtras: FRONT_EXTRAS,
  rearExtras: REAR_EXTRAS,
  trunkExtras: TRUNK_EXTRAS,
  headlights: HEADLIGHTS,
  taillights: TAILLIGHTS,
  exhaust: EXHAUSTS,
};

export const SLOT_NAMES: Record<SlotId, string> = {
  body: 'Body', hood: 'Hood', frontBumper: 'Front bumper', rearBumper: 'Rear bumper', sideSkirts: 'Side skirts', spoiler: 'Spoiler',
  hoodExtras: 'Hood extras', roofExtras: 'Roof extras', sideExtras: 'Side extras', frontExtras: 'Front extras', rearExtras: 'Rear extras', trunkExtras: 'Trunk extras',
  headlights: 'Headlights', taillights: 'Taillights', rims: 'Rims', tyres: 'Tyres', exhaust: 'Exhaust', exhaustTips: 'Exhaust tips',
};

/** Exported mesh names, following the Slot_Variant convention from the research notes. */
const PART_PREFIX: Record<SlotId, string> = {
  body: 'Body', hood: 'Hood', frontBumper: 'FrontBumper', rearBumper: 'RearBumper', sideSkirts: 'SideSkirts', spoiler: 'Spoiler',
  hoodExtras: 'HoodExtra', roofExtras: 'RoofExtra', sideExtras: 'SideExtra', frontExtras: 'FrontExtra', rearExtras: 'RearExtra', trunkExtras: 'TrunkExtra',
  headlights: 'Headlights', taillights: 'Taillights', rims: 'Rims', tyres: 'Tyres', exhaust: 'Exhaust', exhaustTips: 'ExhaustTips',
};

export const CATEGORIES: CategoryDef[] = [
  { name: 'Body kit', slots: ['frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood'] },
  { name: 'Extras', slots: ['hoodExtras', 'roofExtras', 'sideExtras', 'frontExtras', 'rearExtras', 'trunkExtras'] },
  { name: 'Lights', slots: ['headlights', 'taillights'] },
  { name: 'Wheels', slots: ['rims', 'tyres'] },
  { name: 'Exhaust & boost', slots: ['exhaust', 'exhaustTips'] },
];

export function slotVariants(slot: SlotId): { id: string; name: string }[] {
  if (slot === 'body') return BASES.map((b) => ({ id: b.id, name: b.name }));
  if (slot === 'rims') return RIMS;
  if (slot === 'tyres') return TYRES;
  if (slot === 'exhaustTips') return TIP_STYLES;
  return VARIANTS[slot] ?? [];
}

export const DEFAULT_CHOICES: Record<SlotId, string> = {
  body: 'sedan', hood: 'flat', frontBumper: 'stock', rearBumper: 'stock', sideSkirts: 'none', spoiler: 'none',
  hoodExtras: 'none', roofExtras: 'none', sideExtras: 'mirrors', frontExtras: 'none', rearExtras: 'plate', trunkExtras: 'none',
  headlights: 'quad', taillights: 'bar', rims: 'split5', tyres: 'street', exhaust: 'dual', exhaustTips: 'round',
};

function variantName(slot: SlotId, id: string) {
  return slotVariants(slot).find((v) => v.id === id)?.name ?? id;
}

function makePart(slot: SlotId, variant: string, pivot: Vec3, shapes: Shape[]): Part {
  const vname = variantName(slot, variant)
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  const name = slot === 'body' ? 'Body' : `${PART_PREFIX[slot]}_${vname}`;
  return { id: uid('p'), name, slot, variant, pivot: [...pivot] as Vec3, shapes };
}

/** Builds the parts for one slot. Wheels and exhaust tips depend on other choices too. */
export function buildSlot(car: Car, slot: SlotId): Part[] {
  const c = makeCtx(baseSpec(car.base), car.wheels);
  const v = car.choices[slot];
  if (slot === 'body') return [makePart('body', car.base, [0, 0, 0], bodyShapes(c))];
  if (slot === 'rims' || slot === 'tyres') return buildWheels(car, c);
  if (slot === 'exhaustTips') {
    const style = TIP_STYLES.find((t) => t.id === v) ?? TIP_STYLES[0];
    const shapes = exhaustOutlets(c, car.choices.exhaust).flatMap(style.tip);
    return shapes.length ? [makePart(slot, style.id, c.mounts.exhaustTips, shapes)] : [];
  }
  const variant = (VARIANTS[slot] ?? []).find((x) => x.id === v);
  if (!variant || variant.id === 'none') return [];
  const shapes = variant.build(c);
  return shapes.length ? [makePart(slot, variant.id, c.mounts[slot], shapes)] : [];
}

const WHEEL_NAMES = [
  ['WheelFL', -1, -1],
  ['WheelFR', 1, -1],
  ['WheelRL', -1, 1],
  ['WheelRR', 1, 1],
] as const;

function buildWheels(car: Car, c: Ctx): Part[] {
  void c;
  const ty = TYRES.find((t) => t.id === car.choices.tyres) ?? TYRES[0];
  const rim = RIMS.find((r) => r.id === car.choices.rims) ?? RIMS[0];
  const { radius: r, width: w, wheelbase, track } = car.wheels;
  const tw = ty.id === 'slick' ? w * 1.12 : w;
  return WHEEL_NAMES.map(([name, sx, sz]) => {
    const rc: RimCtx = { rr: r * ty.rim, x: (layer) => sx * (tw / 2 + 0.02 + layer * 0.035) };
    return {
      id: uid('p'),
      name,
      slot: 'wheel' as const,
      variant: `${ty.id}+${rim.id}`,
      pivot: [(sx * track) / 2, r, (sz * wheelbase) / 2] as Vec3,
      shapes: [...ty.build(r, w), ...rim.build(rc)],
    };
  });
}

/** Which part slots a choice regenerates. */
export function affectedSlots(slot: SlotId): SlotId[] {
  if (slot === 'exhaust') return ['exhaust', 'exhaustTips'];
  if (slot === 'rims' || slot === 'tyres') return ['rims'];
  return [slot];
}

export function partSlotFor(slot: SlotId): Part['slot'][] {
  if (slot === 'rims' || slot === 'tyres') return ['wheel'];
  return [slot];
}

/** Replaces the parts of one slot with freshly generated ones. */
export function applyChoice(car: Car, slot: SlotId, variant: string) {
  car.choices[slot] = variant;
  if (slot === 'body') {
    car.base = variant;
    car.wheels = { ...baseSpec(variant).wheels };
    rebuildAll(car);
    return;
  }
  for (const s of affectedSlots(slot)) {
    const kinds = partSlotFor(s);
    car.parts = car.parts.filter((p) => !kinds.includes(p.slot));
    car.parts.push(...buildSlot(car, s));
  }
}

/** Regenerates every slot part (keeps custom parts). */
export function rebuildAll(car: Car) {
  car.parts = car.parts.filter((p) => p.slot === 'custom');
  const slots: SlotId[] = ['body', 'hood', 'frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hoodExtras', 'roofExtras', 'sideExtras', 'frontExtras', 'rearExtras', 'trunkExtras', 'headlights', 'taillights', 'rims', 'exhaust', 'exhaustTips'];
  for (const s of slots) car.parts.push(...buildSlot(car, s));
}

/** Wheel wizard: moves wheels and arches, keeping the rest of the car. */
export function applyWheelSettings(car: Car, w: WheelSettings) {
  car.wheels = { ...w };
  const c = makeCtx(baseSpec(car.base), car.wheels);
  const body = car.parts.find((p) => p.slot === 'body');
  if (body) updateArches(body, c);
  car.parts = car.parts.filter((p) => p.slot !== 'wheel');
  car.parts.push(...buildWheels(car, c));
  for (const s of ['sideSkirts', 'exhaust', 'exhaustTips', 'sideExtras'] as SlotId[]) {
    car.parts = car.parts.filter((p) => p.slot !== s);
    car.parts.push(...buildSlot(car, s));
  }
}

export const DEFAULT_PAINT: Record<Role, string> = {
  paint: '#c6cad2', accent: '#244ecd', trim: '#181a20', chrome: '#dfe2e8', rim: '#eceef5',
  tire: '#222226', tip: '#a9adb5', glass: '#263448', light: '#fffaeb', tail: '#cd1e30', glow: '#3d7bff',
};

export const PAINT_PRESETS: { name: string; paint: Partial<Record<Role, string>> }[] = [
  { name: 'Silver & blue', paint: { paint: '#c6cad2', accent: '#244ecd' } },
  { name: 'Racing red', paint: { paint: '#c8211f', accent: '#f2f2f2' } },
  { name: 'Police', paint: { paint: '#f2f2f2', accent: '#1d4fd8', trim: '#111114' } },
  { name: 'Taxi', paint: { paint: '#f2c21b', accent: '#151515' } },
  { name: 'Lime', paint: { paint: '#7fd321', accent: '#181818' } },
  { name: 'Midnight purple', paint: { paint: '#3a1f6b', accent: '#11d1c4' } },
  { name: 'Matte black', paint: { paint: '#26272b', accent: '#e8442a' } },
  { name: 'Orange', paint: { paint: '#ff7a1a', accent: '#1b1b1b' } },
];

export function newCar(base = 'sedan'): Car {
  const car: Car = {
    version: 1,
    name: 'MyCar',
    base,
    choices: { ...DEFAULT_CHOICES, body: base },
    wheels: { ...baseSpec(base).wheels },
    paint: { ...DEFAULT_PAINT },
    glassOpacity: 0.65,
    rimFinish: 'chrome',
    exhaustFinish: 'steel',
    effects: {
      underglow: { on: false, brightness: 2 },
      boost: { style: 'none', color: '#ff8a1f' },
      aura: { style: 'none', color: '#9ad7ff' },
      headlightBeams: false,
    },
    parts: [],
  };
  if (base === 'kart') Object.assign(car.choices, { sideExtras: 'none', rearExtras: 'none', tyres: 'kart', exhaust: 'centerQuad' });
  rebuildAll(car);
  return car;
}
