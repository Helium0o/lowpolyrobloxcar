import * as THREE from 'three';
import { buildPart, builtBounds, type BuiltMesh, type BuiltPart } from './build';
import { writeFbx, type FbxNode } from './fbx';
import { ROLES, safeName, type Car, type Part, type Role, type Shape } from './model';
import { hasMirrorCopy } from './shapes';
import { baseSpec, exhaustOutlets, makeCtx } from './templates';

// Everything the app writes for Roblox:
//   <Part>.fbx            one file per part (LAS's game swaps parts individually)
//   <Car>.fbx             optional whole car, one named group per part
//   <Car>_Settings.rbxmx  attributes + effect attachments the game reads to spawn aura, underglow, boost
//   <Car>_Settings.json   the same settings as plain JSON
//   <Car>_Recipes.json    each part as a WorkshopRecipe (adds/cuts of Roblox parts)

export interface ExportOptions {
  scale: number;
  /** Paint meshes are written white so the colour can be applied as a tint in Roblox. */
  whitePaint: boolean;
}

export interface OutFile {
  name: string;
  data: Uint8Array;
}

const enc = new TextEncoder();
const hexRgb = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

function fbxMeshNode(car: Car, m: BuiltMesh, translation: [number, number, number], opts: ExportOptions): FbxNode {
  const triColors = new Float32Array(m.tris * 3);
  const white = opts.whitePaint && m.group === 'paint';
  for (let t = 0; t < m.tris; t++) {
    const rgb = white ? [1, 1, 1] : hexRgb(car.paint[ROLES[m.roles[t]]]);
    triColors.set(rgb, t * 3);
  }
  // One material per mesh: its colour is the main role of the mesh (white for vertex-coloured detail meshes).
  const mainRole = ROLES[m.roles[0]];
  const matColor: [number, number, number] = white || m.group === 'detail' ? [1, 1, 1] : hexRgb(car.paint[mainRole]);
  const opacity = m.group === 'glass' ? car.glassOpacity : 1;
  return { name: m.name, translation, mesh: { name: m.name, positions: m.positions, triColors, material: { name: m.name + '_Mat', color: matColor, opacity } } };
}

export function visibleParts(car: Car): BuiltPart[] {
  return car.parts.filter((p) => !p.hidden).map(buildPart).filter((bp) => bp.tris > 0);
}

/** One .fbx for one part. Each mesh keeps the part pivot as its position, so parts line up when imported. */
export function partFbx(car: Car, bp: BuiltPart, opts: ExportOptions): Uint8Array {
  const nodes = bp.meshes.map((m) => fbxMeshNode(car, m, bp.part.pivot, opts));
  return writeFbx(nodes, { scale: opts.scale });
}

export function carFbx(car: Car, parts: BuiltPart[], opts: ExportOptions): Uint8Array {
  const roots: FbxNode[] = parts.map((bp) =>
    bp.meshes.length === 1
      ? fbxMeshNode(car, bp.meshes[0], bp.part.pivot, opts)
      : { name: bp.name, translation: bp.part.pivot, children: bp.meshes.map((m) => fbxMeshNode(car, m, [0, 0, 0], opts)) },
  );
  return writeFbx(roots, { scale: opts.scale });
}

export function uniqueNames(parts: BuiltPart[]): Map<BuiltPart, string> {
  const used = new Map<string, number>();
  const out = new Map<BuiltPart, string>();
  for (const bp of parts) {
    const n = used.get(bp.name) ?? 0;
    used.set(bp.name, n + 1);
    out.set(bp, n ? `${bp.name}_${n + 1}` : bp.name);
  }
  return out;
}

// ---------- Roblox check ----------

export interface Issue {
  level: 'error' | 'warn' | 'ok';
  text: string;
}

export const CAR_TRI_TARGET = 3000;

export function robloxCheck(car: Car, parts: BuiltPart[]): Issue[] {
  const issues: Issue[] = [];
  let total = 0;
  for (const bp of parts) {
    total += bp.tris;
    for (const m of bp.meshes) {
      if (m.tris > 20000) issues.push({ level: 'error', text: `${m.name} has ${m.tris} triangles. Roblox allows 20,000 per mesh.` });
    }
    const size = builtBounds(bp).getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) > 2048) issues.push({ level: 'error', text: `${bp.name} is bigger than 2048 studs.` });
    if (bp.csgFailed) issues.push({ level: 'warn', text: `A cut in ${bp.name} could not be applied. Try moving the hole a little.` });
  }
  const dupes = new Set<string>();
  const seen = new Set<string>();
  for (const bp of parts) (seen.has(bp.name) ? dupes : seen).add(bp.name);
  for (const d of dupes) issues.push({ level: 'warn', text: `More than one part is called ${d}. Exported files get a number added.` });
  if (total > CAR_TRI_TARGET * 2) issues.push({ level: 'warn', text: `${total} triangles in total. Low poly cars usually stay near ${CAR_TRI_TARGET}.` });
  if (!parts.some((p) => p.part.slot === 'body')) issues.push({ level: 'warn', text: 'There is no body part.' });
  if (!issues.length) issues.push({ level: 'ok', text: `Ready for Roblox: ${parts.length} parts, ${total} triangles, every mesh under 20,000.` });
  return issues;
}

// ---------- settings (effects as data the game spawns) ----------

type AttrValue = string | number | boolean | { color: string } | { v3: [number, number, number] };

export interface FxPoint {
  name: string;
  pos: [number, number, number];
  attrs?: Record<string, AttrValue>;
}

export interface CarSettings {
  attributes: Record<string, AttrValue>;
  attachments: FxPoint[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const v3 = (a: number[]): [number, number, number] => [round(a[0]), round(a[1]), round(a[2])];

export function carSettings(car: Car, parts: BuiltPart[]): CarSettings {
  const spec = baseSpec(car.base);
  const c = makeCtx(spec, car.wheels);
  const box = new THREE.Box3();
  for (const bp of parts) box.union(builtBounds(bp));
  const size = box.isEmpty() ? new THREE.Vector3(c.W, c.roof, c.L) : box.getSize(new THREE.Vector3());
  const centre = box.isEmpty() ? new THREE.Vector3(0, c.roof / 2, 0) : box.getCenter(new THREE.Vector3());
  const e = car.effects;
  const col = (r: Role) => ({ color: car.paint[r] });

  const attributes: Record<string, AttrValue> = {
    CarName: car.name,
    BaseBody: spec.id,
    RimStyle: car.choices.rims,
    RimFinish: car.rimFinish,
    TyreStyle: car.choices.tyres,
    ExhaustLayout: car.choices.exhaust,
    ExhaustShape: car.choices.exhaustTips,
    ExhaustFinish: car.exhaustFinish,
    ExhaustNow: `${car.choices.exhaust}/${car.choices.exhaustTips}/${car.exhaustFinish}`,
    RimNow: `${car.choices.rims}/${car.rimFinish}`,
    ExhaustSide: 1,
    WheelRadius: round(car.wheels.radius),
    WheelWidth: round(car.wheels.width),
    Wheelbase: round(car.wheels.wheelbase),
    Track: round(car.wheels.track),
    RoofHeight: round(box.isEmpty() ? c.roof : box.max.y),
    PaintColor: col('paint'),
    AccentColor: col('accent'),
    TrimColor: col('trim'),
    RimColor: col('rim'),
    ExhaustColor: col('tip'),
    WindowTint: col('glass'),
    WindowTransparency: round(1 - car.glassOpacity),
    HeadlightColor: col('light'),
    TaillightColor: col('tail'),
    HeadlightBeams: e.headlightBeams,
    UnderglowEnabled: e.underglow.on,
    UnderglowColor: col('glow'),
    UnderglowBrightness: e.underglow.brightness,
    BoostTrail: e.boost.style,
    BoostColor: { color: e.boost.color },
    Aura: e.aura.style,
    AuraColor: { color: e.aura.color },
    AttachmentOrigin: 'Ground centre, front faces -Z',
  };
  for (const [slot, v] of Object.entries(car.choices)) attributes[`Slot_${slot}`] = v;

  const hl = c.mounts.headlights, tl = c.mounts.taillights, ex = c.mounts.exhaust;
  const outlets = exhaustOutlets(c, car.choices.exhaust);
  const tipLen = car.choices.exhaustTips === 'bigbore' ? 0.52 : 0.42;
  const tips = outlets.map((o, i): FxPoint => {
    const p = o.dir === 'up' ? [o.p[0], o.p[1] + tipLen, o.p[2]] : [o.p[0], o.p[1], o.p[2] + tipLen];
    return { name: 'TipFx', pos: v3([p[0] + ex[0], p[1] + ex[1], p[2] + ex[2]]), attrs: { TipId: i + 1, Direction: o.dir === 'up' ? 'Up' : 'Back' } };
  });
  const attachments: FxPoint[] = [
    { name: 'HeadLampL', pos: v3([-c.W * 0.32, hl[1], hl[2] - 0.15]) },
    { name: 'HeadLampR', pos: v3([c.W * 0.32, hl[1], hl[2] - 0.15]) },
    { name: 'RearLamp', pos: v3([0, tl[1], tl[2] + 0.15]) },
    ...(tips.length ? [{ name: 'Exhaust', pos: tips[0].pos }] : []),
    ...tips,
    { name: 'Underglow', pos: v3([0, Math.max(0.05, c.bottom * 0.5), 0]), attrs: { Size: { v3: v3([c.W - 0.8, 0.1, c.L - 2]) } } },
    { name: 'Aura', pos: v3(centre.toArray()), attrs: { Size: { v3: v3(size.toArray()) } } },
  ];
  return { attributes, attachments };
}

export function settingsJson(s: CarSettings): Uint8Array {
  return enc.encode(JSON.stringify(s, null, 2));
}

// Roblox attribute blob (the AttributesSerialize property).
function attributeBlob(attrs: Record<string, AttrValue>): Uint8Array {
  const parts: number[] = [];
  const buf = new DataView(new ArrayBuffer(8));
  const u32 = (v: number) => { buf.setUint32(0, v, true); parts.push(...new Uint8Array(buf.buffer, 0, 4)); };
  const f32 = (v: number) => { buf.setFloat32(0, v, true); parts.push(...new Uint8Array(buf.buffer, 0, 4)); };
  const f64 = (v: number) => { buf.setFloat64(0, v, true); parts.push(...new Uint8Array(buf.buffer, 0, 8)); };
  const str = (s: string) => { const b = enc.encode(s); u32(b.length); parts.push(...b); };
  const entries = Object.entries(attrs);
  u32(entries.length);
  for (const [k, v] of entries) {
    str(k);
    if (typeof v === 'string') { parts.push(0x02); str(v); }
    else if (typeof v === 'boolean') { parts.push(0x03, v ? 1 : 0); }
    else if (typeof v === 'number') { parts.push(0x06); f64(v); }
    else if ('color' in v) { const c = new THREE.Color(v.color); parts.push(0x0f); f32(c.r); f32(c.g); f32(c.b); }
    else { parts.push(0x11); f32(v.v3[0]); f32(v.v3[1]); f32(v.v3[2]); }
  }
  return new Uint8Array(parts);
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cframeXml(name: string, p: [number, number, number]) {
  return `<CoordinateFrame name="${name}"><X>${p[0]}</X><Y>${p[1]}</Y><Z>${p[2]}</Z><R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame>`;
}

/** A Roblox model file: Model (attributes) > FxAnchor part > attachments, plus Recipes folder. */
export function settingsRbxmx(car: Car, s: CarSettings, recipes: PartRecipe[]): Uint8Array {
  let ref = 0;
  const r = () => `RBX${ref++}`;
  const attr = (a: Record<string, AttrValue>) => `<BinaryString name="AttributesSerialize">${b64(attributeBlob(a))}</BinaryString>`;
  const atts = s.attachments
    .map((a) => `<Item class="Attachment" referent="${r()}"><Properties><string name="Name">${xmlEsc(a.name)}</string>${cframeXml('CFrame', a.pos)}${a.attrs ? attr(a.attrs) : ''}</Properties></Item>`)
    .join('\n');
  const recipeItems = recipes
    .map((rc) => `<Item class="Configuration" referent="${r()}"><Properties><string name="Name">${xmlEsc(rc.name)}</string>${attr({ WorkshopRecipe: JSON.stringify(rc.recipe), Slot: rc.slot, Variant: rc.variant, Pivot: { v3: rc.pivot } })}</Properties></Item>`)
    .join('\n');
  const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
<Item class="Model" referent="${r()}"><Properties><string name="Name">${xmlEsc(safeName(car.name))}_Settings</string>${attr(s.attributes)}</Properties>
<Item class="Part" referent="${r()}"><Properties><string name="Name">FxAnchor</string><bool name="Anchored">true</bool><bool name="CanCollide">false</bool><bool name="CanQuery">false</bool><bool name="CanTouch">false</bool><bool name="Massless">true</bool><float name="Transparency">1</float><Vector3 name="size"><X>1</X><Y>1</Y><Z>1</Z></Vector3>${cframeXml('CFrame', [0, 0, 0])}</Properties>
${atts}
</Item>
<Item class="Folder" referent="${r()}"><Properties><string name="Name">Recipes</string></Properties>
${recipeItems}
</Item>
</Item>
</roblox>
`;
  return enc.encode(xml);
}

// ---------- WorkshopRecipe (LAS's in-game shape format) ----------

interface RecipeEntry {
  cf: number[];
  rf: number;
  c: string;
  col: string;
  m: string;
  t: number;
  s: number[];
  sh: string;
  approx?: boolean;
}
export interface PartRecipe {
  name: string;
  slot: string;
  variant: string;
  pivot: [number, number, number];
  recipe: { adds: RecipeEntry[]; cuts: RecipeEntry[] };
}

const MAT: Partial<Record<Role, string>> = { glass: 'Glass', light: 'Neon', tail: 'Neon', glow: 'Neon', chrome: 'Metal', rim: 'Metal', tip: 'Metal' };

function recipeEntry(car: Car, s: Shape, m: THREE.Matrix4): RecipeEntry {
  const rotFix = new THREE.Matrix4();
  let size = [...s.size];
  let c = 'Part', sh = 'Block', approx = false;
  switch (s.type) {
    case 'box': break;
    case 'wedge': c = 'WedgePart'; break;
    case 'cornerWedge': c = 'CornerWedgePart'; break;
    case 'sphere': sh = 'Ball'; break;
    case 'cylinder':
    case 'cone':
    case 'tire':
      // Roblox cylinders run along X; ours run along Y.
      sh = 'Cylinder';
      rotFix.makeRotationZ(Math.PI / 2);
      size = [s.size[1], s.size[0], s.size[2]];
      approx = s.type !== 'cylinder';
      break;
    case 'taperBox': {
      const [tx, tz] = s.taper ?? [0.8, 0.7, 0];
      size = [s.size[0] * (1 + tx) / 2, s.size[1], s.size[2] * (1 + tz) / 2];
      approx = true;
      break;
    }
    default: approx = true;
  }
  const full = m.clone().multiply(rotFix);
  const pos = new THREE.Vector3().setFromMatrixPosition(full);
  const e = full.elements; // column-major
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const cf = [pos.x, pos.y, pos.z, e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]].map(r);
  const entry: RecipeEntry = {
    cf, rf: 0, c, col: car.paint[s.role], m: MAT[s.role] ?? 'SmoothPlastic', t: s.role === 'glass' ? r(1 - car.glassOpacity) : 0, s: size.map((v) => r(Math.abs(v))), sh,
  };
  if (approx) entry.approx = true;
  return entry;
}

/** Shapes in car space, including mirror copies (reflection applied as M·R·M so rotations stay proper). */
export function partRecipe(car: Car, part: Part, name: string): PartRecipe {
  const adds: RecipeEntry[] = [], cuts: RecipeEntry[] = [];
  const pivot = new THREE.Matrix4().makeTranslation(...part.pivot);
  for (const s of part.shapes) {
    if (s.hidden) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...s.rot.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number], 'XYZ'));
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...s.pos), q, new THREE.Vector3(1, 1, 1));
    const world = pivot.clone().multiply(local);
    const list = s.hole ? cuts : adds;
    list.push(recipeEntry(car, s, world));
    if (hasMirrorCopy(s, part.pivot[0])) {
      const M = new THREE.Matrix4().makeScale(-1, 1, 1);
      const mirrored = M.clone().multiply(world).multiply(M);
      list.push(recipeEntry(car, s, mirrored));
    }
  }
  return { name, slot: part.slot, variant: part.variant, pivot: v3(part.pivot), recipe: { adds, cuts } };
}

// ---------- the whole export ----------

export interface ExportChoice {
  parts: boolean;
  wholeCar: boolean;
  settings: boolean;
  recipes: boolean;
}

export function exportFiles(car: Car, choice: ExportChoice, opts: ExportOptions, only?: Part): OutFile[] {
  const built = only ? [buildPart(only)] : visibleParts(car);
  const names = uniqueNames(built);
  const carName = safeName(car.name);
  const files: OutFile[] = [];
  if (choice.parts || only) for (const bp of built) files.push({ name: `${names.get(bp)}.fbx`, data: partFbx(car, bp, opts) });
  if (choice.wholeCar && !only) files.push({ name: `${carName}.fbx`, data: carFbx(car, built, opts) });
  const recipes = choice.recipes ? built.map((bp) => partRecipe(car, bp.part, names.get(bp)!)) : [];
  if (choice.recipes) files.push({ name: `${only ? names.get(built[0]) : carName}_Recipes.json`, data: enc.encode(JSON.stringify(recipes, null, 1)) });
  if (choice.settings && !only) {
    const s = carSettings(car, visibleParts(car));
    files.push({ name: `${carName}_Settings.rbxmx`, data: settingsRbxmx(car, s, recipes) });
    files.push({ name: `${carName}_Settings.json`, data: settingsJson(s) });
  }
  return files;
}
