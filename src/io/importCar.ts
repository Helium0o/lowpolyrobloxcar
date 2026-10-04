import * as THREE from 'three';
import { fromComponents, toPosRot } from '../core/cf';
import { mirrorPlacement, partMatrix, sameSolid, shapeMatrix } from '../core/resolve';
import { clone, DEFAULT_COLORS, DEFAULT_GAME, newPart, uid, type Car, type CarParams, type Decal, type Kind, type Part, type Shape, type SlotId, type V3, type WheelPos } from '../core/types';
import { descendants, MATERIALS, readRbxm, type RCFrame, type RInst } from './rbxm';

// Brings a Roblox car model (.rbxm, like the ones in LAS's game) into the editor as editable shapes.
// - Plain parts become shapes; Unions are rebuilt from their WorkshopRecipe attribute (adds + cuts).
// - Parts are grouped into the editor's slots by the names the game uses (Headlight, Wing, WheelFL ...).
// - Left/right pairs are found and stored once with Mirror on, so editing one side edits both.
// - Physics bits (Chassis, DriveSeat, springs, attachments) are left out: the game adds those.

export interface ImportResult {
  car: Car;
  notes: string[];
}

const SKIP = /^(Chassis|DriveSeat|RimBlur|HitBox|Collider)$/;
const RULES: [RegExp, SlotId, string][] = [
  [/^Body$/, 'body', 'Body'],
  [/^Body2$|^Roof$/, 'roof', 'Body2'],
  [/Pillar$/, 'roof', 'Pillars'],
  [/^Glass$/, 'glass', 'Glass'],
  [/^Window/, 'details', 'WindowTrim'],
  [/^WellLiner/, 'details', 'WellLiners'],
  [/^(Headlight|FogLight|Indicator|DRL)/, 'headlights', 'Headlights'],
  [/^(Taillight|TailRing|TailHousing|ReverseLight|TailPanel|ThirdBrake)/, 'taillights', 'Taillights'],
  [/^(Wing|WhaleTail|DuckTail|Spoiler)/, 'spoiler', 'Spoiler'],
  [/^(Seat|BucketSeat|Dash|Steering|Console|CabinFloor|Floor$|Gauge|Shifter)/, 'interior', 'Interior'],
  [/^(FlatStripe|Decal|Stripe|Livery)/, 'details', 'Graphics'],
];

function material(v: unknown): string {
  return typeof v === 'number' ? MATERIALS[v] ?? 'SmoothPlastic' : 'SmoothPlastic';
}
function hex(c: unknown): string {
  if (Array.isArray(c) && c.length === 3) {
    const to = (x: number) => Math.max(0, Math.min(255, Math.round(x <= 1.0001 && c.every((y: number) => y <= 1.0001) ? x * 255 : x))).toString(16).padStart(2, '0');
    return '#' + c.map(to).join('');
  }
  return '#a3a2a5';
}
const cfMatrix = (c: RCFrame) => fromComponents([...c.p, ...c.r]);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function kindOf(inst: RInst): Kind | null {
  switch (inst.className) {
    case 'WedgePart': return 'wedge';
    case 'CornerWedgePart': return 'cornerwedge';
    case 'Part': case 'Seat': case 'SpawnLocation': {
      const s = num(inst.props.shape ?? inst.props.Shape, 1);
      return s === 0 ? 'ball' : s === 2 ? 'cylinder' : s === 3 ? 'wedge' : s === 4 ? 'cornerwedge' : 'block';
    }
    case 'TrussPart': case 'MeshPart': case 'VehicleSeat': return 'block';
    default: return null;
  }
}

const FACES: Decal['face'][] = ['Right', 'Top', 'Back', 'Left', 'Bottom', 'Front'];

function decalOf(inst: RInst): Decal | undefined {
  const sg = inst.children.find((c) => c.className === 'SurfaceGui');
  const fr = sg?.children.find((c) => c.className === 'Frame');
  if (!sg || !fr) return undefined;
  return { face: FACES[num(sg.props.Face, 1)] ?? 'Top', color: hex(fr.props.BackgroundColor3) };
}

function shapeFrom(inst: RInst, toCar: THREE.Matrix4, into: THREE.Matrix4, notes: string[]): Shape | null {
  const kind = kindOf(inst);
  const cf = inst.props.CFrame as RCFrame | undefined;
  const size = (inst.props.size ?? inst.props.Size) as V3 | undefined;
  if (!kind || !cf || !size) return null;
  if (inst.className === 'MeshPart') notes.push(`${inst.name} is a mesh, so it came in as a block of the same size.`);
  const m = into.clone().multiply(toCar).multiply(cfMatrix(cf));
  const { pos, rot } = toPosRot(m);
  const s: Shape = {
    id: uid(), name: inst.name || 'Part', kind, size: size.map(r4) as V3, pos, rot,
    color: hex(inst.props.Color3uint8), material: material(inst.props.Material),
  };
  const t = num(inst.props.Transparency), rf = num(inst.props.Reflectance);
  if (t > 0.001) s.transparency = r4(t);
  if (rf > 0.001) s.reflectance = r4(rf);
  const d = decalOf(inst);
  if (d) { s.decal = d; delete s.transparency; }
  return s;
}

interface RecipeEntry { cf: number[]; c?: string; sh?: string; s: V3; col?: string; m?: string; t?: number; rf?: number; cabin?: boolean }

function recipeShapes(json: string, into: THREE.Matrix4, color: string, mat: string): Shape[] | null {
  let r: { adds?: RecipeEntry[]; cuts?: RecipeEntry[] };
  try { r = JSON.parse(json); } catch { return null; }
  const conv = (e: RecipeEntry, cut: boolean): Shape => {
    const kind: Kind = e.c === 'WedgePart' ? 'wedge' : e.c === 'CornerWedgePart' ? 'cornerwedge' : e.sh === 'Cylinder' ? 'cylinder' : e.sh === 'Ball' ? 'ball' : 'block';
    const { pos, rot } = toPosRot(into.clone().multiply(fromComponents(e.cf)));
    const s: Shape = { id: uid(), name: cut ? (e.cabin ? 'CabinCut' : 'Cut') : 'Part', kind, size: e.s.map(r4) as V3, pos, rot, color: cut ? '#000000' : color, material: mat };
    if (cut) s.cut = true;
    return s;
  };
  const out = [...(r.adds ?? []).map((e) => conv(e, false)), ...(r.cuts ?? []).map((e) => conv(e, true))];
  return out.length ? out : null;
}

/** Stores left/right pairs once: the left shape gets Mirror on and the right one is dropped. */
export function foldMirrors(part: Part): number {
  const used = new Set<Shape>();
  let n = 0;
  const key = (s: Shape) => `${s.name}|${s.kind}|${!!s.cut}|${s.color}|${s.material}`;
  const groups = new Map<string, Shape[]>();
  for (const s of part.shapes) {
    const k = key(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  for (const s of part.shapes) {
    if (used.has(s) || s.pos[0] > -0.01 || s.repeat) continue;
    const want = mirrorPlacement(s.kind, shapeMatrix(s), s.size);
    for (const o of groups.get(key(s)) ?? []) {
      if (o === s || used.has(o) || o.pos[0] < 0.01) continue;
      if (sameSolid(s.kind, want.m, want.size, shapeMatrix(o), o.size)) { s.mirror = true; used.add(o); used.add(s); n++; break; }
    }
  }
  part.shapes = part.shapes.filter((s) => !used.has(s) || s.mirror);
  return n;
}

function pivotOf(model: RInst): THREE.Matrix4 {
  const spawn = model.attrs.SpawnCF as RCFrame | undefined;
  if (spawn && spawn.p) return cfMatrix(spawn);
  const wp = (model.props.WorldPivotData ?? model.props.WorldPivot) as RCFrame | undefined | null;
  if (wp && wp.p) return cfMatrix(wp);
  const ch = model.children.find((c) => c.name === 'Chassis');
  const cf = ch?.props.CFrame as RCFrame | undefined;
  if (cf) {
    const m = cfMatrix(cf);
    const size = (ch!.props.size ?? ch!.props.Size) as V3;
    return m.multiply(new THREE.Matrix4().makeTranslation(0, -size[1] / 2 - 0.3, 0));
  }
  return new THREE.Matrix4();
}

/** Finds the car model in a file: the first Model with wheels or a Body, or the first Model. */
function findCar(roots: RInst[]): RInst | null {
  const models: RInst[] = [];
  for (const r of roots) {
    if (r.className === 'Model') models.push(r);
    for (const d of descendants(r)) if (d.className === 'Model') models.push(d);
  }
  return models.find((m) => m.children.some((c) => /^Wheel(FL|FR|RL|RR)$/.test(c.name) || c.name === 'Body')) ?? models[0] ?? null;
}

export function importRbxm(data: Uint8Array, fileName = 'Car'): ImportResult {
  const roots = readRbxm(data);
  const model = findCar(roots);
  const notes: string[] = [];
  const looseParts = roots.filter((r) => kindOf(r));
  if (!model && !looseParts.length) throw new Error('No car model or parts found in this file.');
  const carName = (model?.attrs.CarName as string) || model?.name || fileName.replace(/\.rbxm$/i, '');
  const toCar = model ? pivotOf(model).invert() : new THREE.Matrix4();
  const I = new THREE.Matrix4();

  const parts = new Map<string, Part>();
  const partFor = (slot: SlotId, name: string) => {
    const k = `${slot}/${name}`;
    if (!parts.has(k)) parts.set(k, newPart(slot, name));
    return parts.get(k)!;
  };
  const unions: Part[] = [];
  const wheels: Partial<Record<WheelPos, RInst>> = {};
  let skipped = 0;

  const visit = (inst: RInst) => {
    if (SKIP.test(inst.name)) { skipped++; return; }
    if (/^Wheel(FL|FR|RL|RR)$/.test(inst.name) && kindOf(inst)) { wheels[inst.name.slice(5) as WheelPos] = inst; return; }
    if (inst.className === 'Model' || inst.className === 'Folder') {
      const slot: SlotId | null = /^ExhaustTips?$/.test(inst.name) ? 'exhaust' : /^Seats$/.test(inst.name) ? 'interior' : /^Aura$/.test(inst.name) ? null : 'custom';
      if (!slot) return;
      if (/^Kit_/.test(inst.name)) notes.push(`${inst.name} (a fitted shop part) came in as its own part.`);
      for (const c of inst.children) visitIn(c, slot === 'custom' ? null : slot, slot === 'custom' ? inst.name : slot === 'exhaust' ? 'ExhaustTips' : 'Interior');
      return;
    }
    visitIn(inst, null, null);
  };
  const visitIn = (inst: RInst, slot: SlotId | null, group: string | null) => {
    if (SKIP.test(inst.name)) { skipped++; return; }
    if (inst.className === 'Model' || inst.className === 'Folder') { for (const c of inst.children) visitIn(c, slot, group ?? inst.name); return; }
    if (inst.className === 'UnionOperation') {
      const rule = RULES.find(([re]) => re.test(inst.name));
      const p = newPart(rule?.[1] ?? slot ?? 'custom', inst.name || 'Union', { union: true });
      const recipe = inst.attrs.WorkshopRecipe as string | undefined;
      const col = hex(inst.props.Color3uint8), mat = material(inst.props.Material);
      const shapes = recipe ? recipeShapes(recipe, I, col, mat) : null;
      if (shapes) {
        // recipes are stored in pivot space already
        const t = num(inst.props.Transparency);
        if (t > 0.001) for (const s of shapes) if (!s.cut) s.transparency = r4(t);
        p.shapes = shapes;
      } else {
        const s = shapeFrom({ ...inst, className: 'Part', props: { ...inst.props, shape: 1 } }, toCar, I, notes);
        if (s) p.shapes = [s];
        notes.push(`The union ${inst.name} has no WorkshopRecipe, so it came in as one block. Rebuild it with shapes if you need its real outline.`);
      }
      unions.push(p);
      return;
    }
    const kind = kindOf(inst);
    if (!kind) return;
    const rule = RULES.find(([re]) => re.test(inst.name));
    const s = shapeFrom(inst, toCar, I, notes);
    if (!s) return;
    if (inst.name === 'Underglow') return; // the game spawns it from the underglow setting
    let target: Part;
    if (slot) target = partFor(slot, group ?? slot);
    else if (rule) target = partFor(rule[1], rule[2]);
    else target = partFor('details', 'BodyDetails');
    target.shapes.push(s);
    // children of a part (rare, e.g. rim pieces) are visited too
    for (const c of inst.children) if (kindOf(c)) visitIn(c, slot, group);
  };

  if (model) for (const c of model.children) visit(c);
  else for (const r of looseParts) visit(r);

  const car: Car = {
    version: 2,
    name: carName,
    params: guessParams(model, unions, wheels, toCar),
    colors: clone(DEFAULT_COLORS),
    parts: [],
    game: { ...DEFAULT_GAME, carName },
  };
  // paint colour: the Body union's colour drives "@paint"
  const body = unions.find((u) => u.name === 'Body');
  if (body?.shapes[0] && !body.shapes[0].cut) {
    const paint = body.shapes[0].color;
    car.colors.paint = paint;
    for (const p of [...unions, ...parts.values()]) for (const s of p.shapes) if (s.color === paint && !s.cut) s.color = '@paint';
  }
  for (const u of unions) car.parts.push(u);
  for (const p of parts.values()) car.parts.push(p);

  // wheels: tyre + its Rim model and Caliper, in the wheel's own frame
  const wheelParts: Partial<Record<WheelPos, Part>> = {};
  for (const w of ['FL', 'FR', 'RL', 'RR'] as WheelPos[]) {
    const inst = wheels[w];
    if (!inst) continue;
    const part = newPart('wheel', `Wheel${w}`, { wheel: w });
    const into = partMatrix(car, part).invert();
    const tyre = shapeFrom(inst, toCar, into, notes);
    if (tyre) { tyre.name = 'Tyre'; part.shapes.push(tyre); }
    for (const d of descendants(inst)) {
      if (SKIP.test(d.name)) continue;
      const s = kindOf(d) && shapeFrom(d, toCar, into, notes);
      if (s) part.shapes.push(s);
    }
    wheelParts[w] = part;
  }
  // right wheels become linked copies of the left ones when they match
  for (const [src, dst] of [['FL', 'FR'], ['RL', 'RR']] as [WheelPos, WheelPos][]) {
    const a = wheelParts[src], b = wheelParts[dst];
    if (a && b && sameShapes(a.shapes, b.shapes)) { b.shapes = []; b.link = a.id; }
  }
  for (const w of ['FL', 'FR', 'RL', 'RR'] as WheelPos[]) if (wheelParts[w]) car.parts.push(wheelParts[w]!);

  let folded = 0;
  for (const p of car.parts) if (!p.wheel) folded += foldMirrors(p);
  // game settings from the model's attributes
  const a = model?.attrs ?? {};
  const g = car.game;
  if (typeof a.Drivetrain === 'string') g.drivetrain = a.Drivetrain as Car['game']['drivetrain'];
  if (typeof a.MassKg === 'number') g.massKg = a.MassKg;
  if (typeof a.Handling === 'string') g.handling = a.Handling;
  for (const k of ['RimStyle', 'RimFinish', 'ExhaustLayout', 'ExhaustShape', 'ExhaustFinish'] as const) {
    if (typeof a[k] === 'string') (g as unknown as Record<string, string>)[k[0].toLowerCase() + k.slice(1)] = a[k] as string;
  }
  if (typeof a.ExhaustSide === 'number') g.exhaustSide = a.ExhaustSide;
  if (folded) notes.unshift(`Found ${folded} left/right pairs and linked them with Mirror, so changing one side changes both.`);
  if (skipped) notes.push('Left out the physics parts (Chassis, DriveSeat): the game adds those itself.');
  return { car, notes };
}

function sameShapes(a: Shape[], b: Shape[]): boolean {
  if (a.length !== b.length) return false;
  const k = (s: Shape) => `${s.name}|${s.kind}|${s.size.map((v) => v.toFixed(2))}|${s.pos.map((v) => v.toFixed(2))}|${s.color}`;
  const A = a.map(k).sort(), B = b.map(k).sort();
  return A.every((v, i) => v === B[i]);
}

function guessParams(model: RInst | null, unions: Part[], wheels: Partial<Record<WheelPos, RInst>>, toCar: THREE.Matrix4): CarParams {
  const p: CarParams = { length: 16, width: 6.2, floor: 0.45, belt: 3, roof: 4.6, wheelbase: 9.5, axleOffset: -4.75, trackF: 2.65, trackR: 2.65, wheelRadius: 1.17, wheelWidthF: 0.95, wheelWidthR: 0.95 };
  const box = (name: string) => {
    const u = unions.find((x) => x.name === name);
    if (!u) return null;
    const b = new THREE.Box3();
    for (const s of u.shapes) if (!s.cut) {
      const h = s.size.map((v) => v / 2);
      const m = shapeMatrix(s);
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) b.expandByPoint(new THREE.Vector3(x * h[0], y * h[1], z * h[2]).applyMatrix4(m));
    }
    return b.isEmpty() ? null : b;
  };
  const body = box('Body');
  if (body) {
    p.length = r4(body.max.z - body.min.z);
    p.width = r4(body.max.x - body.min.x);
    p.floor = r4(body.min.y);
  }
  const glass = box('Glass');
  if (glass) { p.belt = r4(glass.min.y); p.roof = r4(glass.max.y + 0.18); }
  const roofAttr = model?.attrs.RoofHeight;
  if (typeof roofAttr === 'number') p.roof = roofAttr;
  const pos = (w: WheelPos) => {
    const i = wheels[w];
    const cf = i?.props.CFrame as RCFrame | undefined;
    if (!i || !cf) return null;
    const v = new THREE.Vector3().setFromMatrixPosition(toCar.clone().multiply(cfMatrix(cf)));
    const size = (i.props.size ?? i.props.Size) as V3;
    return { v, size };
  };
  const fl = pos('FL') ?? pos('FR'), rl = pos('RL') ?? pos('RR');
  if (fl) { p.axleOffset = r4(fl.v.z); p.trackF = r4(Math.abs(fl.v.x)); p.wheelRadius = r4(fl.size[1] / 2); p.wheelWidthF = r4(fl.size[0]); }
  if (rl) { p.wheelbase = r4(rl.v.z - (fl?.v.z ?? -4.75)); p.trackR = r4(Math.abs(rl.v.x)); p.wheelWidthR = r4(rl.size[0]); }
  const wr = model?.attrs.WheelRadius;
  if (typeof wr === 'number') p.wheelRadius = wr;
  return p;
}
