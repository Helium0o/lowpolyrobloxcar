import * as THREE from 'three';
import { safeName, type Car, type Part, type Shape } from './model';
import { hasMirrorCopy } from './shapes';
import { baseSpec, exhaustOutlets, makeCtx, type Ctx } from './templates';

// The game's own part format (LAS's "Game JSON first" export).
//
// ReplicatedStorage.CustomParts holds one StringValue per part: Name = shop item id, Value = JSON
//   {name, cat, price, currency, level, ref, p: [ROW...], layout? (exhaust), finish? (rims)}
// ROW = [role, shape (0 Block, 1 Wedge, 2 Cylinder along X, 3 Ball), sx, sy, sz, x, y, z, r00..r22 (+ hex, material,
// transparency, reflectance when role = "custom")], written in the slot's frame of the car it was drawn on.
// `ref` holds that car's measurements so the game (Kit.customFrames + Kit.fitRow in ShopCatalog) can stretch the part
// to every other car. Two-sided slots (side skirts, head and taillights) store the LEFT side only.

export const GAME_CATS = [
  'frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood', 'headlights', 'taillights',
  'hoodExtra', 'roofExtra', 'sideExtra', 'frontExtra', 'rearExtra', 'trunkExtra', 'exhaust', 'rims',
] as const;
export type GameCat = (typeof GAME_CATS)[number];

export const GAME_CAT_NAMES: Record<GameCat, string> = {
  frontBumper: 'Front Bumper', rearBumper: 'Rear Bumper', sideSkirts: 'Side Skirts', spoiler: 'Spoiler', hood: 'Hood',
  headlights: 'Headlights', taillights: 'Taillights', hoodExtra: 'Hood Extras', roofExtra: 'Roof Extras',
  sideExtra: 'Side Extras', frontExtra: 'Front Extras', rearExtra: 'Rear Extras', trunkExtra: 'Trunk Extras',
  exhaust: 'Exhaust Tips', rims: 'Rims',
};

const SLOT_TO_CAT: Partial<Record<Part['slot'], GameCat>> = {
  frontBumper: 'frontBumper', rearBumper: 'rearBumper', sideSkirts: 'sideSkirts', spoiler: 'spoiler', hood: 'hood',
  headlights: 'headlights', taillights: 'taillights', hoodExtras: 'hoodExtra', roofExtras: 'roofExtra',
  sideExtras: 'sideExtra', frontExtras: 'frontExtra', rearExtras: 'rearExtra', trunkExtras: 'trunkExtra',
  exhaustTips: 'exhaust', wheel: 'rims',
};

/** The game slot a part exports to, or null (body, pipes, tyres and unassigned custom parts have none). */
export function gameCatOf(part: Part): GameCat | null {
  if (part.slot === 'custom') return part.gameSlot ?? null;
  return SLOT_TO_CAT[part.slot] ?? null;
}

/** Why a part has no game slot, for the export check. */
export function noCatReason(part: Part): string {
  if (part.slot === 'body') return 'The body stays the game car\'s own body, so it only exports as FBX.';
  if (part.slot === 'exhaust') return 'The game draws its own pipes; the layout is sent with the exhaust tips.';
  if (part.slot === 'tyres') return 'Tyres are not a game part type, so they only export as FBX.';
  return 'Pick a game slot for this part in the inspector.';
}

const TWO_SIDED: GameCat[] = ['sideSkirts', 'headlights', 'taillights'];

/** The game's layout ids. The app's side pipes are the game's sideExit; it has no truck stacks. */
const LAYOUT: Record<string, string> = { single: 'single', dual: 'dual', dualSide: 'dualSide', quad: 'quad', centerQuad: 'centerQuad', sidePipes: 'sideExit', stack: 'dual' };
const RIM_FINISH: Record<string, string> = { chrome: 'chrome', silver: 'silver', titanium: 'gunmetal', gunmetal: 'gunmetal', black: 'black', white: 'white', gold: 'gold', magnesium: 'magnesium', orange: 'orange' };

// ---------- Roblox pieces ----------

export interface Piece {
  shape: Shape;
  /** 0 Block, 1 Wedge, 2 Cylinder (along local X), 3 Ball. */
  code: 0 | 1 | 2 | 3;
  size: [number, number, number];
  /** Car-space placement (rotation is proper, no scale). */
  m: THREE.Matrix4;
  approx: boolean;
}

/** Every visible shape of a part as a Roblox primitive in car space, mirror copies included. Holes are left out. */
export function robloxPieces(part: Part): { pieces: Piece[]; holes: number } {
  const pieces: Piece[] = [];
  let holes = 0;
  const pivot = new THREE.Matrix4().makeTranslation(...part.pivot);
  const M = new THREE.Matrix4().makeScale(-1, 1, 1);
  for (const s of part.shapes) {
    if (s.hidden) continue;
    if (s.hole) { holes++; continue; }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...s.rot.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number], 'XYZ'));
    const world = pivot.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...s.pos), q, new THREE.Vector3(1, 1, 1)));
    const piece = toPiece(s, world);
    pieces.push(piece);
    // Reflect the finished placement (M·R·M keeps it a proper rotation).
    if (hasMirrorCopy(s, part.pivot[0])) pieces.push({ ...piece, m: M.clone().multiply(piece.m).multiply(M) });
  }
  return { pieces, holes };
}

function toPiece(s: Shape, world: THREE.Matrix4): Piece {
  const [x, y, z] = s.size.map(Math.abs) as [number, number, number];
  const fix = new THREE.Matrix4();
  switch (s.type) {
    case 'box': return { shape: s, code: 0, size: [x, y, z], m: world, approx: false };
    case 'wedge': return { shape: s, code: 1, size: [x, y, z], m: world, approx: false };
    case 'cornerWedge': return { shape: s, code: 1, size: [x, y, z], m: world, approx: true };
    case 'sphere': return { shape: s, code: 3, size: [x, y, z], m: world, approx: !(Math.abs(x - y) < 1e-3 && Math.abs(y - z) < 1e-3) };
    case 'cylinder':
    case 'cone':
    case 'tire':
      // Roblox cylinders run along X; ours run along Y.
      fix.makeRotationZ(Math.PI / 2);
      return { shape: s, code: 2, size: [y, x, z], m: world.clone().multiply(fix), approx: s.type !== 'cylinder' || Math.abs(x - z) > 1e-3 };
    case 'taperBox': {
      const [tx, tz] = s.taper ?? [0.8, 0.7, 0];
      return { shape: s, code: 0, size: [x * (1 + tx) / 2, y, z * (1 + tz) / 2], m: world, approx: true };
    }
    default: return { shape: s, code: 0, size: [x, y, z], m: world, approx: true };
  }
}

/** The left side (car -X) of a two-sided part. A block across the centre line (a light bar) keeps its left half;
 * the game mirrors it back to full width. Other centre shapes are dropped. */
export function leftSide(pieces: Piece[]): { left: Piece[]; dropped: number } {
  const xOf = (p: Piece) => p.m.elements[12];
  const left = pieces.filter((p) => xOf(p) < -0.01);
  let dropped = 0;
  for (const p of pieces) {
    if (Math.abs(xOf(p)) > 0.01) continue;
    if (p.code !== 0 || Math.abs(p.m.elements[0]) < 0.9999) { dropped++; continue; }
    const m = p.m.clone();
    m.elements[12] -= p.size[0] / 4;
    left.push({ ...p, size: [p.size[0] / 2, p.size[1], p.size[2]], m });
  }
  return { left, dropped };
}

// ---------- slot frames (mirrors Kit.measure / Kit.customFrames for the app's own car) ----------

export interface Frame {
  cf: THREE.Matrix4;
  /** Two-sided slots: the right side is the left side mirrored across the frame's local X. */
  mirror?: boolean;
}

const CF = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));
const fromAxes = (o: THREE.Vector3, X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3) => new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(o);

/** Measurements the game takes of a car (Kit.measure), taken from the app's template instead of raycasts. */
export function anchors(car: Car) {
  const c: Ctx = makeCtx(baseSpec(car.base), car.wheels);
  const R = car.wheels.radius, fz = -car.wheels.wheelbase / 2, rz = car.wheels.wheelbase / 2;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const lampY = c.belt - 0.55;
  const top = (yB: number) => clamp(Math.min(lampY - 0.35 - 0.08, c.belt - 0.15), yB + 0.6, yB + 1.6);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const hz0 = c.frontZ + 0.9;
  let hz1 = c.spec.cabFront - 0.45;
  if (hz1 - hz0 < 1.2) hz1 = hz0 + 1.2;
  return {
    hw: c.W / 2,
    front: { z: c.frontZ, W: r(c.W / 2 + 0.04), yB: c.bottom, yT: r(top(c.bottom)) },
    rear: { z: c.rearZ, W: r(c.W / 2 + 0.04), yB: c.bottom, yT: r(top(c.bottom)) },
    side: { x: c.W / 2, z: (fz + rz) / 2, L: r(Math.max(1, rz - R - 0.3 - (fz + R + 0.3))), yB: c.bottom },
    deck: { y: c.belt, z: c.rearZ - 0.75, hw: r((c.W / 2) * 0.96) },
    roof: { y: c.roof, z: r(c.topZc + c.topL * 0.15), hw: r(c.cabW / 2) },
    hood: { o: [0, c.belt, (hz0 + hz1) / 2] as [number, number, number], len: r(hz1 - hz0), hw: r((c.W / 2) * 0.66) },
  };
}
export type Anchors = ReturnType<typeof anchors>;

function pieceBox(p: Piece): THREE.Box3 {
  const b = new THREE.Box3();
  const h = p.size.map((v) => v / 2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.expandByPoint(new THREE.Vector3(sx * h[0], sy * h[1], sz * h[2]).applyMatrix4(p.m));
  return b;
}

/** The slot frame(s) and `ref` for a part on the app's car. Lamps are measured from the part's own left side. */
export function slotFrame(car: Car, cat: GameCat, left: Piece[]): { frame: THREE.Matrix4; ref: Record<string, number> } {
  const A = anchors(car);
  const same: Partial<Record<GameCat, GameCat>> = { hoodExtra: 'hood', trunkExtra: 'spoiler', frontExtra: 'frontBumper', rearExtra: 'rearBumper' };
  const base = same[cat] ?? cat;
  switch (base) {
    case 'roofExtra': return { frame: CF(0, A.roof.y, A.roof.z), ref: { hw: A.roof.hw } };
    case 'sideExtra': return { frame: CF(0, 0, A.side.z), ref: { x: A.side.x, L: A.side.L, yB: A.side.yB } };
    case 'frontBumper': return { frame: CF(0, 0, A.front.z, Math.PI), ref: { W: A.front.W, yB: A.front.yB, yT: A.front.yT } };
    case 'rearBumper': return { frame: CF(0, 0, A.rear.z), ref: { W: A.rear.W, yB: A.rear.yB, yT: A.rear.yT } };
    case 'sideSkirts': return { frame: CF(-A.side.x, 0, A.side.z, -Math.PI / 2), ref: { L: A.side.L, yB: A.side.yB } };
    case 'spoiler': return { frame: CF(0, A.deck.y, A.deck.z), ref: { hw: A.deck.hw } };
    case 'hood': return { frame: CF(...A.hood.o), ref: { hw: A.hood.hw, len: A.hood.len } };
    case 'headlights':
    case 'taillights': {
      // Like the game's lampFrame: a frame on the lamp group's outer face, X across the car, Z out of the lamp.
      const b = new THREE.Box3();
      for (const p of left) b.union(pieceBox(p));
      if (b.isEmpty()) b.set(new THREE.Vector3(-1, 1, 0), new THREE.Vector3(-0.5, 1.4, 0));
      const head = base === 'headlights';
      const n = new THREE.Vector3(0, 0, head ? -1 : 1), h = new THREE.Vector3(1, 0, 0), v = n.clone().cross(h);
      const o = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, head ? b.min.z : b.max.z);
      const r = (x: number) => Math.round(x * 1000) / 1000;
      return { frame: fromAxes(o, h, v, n), ref: { hw: r(Math.max(0.05, (b.max.x - b.min.x) / 2)), hh: r(Math.max(0.05, (b.max.y - b.min.y) / 2)) } };
    }
  }
  return { frame: new THREE.Matrix4(), ref: {} };
}

// ---------- rows ----------

export type Row = (string | number)[];
export interface CustomPart {
  name: string;
  cat: GameCat;
  price: number;
  currency: 'coins' | 'score';
  level: number;
  ref: Record<string, number>;
  p: Row[];
  layout?: string;
  finish?: string;
}
export interface CustomPartResult {
  id: string;
  part: Part;
  data: CustomPart | null;
  notes: string[];
}

const rd = (n: number) => {
  const v = Math.round(n * 10000) / 10000;
  return Object.is(v, -0) ? 0 : v;
};

function gameRole(car: Car, cat: GameCat, s: Shape): Row {
  const custom = (hex: string, mat = 'SmoothPlastic', tr = 0, rf = 0): Row => ['custom', hex, mat, rd(tr), rf];
  if (cat === 'rims') {
    if (s.name === 'RimLip') return ['lip'];
    if (s.name === 'RimBarrel') return ['barrel'];
    if (s.role === 'rim') return ['face'];
  }
  if (cat === 'exhaust') {
    if (s.role === 'tip') return ['body'];
    if (s.role === 'chrome') return ['lip'];
    if (s.role === 'trim') return ['soot'];
  }
  switch (s.role) {
    case 'paint': return cat === 'rims' || cat === 'exhaust' ? custom(car.paint.paint) : ['paint'];
    case 'accent': return custom(car.paint.accent);
    case 'trim': case 'tire': return ['black'];
    case 'chrome': case 'rim': case 'tip': return ['chrome'];
    case 'glass': return cat === 'headlights' || cat === 'taillights' ? ['lens'] : custom(car.paint.glass, 'Glass', 1 - car.glassOpacity);
    case 'light': return ['head'];
    case 'tail': return ['tail'];
    case 'glow': return custom(car.paint.glow, 'Neon');
  }
  return ['black'];
}

function row(car: Car, cat: GameCat, p: Piece, toLocal: THREE.Matrix4): Row {
  const m = toLocal.clone().multiply(p.m);
  const e = m.elements; // column-major; CFrame components are row-major
  const look = gameRole(car, cat, p.shape);
  const out: Row = [look[0], p.code, ...p.size.map((v) => rd(Math.max(0.02, v))), rd(e[12]), rd(e[13]), rd(e[14]),
    rd(e[0]), rd(e[4]), rd(e[8]), rd(e[1]), rd(e[5]), rd(e[9]), rd(e[2]), rd(e[6]), rd(e[10])];
  if (look.length > 1) out.push(...look.slice(1));
  return out;
}

/** Shop item id for a part: cp_<name>, lower case. */
export function customPartId(part: Part): string {
  return 'cp_' + safeName(part.name).toLowerCase();
}

const pretty = (name: string) => name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

/** One part as a CustomParts entry, or null with the reason in notes. */
export function customPart(car: Car, part: Part): CustomPartResult {
  const id = customPartId(part);
  const notes: string[] = [];
  const cat = gameCatOf(part);
  if (!cat) return { id, part, data: null, notes: [noCatReason(part)] };
  let { pieces, holes } = robloxPieces(part);
  if (holes) notes.push(`${holes} hole shape${holes > 1 ? 's are' : ' is'} left out (game parts are plain blocks with no cuts).`);
  let frame: THREE.Matrix4, ref: Record<string, number>;
  const meta: Partial<CustomPart> = {};

  if (cat === 'rims') {
    // Rim frame: +X out of the wheel face, origin at the wheel centre. Taken from the right wheel, whose face points +X.
    pieces = pieces.filter((p) => p.shape.role !== 'tire');
    const wheel = car.parts.find((p) => p.name === 'WheelFR');
    const src = part.slot === 'wheel' && wheel ? wheel : part;
    if (src !== part) pieces = robloxPieces(src).pieces.filter((p) => p.shape.role !== 'tire');
    frame = new THREE.Matrix4().makeTranslation(...src.pivot);
    const tyreW = Math.max(...src.shapes.filter((s) => s.role === 'tire').map((s) => s.size[1]), car.wheels.width);
    ref = { W: rd(car.wheels.radius), T: rd(tyreW / 2) };
    meta.finish = RIM_FINISH[car.rimFinish] ?? 'silver';
  } else if (cat === 'exhaust') {
    // Tip frame: +Z out of the pipe, +Y up, origin where the pipe leaves the bodywork. One tip; the layout repeats it.
    const c = makeCtx(baseSpec(car.base), car.wheels);
    const outlets = part.slot === 'exhaustTips' ? exhaustOutlets(c, car.choices.exhaust) : [];
    const o = outlets[0];
    const dir = new THREE.Vector3(...(o?.dir === 'up' ? [0, 1, 0] : [0, 0, 1]) as [number, number, number]);
    const at = new THREE.Vector3(...part.pivot).add(new THREE.Vector3(...(o?.p ?? [0, 0, 0]))).addScaledVector(dir, o ? -0.15 : 0);
    const up = o?.dir === 'up' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    frame = fromAxes(at, up.clone().cross(dir), up, dir);
    if (o) {
      // Keep the shapes of the first outlet only.
      const inv = frame.clone().invert();
      pieces = pieces.filter((p) => {
        const q = new THREE.Vector3().setFromMatrixPosition(p.m).applyMatrix4(inv);
        return Math.hypot(q.x, q.y) < 0.6;
      });
    }
    ref = {};
    meta.layout = LAYOUT[car.choices.exhaust] ?? 'dual';
    if (car.choices.exhaust === 'stack') notes.push('The game has no stack layout, so these tips go on a dual layout.');
  } else {
    if (TWO_SIDED.includes(cat)) {
      const side = leftSide(pieces);
      pieces = side.left;
      const centre = side.dropped;
      if (pieces.length === 0) return { id, part, data: null, notes: [`${GAME_CAT_NAMES[cat]} are stored as the left side (car's -X) and this part has nothing there.`] };
      if (centre > 0) notes.push(`${centre} shape${centre > 1 ? 's' : ''} on the centre line left out: the game builds the right side by mirroring the left.`);
    }
    ({ frame, ref } = slotFrame(car, cat, pieces));
  }

  if (!pieces.length) return { id, part, data: null, notes: [...notes, 'Nothing to export.'] };
  const approx = pieces.filter((p) => p.approx).length;
  if (approx) notes.push(`${approx} shape${approx > 1 ? 's are' : ' is'} approximated by the nearest Roblox block, wedge, cylinder or ball.`);
  const toLocal = frame.clone().invert();
  const data: CustomPart = {
    name: pretty(part.name), cat, price: 100, currency: 'coins', level: 1, ref,
    p: pieces.map((p) => row(car, cat, p, toLocal)), ...meta,
  };
  return { id, part, data, notes };
}

/** All parts of a car (or just the given ones) as CustomParts entries. Later parts with the same id win. */
export function customParts(car: Car, parts: Part[]): CustomPartResult[] {
  const out: CustomPartResult[] = [];
  let rimsDone = false;
  for (const p of parts) {
    if (p.hidden) continue;
    // The four wheels are one rim design.
    if (p.slot === 'wheel') {
      if (rimsDone) continue;
      rimsDone = true;
      const named: Part = { ...p, name: `Rim_${pascal(car.choices.rims)}` };
      out.push(customPart(car, named));
      continue;
    }
    out.push(customPart(car, p));
  }
  return out;
}

const pascal = (s: string) => s.replace(/(^|[^a-zA-Z0-9])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

/** A script for the Roblox Studio command bar that adds or updates these parts in ReplicatedStorage.CustomParts. */
export function studioScript(list: CustomPartResult[]): string {
  const ok = list.filter((r) => r.data);
  const entries = ok.map((r) => {
    const json = JSON.stringify(r.data);
    let eq = '=';
    while (json.includes(`]${eq}]`)) eq += '=';
    return `  {${JSON.stringify(r.id)}, [${eq}[${json}]${eq}]},`;
  });
  return [
    '-- Low Poly Car Builder: custom parts for ReplicatedStorage.CustomParts.',
    '-- Paste all of this into the Studio command bar (View > Command Bar) in edit mode and press Enter.',
    '-- Parts with the same id are replaced. Play the game to see them in the Customs shop.',
    'local RS = game:GetService("ReplicatedStorage")',
    'local CHS = game:GetService("ChangeHistoryService")',
    'local folder = RS:FindFirstChild("CustomParts")',
    'if not folder then folder = Instance.new("Folder"); folder.Name = "CustomParts"; folder.Parent = RS end',
    'local parts = {',
    ...entries,
    '}',
    'for _, e in ipairs(parts) do',
    '  local v = folder:FindFirstChild(e[1])',
    '  if not (v and v:IsA("StringValue")) then v = Instance.new("StringValue"); v.Name = e[1] end',
    '  v.Value = e[2]',
    '  v.Parent = folder',
    'end',
    'folder:SetAttribute("Count", #folder:GetChildren())',
    'CHS:SetWaypoint("Add custom car parts")',
    'print(("Added %d custom part(s); CustomParts now holds %d."):format(#parts, #folder:GetChildren()))',
    '',
  ].join('\n');
}
