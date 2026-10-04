import * as THREE from 'three';
import { components } from '../core/cf';
import { generator } from '../core/gen';
import { partShapes, resolvePart, type Piece } from '../core/resolve';
import { safeName, SLOT_INFO, type Car, type Part } from '../core/types';
import { measure, type Anchors } from './measure';

// The game's own shop-part format ("Game JSON first", chosen by LAS).
// ReplicatedStorage.CustomParts holds one StringValue per part: Name = item id, Value = JSON
//   {name, cat, price, currency, level, ref, p: [ROW...], layout? (exhaust), finish? (rims)}
// ROW = [role, shape (0 Block, 1 Wedge, 2 Cylinder along X, 3 Ball), sx, sy, sz, x, y, z, r00..r22,
//        (hex, material, transparency, reflectance when role = "custom")] in the slot's frame on the car it was
// drawn on; `ref` holds that car's measurements so the game (Kit.customFrames / Kit.fitRow) can stretch it to
// every other car. Two-sided slots (side skirts, head and taillights) store the LEFT side only.

export const GAME_CATS = ['frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood', 'headlights', 'taillights', 'hoodExtra', 'roofExtra', 'sideExtra', 'frontExtra', 'rearExtra', 'trunkExtra', 'exhaust', 'rims'] as const;
export type GameCat = (typeof GAME_CATS)[number];
const TWO_SIDED: GameCat[] = ['sideSkirts', 'headlights', 'taillights'];

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
export interface ShopInfo { price: number; currency: 'coins' | 'score'; level: number }

export function gameCatOf(part: Part): GameCat | null {
  const c = SLOT_INFO[part.slot]?.game;
  return c && (GAME_CATS as readonly string[]).includes(c) ? (c as GameCat) : null;
}

export function customPartId(part: Part): string {
  return 'cp_' + safeName(part.name).toLowerCase();
}

const rd = (n: number) => {
  const v = Math.round(n * 10000) / 10000;
  return Object.is(v, -0) ? 0 : v;
};
const SHAPE_CODE: Record<string, number> = { block: 0, wedge: 1, cornerwedge: 1, cylinder: 2, ball: 3 };

/** The game role of a piece: its own Game role setting, or one worked out from its colour, material and name. */
export function roleOf(car: Car, cat: GameCat, p: Piece): Row {
  const s = p.shape;
  const custom = (): Row => ['custom', p.color, p.material, rd(p.transparency), rd(p.reflectance)];
  if (s.role) return s.role === 'custom' ? custom() : [s.role];
  const n = s.name;
  if (cat === 'rims') {
    if (/^RimLip/.test(n)) return ['lip'];
    if (/^RimBarrel/.test(n)) return ['barrel'];
    if (s.color === '@rim') return ['face'];
  }
  if (cat === 'exhaust') {
    if (/Mouth|Soot/.test(n)) return ['soot'];
    if (/Lip/.test(n)) return ['lip'];
    if (/^Tip/.test(n)) return ['body'];
  }
  if (/ExhaustOutlet|^Outlet/.test(n)) return ['outlet'];
  if (p.material === 'Neon') {
    if (/^Headlight/.test(n) || s.color === '@light') return ['head'];
    if (/^Taillight/.test(n) || s.color === '@tail') return ['tail'];
    if (/^Fog/.test(n)) return ['fog'];
    if (/^Indicator/.test(n)) return ['amber'];
  }
  if (/^ReverseLight/.test(n)) return ['reverse'];
  if (/Housing/.test(n) && (cat === 'headlights' || cat === 'taillights')) return ['housing'];
  if (p.material === 'Glass' && (cat === 'headlights' || cat === 'taillights')) return [p.transparency > 0.45 ? 'lens' : 'smoke'];
  switch (s.color) {
    case '@paint': return ['paint'];
    case '@trim': return ['black'];
    case '@carbon': return ['carbon'];
    case '@chrome': return ['chrome'];
  }
  if (p.material === 'DiamondPlate') return ['mesh'];
  return custom();
}

function row(car: Car, cat: GameCat, p: Piece, toLocal: THREE.Matrix4): Row {
  const c = components(toLocal.clone().multiply(p.m));
  const look = roleOf(car, cat, p);
  const out: Row = [look[0], SHAPE_CODE[p.kind] ?? 0, ...p.size.map((v) => rd(Math.max(0.02, v))), ...c];
  if (look.length > 1) out.push(...look.slice(1));
  return out;
}

/** Left side (car -X) of a two-sided part. A block across the centre keeps its left half; other centre shapes drop. */
export function leftSide(pieces: Piece[]): { left: Piece[]; dropped: number } {
  const xOf = (p: Piece) => p.m.elements[12];
  const left = pieces.filter((p) => xOf(p) < -0.01);
  let dropped = 0;
  for (const p of pieces) {
    if (Math.abs(xOf(p)) > 0.01) continue;
    if (p.kind !== 'block' || Math.abs(p.m.elements[0]) < 0.9999) { dropped++; continue; }
    const m = p.m.clone();
    m.elements[12] -= p.size[0] / 4;
    left.push({ ...p, size: [p.size[0] / 2, p.size[1], p.size[2]], m });
  }
  return { left, dropped };
}

const CF = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));

/** The slot frame and `ref` measurements (Kit.customFrames) on this car. */
export function slotFrame(A: Anchors, cat: GameCat): { frame: THREE.Matrix4; ref: Record<string, number> } | null {
  const same: Partial<Record<GameCat, GameCat>> = { hoodExtra: 'hood', trunkExtra: 'spoiler', frontExtra: 'frontBumper', rearExtra: 'rearBumper' };
  const base = same[cat] ?? cat;
  const r = (v: number) => rd(v);
  switch (base) {
    case 'roofExtra': return { frame: CF(0, A.roof.y, A.roof.z), ref: { hw: r(A.roof.hw) } };
    case 'sideExtra': return { frame: CF(0, 0, A.side.z), ref: { x: r(A.side.x), L: r(A.side.L), yB: r(A.side.yB) } };
    case 'frontBumper': return { frame: CF(0, 0, A.front.z, Math.PI), ref: { W: r(A.front.W), yB: r(A.front.yB), yT: r(A.front.yT) } };
    case 'rearBumper': return { frame: CF(0, 0, A.rear.z), ref: { W: r(A.rear.W), yB: r(A.rear.yB), yT: r(A.rear.yT) } };
    case 'sideSkirts': return { frame: CF(-A.side.x, 0, A.side.z, -Math.PI / 2), ref: { L: r(A.side.L), yB: r(A.side.yB) } };
    case 'spoiler': return { frame: CF(0, A.deck.y, A.deck.z), ref: { hw: r(A.deck.hw) } };
    case 'hood': return { frame: A.hood.cf.clone(), ref: { hw: r(A.hood.hw), len: r(A.hood.len) } };
    case 'headlights':
    case 'taillights': {
      const L = (base === 'headlights' ? A.heads : A.tails).L;
      if (!L) return null;
      return { frame: L.cf.clone(), ref: { hw: r(L.hw), hh: r(L.hh) } };
    }
  }
  return null;
}

export function customPart(car: Car, part: Part, shop: ShopInfo, A?: Anchors): CustomPartResult {
  const id = customPartId(part);
  const notes: string[] = [];
  const cat = gameCatOf(part);
  if (!cat) return { id, part, data: null, notes: ['This slot has no shop category in the game. It goes out with the whole car instead.'] };
  let pieces = resolvePart(car, part);
  const cuts = pieces.filter((p) => p.cut).length;
  if (cuts) notes.push(`${cuts} cut shape${cuts > 1 ? 's are' : ' is'} left out: shop parts in the game are plain parts with no cuts.`);
  pieces = pieces.filter((p) => !p.cut);
  const cw = pieces.filter((p) => p.kind === 'cornerwedge').length;
  if (cw) notes.push(`${cw} corner wedge${cw > 1 ? 's go' : ' goes'} out as a plain wedge: the game's part rows have no corner wedge.`);
  let frame: THREE.Matrix4;
  let ref: Record<string, number>;
  const meta: Partial<CustomPart> = {};

  if (cat === 'rims') {
    // rim frame: +X out of the wheel face, origin at the wheel centre (the wheel part's own frame)
    pieces = resolvePart(car, { ...part, wheel: undefined, pos: [0, 0, 0], rot: [0, 0, 0] }).filter((p) => !p.cut && p.shape.name !== 'Tyre' && p.shape.name !== 'Sidewall');
    frame = new THREE.Matrix4();
    const shapes = partShapes(car, part);
    const tyre = shapes.find((s) => s.name === 'Tyre');
    const front = !part.wheel || part.wheel[0] === 'F';
    const width = tyre?.size[0] ?? (front ? car.params.wheelWidthF : car.params.wheelWidthR);
    ref = { W: rd(car.params.wheelRadius), T: rd(width / 2) };
    meta.finish = car.game.rimFinish || 'silver';
  } else if (cat === 'exhaust') {
    // tip frame: +Z out of the pipe, +Y up, origin where the pipe leaves the bodywork. One tip; the layout repeats it.
    const tip = pieces.find((p) => /^Tip$/.test(p.shape.name) && !p.mirrored && p.copy === 0) ?? pieces[0];
    const at = tip ? new THREE.Vector3().setFromMatrixPosition(tip.m) : new THREE.Vector3();
    const A2 = A ?? measure(car);
    frame = new THREE.Matrix4().makeTranslation(at.x, at.y, A2.zR);
    const inv = frame.clone().invert();
    pieces = pieces.filter((p) => {
      const q = new THREE.Vector3().setFromMatrixPosition(p.m).applyMatrix4(inv);
      return Math.hypot(q.x, q.y) < 0.6;
    });
    ref = {};
    const g = part.gen?.type === 'exhaust' ? part.gen.params : undefined;
    meta.layout = (typeof g?.layout === 'string' ? g.layout : car.game.exhaustLayout) || 'dual';
  } else {
    if (TWO_SIDED.includes(cat)) {
      const side = leftSide(pieces);
      pieces = side.left;
      if (!pieces.length) return { id, part, data: null, notes: [`${SLOT_INFO[part.slot].label} are stored as the left side (the car's -X side) and this part has nothing there.`] };
      if (side.dropped) notes.push(`${side.dropped} shape${side.dropped > 1 ? 's' : ''} on the centre line left out: the game builds the right side by mirroring the left.`);
    }
    const A2 = A ?? measure(car);
    let sf = slotFrame(A2, cat);
    if (!sf && (cat === 'headlights' || cat === 'taillights')) {
      // no stock lamps to measure: use this part's own lamps, like the game's lampFrame does
      const A3 = measure({ ...car, parts: [part] });
      sf = slotFrame({ ...A2, heads: A3.heads, tails: A3.tails }, cat);
    }
    if (!sf) return { id, part, data: null, notes: ['Could not find where this slot sits on the car.'] };
    ({ frame, ref } = sf);
  }
  if (!pieces.length) return { id, part, data: null, notes: [...notes, 'Nothing to export.'] };
  const toLocal = frame.clone().invert();
  const data: CustomPart = {
    name: pretty(part.name), cat, price: shop.price, currency: shop.currency, level: shop.level, ref,
    p: pieces.map((p) => row(car, cat, p, toLocal)), ...meta,
  };
  return { id, part, data, notes };
}

const pretty = (name: string) => name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

/** Parts of a car that can go to the game's shop. Linked wheel copies are one rim design. */
export function exportableParts(car: Car): Part[] {
  const seen = new Set<string>();
  const out: Part[] = [];
  for (const p of car.parts) {
    if (p.hidden || p.noExport || !gameCatOf(p)) continue;
    if (p.slot === 'wheel') {
      const src = p.link ?? p.id;
      if (seen.has(src)) continue;
      seen.add(src);
      // prefer the right-hand wheel: its face points +X like the game's rim frame
      if (p.wheel && p.wheel[1] === 'L') {
        const right = car.parts.find((q) => q.link === p.id && q.wheel?.[1] === 'R');
        if (right) { out.push({ ...right, name: rimName(car, p) }); continue; }
      }
      out.push({ ...p, name: rimName(car, p) });
      continue;
    }
    out.push(p);
  }
  return out;
}

function rimName(car: Car, p: Part): string {
  const src = car.parts.find((q) => q.id === (p.link ?? p.id)) ?? p;
  const style = src.gen?.type === 'wheel' ? String(src.gen.params.style ?? 'Rim') : 'Rim';
  const g = generator('wheel');
  void g;
  return `Rim_${safeName(car.name)}_${style}${src.wheel?.[0] === 'R' ? '_Rear' : ''}`;
}

export function customParts(car: Car, parts: Part[], shop: ShopInfo): CustomPartResult[] {
  const A = measure(car);
  return parts.map((p) => customPart(car, p, shop, A));
}

/** Studio command bar script that adds / updates these parts in ReplicatedStorage.CustomParts. */
export function customPartsScript(list: CustomPartResult[]): string {
  const ok = list.filter((r) => r.data);
  const entries = ok.map((r) => {
    const json = JSON.stringify(r.data);
    let eq = '=';
    while (json.includes(`]${eq}]`)) eq += '=';
    return `  {${JSON.stringify(r.id)}, [${eq}[${json}]${eq}]},`;
  });
  return [
    '-- Low Poly Car Builder: shop parts for ReplicatedStorage.CustomParts.',
    '-- Paste all of this into the Studio command bar (View > Command Bar) in edit mode and press Enter.',
    '-- Parts with the same id are replaced. Play the game to see them in the Customs shop. Ctrl+Z undoes it.',
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
