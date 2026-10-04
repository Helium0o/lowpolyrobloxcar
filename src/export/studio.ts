import * as THREE from 'three';
import { components } from '../core/cf';
import { bodyInfo } from '../core/gen/info';
import { isUnion, partShapes, piecesBox, resolvePart, wheelCentre, type Piece } from '../core/resolve';
import { safeName, type Car, type Part } from '../core/types';

// Whole-car export: a Lua script for the Studio command bar that builds the car out of real Roblox parts.
// - "Model only" (default): a plain Model of anchored, non-colliding parts. Unions are made with UnionAsync /
//   SubtractAsync and keep their recipe in a WorkshopRecipe attribute, like LAS's own cars.
// - "Drivable": builds the same shapes through the game's CarKit (ServerStorage.CarKit / CarBodyKit) and calls
//   k.finish, which adds the game's own chassis, wheels, seat and lights. The builder adds no physics itself.

export interface StudioOptions {
  drivable: boolean;
  /** Where the model goes: Workspace or ServerStorage. */
  parent: 'Workspace' | 'ServerStorage';
}

const r4 = (v: number) => {
  const x = Math.round(v * 10000) / 10000;
  return Object.is(x, -0) ? 0 : x;
};
const CLASS: Record<string, [string, string | null]> = {
  block: ['Part', 'Block'], wedge: ['WedgePart', null], cornerwedge: ['CornerWedgePart', null], cylinder: ['Part', 'Cylinder'], ball: ['Part', 'Ball'],
};
const luaStr = (s: string) => JSON.stringify(s);

/** One piece as a Lua table: {name, class, shape, size, cframe, hex, material, transparency, reflectance, decalFace, decalHex}. */
function pieceRow(p: Piece, local?: THREE.Matrix4): string {
  const [cls, shape] = CLASS[p.kind];
  const m = local ? local.clone().multiply(p.m) : p.m;
  const c = components(m);
  const d = p.shape.decal;
  return `{${luaStr(p.shape.name)},${luaStr(cls)},${shape ? luaStr(shape) : 'nil'},{${p.size.map(r4).join(',')}},{${c.join(',')}},${luaStr(p.color)},${luaStr(p.material)},${r4(p.transparency)},${r4(p.reflectance)}${d ? `,${luaStr(d.face)},${luaStr(d.color)}` : ''}}`;
}

function recipeJson(pieces: Piece[]): string {
  const ent = (p: Piece) => {
    const [cls, shape] = CLASS[p.kind];
    return { cf: components(p.m), rf: r4(p.reflectance), c: cls, col: p.color, m: p.material, t: r4(p.transparency), s: p.size.map(r4), sh: shape ?? 'Block' };
  };
  return JSON.stringify({ adds: pieces.filter((p) => !p.cut).map(ent), cuts: pieces.filter((p) => p.cut).map(ent) });
}

function longString(s: string): string {
  let eq = '=';
  while (s.includes(`]${eq}]`)) eq += '=';
  return `[${eq}[${s}]${eq}]`;
}

interface Block { kind: 'parts' | 'union' | 'wheel' | 'model'; name: string; rows: string[]; cuts?: string[]; recipe?: string; color?: string; material?: string; transparency?: number; reflectance?: number; extra?: string[]; children?: Block[] }

function partBlocks(car: Car, part: Part): Block[] {
  const pieces = resolvePart(car, part);
  if (!pieces.length) return [];
  if (part.wheel) return [];
  if (isUnion(car, part)) {
    const adds = pieces.filter((p) => !p.cut);
    if (!adds.length) return [];
    const first = adds[0];
    return [{ kind: 'union', name: safeName(part.name), rows: adds.map((p) => pieceRow(p)), cuts: pieces.filter((p) => p.cut).map((p) => pieceRow(p)), recipe: recipeJson(pieces), color: first.color, material: first.material, transparency: first.transparency, reflectance: first.reflectance }];
  }
  return [{ kind: 'parts', name: safeName(part.name), rows: pieces.filter((p) => !p.cut).map((p) => pieceRow(p)) }];
}

/** Wheels: the "Tyre" shape becomes the WheelXX part, the rest goes in a "Rim" model inside it (as in the game). */
function wheelBlock(car: Car, part: Part): Block | null {
  const pieces = resolvePart(car, part).filter((p) => !p.cut);
  if (!pieces.length) return null;
  const tyre = pieces.find((p) => p.shape.name === 'Tyre');
  if (!tyre) return null;
  const rest = pieces.filter((p) => p !== tyre && p.shape.name !== 'Caliper');
  const cal = pieces.filter((p) => p.shape.name === 'Caliper');
  return {
    kind: 'wheel', name: part.name,
    rows: [pieceRow({ ...tyre, shape: { ...tyre.shape, name: part.name } })],
    extra: rest.map((p) => pieceRow(p)),
    cuts: cal.map((p) => pieceRow(p)),
  };
}

const HEADER = (car: Car, drivable: boolean) => [
  `-- Low Poly Car Builder: ${car.name}`,
  '-- Paste all of this into the Roblox Studio command bar (View > Command Bar) in edit mode and press Enter.',
  drivable
    ? '-- Builds the car with your game\'s CarKit (ServerStorage.CarKit + CarBodyKit), which adds the chassis, wheels, seat and lights.'
    : '-- Builds the car as a plain model of anchored parts (no scripts, welds or physics). Ctrl+Z removes it.',
  '-- Car space: the front faces -Z, the ground is y = 0, 1 stud = 0.28 m (same as Bubblegum World).',
  '',
];

function helpers(): string[] {
  return [
    'local C3, V3, CFN = Color3.fromHex, Vector3.new, CFrame.new',
    'local function cfOf(c) return CFN(c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12]) end',
    'local function mat(name) local ok, m = pcall(function() return Enum.Material[name] end); return ok and m or Enum.Material.SmoothPlastic end',
    'local function look(p, r)',
    '  p.Color = C3(r[6]); p.Material = mat(r[7]); p.Transparency = r[8] or 0; p.Reflectance = r[9] or 0',
    '  if r[10] then',
    '    p.Transparency = 0.999; p.CastShadow = false',
    '    local sg = Instance.new("SurfaceGui"); sg.Name = "FlushDecal"; sg.Face = Enum.NormalId[r[10]]',
    '    sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud; sg.PixelsPerStud = 30; sg.LightInfluence = 1; sg.Parent = p',
    '    local f = Instance.new("Frame"); f.Size = UDim2.fromScale(1, 1); f.BackgroundColor3 = C3(r[11]); f.BorderSizePixel = 0; f.Parent = sg',
    '  end',
    'end',
  ];
}

export function studioScript(car: Car, o: StudioOptions = { drivable: false, parent: 'Workspace' }): string {
  const blocks: Block[] = [];
  // in drivable mode CarKit adds its own dash, seats and floor, so the interior part is left out
  for (const p of car.parts) if (!p.hidden && !p.noExport && !p.wheel && !(o.drivable && p.slot === 'interior')) blocks.push(...partBlocks(car, p));
  const wheels = car.parts.filter((p) => p.wheel && !p.hidden && !p.noExport).map((p) => wheelBlock(car, p)).filter((b): b is Block => !!b);
  const name = safeName(car.name);
  const L: string[] = HEADER(car, o.drivable);
  L.push('local CHS = game:GetService("ChangeHistoryService")', 'local Selection = game:GetService("Selection")', ...helpers());

  if (!o.drivable) {
    L.push(
      `local model = Instance.new("Model"); model.Name = ${luaStr(name)}`,
      'local tmp = Instance.new("Folder"); tmp.Name = "LPCB_tmp"; tmp.Parent = workspace',
      'local function make(r, parent)',
      '  local p = Instance.new(r[2]); if r[3] then p.Shape = Enum.PartType[r[3]] end',
      '  p.Name = r[1]; p.Size = V3(r[4][1], r[4][2], r[4][3]); p.CFrame = cfOf(r[5]); look(p, r)',
      '  p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth',
      '  p.Anchored = true; p.CanCollide = false; p.CanTouch = false; p.Massless = true; p.Parent = parent',
      '  return p',
      'end',
      'local function union(name, adds, cuts, recipe, col, m, t, rf)',
      '  local a = {}; for _, r in ipairs(adds) do table.insert(a, make(r, tmp)) end',
      '  local c = {}; for _, r in ipairs(cuts) do table.insert(c, make(r, tmp)) end',
      '  local u = #a > 1 and a[1]:UnionAsync({table.unpack(a, 2)}) or a[1]:Clone()',
      '  if #c > 0 then u.Parent = tmp; u = u:SubtractAsync(c) end',
      '  u.Name = name; if u:IsA("UnionOperation") then u.UsePartColor = true end',
      '  u.Color = C3(col); u.Material = mat(m); u.Transparency = t; u.Reflectance = rf',
      '  u.Anchored = true; u.CanCollide = false; u.CanTouch = false; u.Massless = true',
      '  u:SetAttribute("WorkshopRecipe", recipe); u.Parent = model',
      '  return u',
      'end',
    );
    for (const b of blocks) {
      if (b.kind === 'union') {
        L.push(`union(${luaStr(b.name)}, {`, ...b.rows.map((r) => `  ${r},`), '}, {', ...(b.cuts ?? []).map((r) => `  ${r},`), `}, ${longString(b.recipe!)}, ${luaStr(b.color!)}, ${luaStr(b.material!)}, ${r4(b.transparency ?? 0)}, ${r4(b.reflectance ?? 0)})`);
      } else {
        L.push(`for _, r in ipairs({`, ...b.rows.map((r) => `  ${r},`), '}) do make(r, model) end');
      }
    }
    for (const w of wheels) {
      L.push(
        'do',
        `  local tyre = make(${w.rows[0]}, model)`,
        '  local rim = Instance.new("Model"); rim.Name = "Rim"; rim.Parent = tyre',
        '  for _, r in ipairs({', ...(w.extra ?? []).map((r) => `    ${r},`), '  }) do make(r, rim) end',
        '  for _, r in ipairs({', ...(w.cuts ?? []).map((r) => `    ${r},`), '  }) do make(r, tyre) end',
        'end',
      );
    }
    L.push(
      'tmp:Destroy()',
      'model.WorldPivot = CFrame.new()',
      ...attributes(car, 'model'),
      `model.Parent = ${o.parent === 'ServerStorage' ? 'game:GetService("ServerStorage")' : 'workspace'}`,
      'Selection:Set({model})',
      'CHS:SetWaypoint("Build car")',
      `print("Built ${name}: " .. #model:GetDescendants() .. " instances")`,
      '',
    );
    return L.join('\n');
  }

  // drivable: the game's CarKit builds the rig
  const spec = finishSpec(car);
  L.push(
    'local SS = game:GetService("ServerStorage")',
    'local function load(inst)',
    '  local ok, m = pcall(require, inst)',
    '  if ok and m then return m end',
    '  return loadstring(inst.Source)()',
    'end',
    'local K = load(SS:WaitForChild("CarKit"))',
    'local B = load(SS:WaitForChild("CarBodyKit"))',
    `local k = K.new(${luaStr(name + 'Template')})`,
    'local SM = Enum.Material.SmoothPlastic',
    'local function shapeOf(r) if r[2] == "WedgePart" then return "wedge" elseif r[2] == "CornerWedgePart" then return "cornerwedge" elseif r[3] and r[3] ~= "Block" then return r[3] end return nil end',
    'local function P(r) local p = k.P(r[1], {V3(r[4][1], r[4][2], r[4][3]), cfOf(r[5])}, C3(r[6]), mat(r[7]), shapeOf(r)); look(p, r); return p end',
    'local function T(r) return k.T({V3(r[4][1], r[4][2], r[4][3]), cfOf(r[5])}, C3(r[6]), mat(r[7]), shapeOf(r)) end',
  );
  for (const b of blocks) {
    if (b.kind === 'union') {
      L.push(
        'do',
        '  local adds, cuts = {}, {}',
        '  for _, r in ipairs({', ...b.rows.map((r) => `    ${r},`), '  }) do table.insert(adds, T(r)) end',
        '  for _, r in ipairs({', ...(b.cuts ?? []).map((r) => `    ${r},`), '  }) do table.insert(cuts, T(r)) end',
        `  local u = B.unionTo(k, adds, cuts, ${luaStr(b.name)}, C3(${luaStr(b.color!)}), mat(${luaStr(b.material!)}), ${r4(b.reflectance ?? 0)}, ${r4(b.transparency ?? 0)})`,
        `  u:SetAttribute("WorkshopRecipe", ${longString(b.recipe!)})`,
        'end',
      );
    } else {
      L.push('for _, r in ipairs({', ...b.rows.map((r) => `  ${r},`), '}) do P(r) end');
    }
  }
  L.push(
    `local model = k.finish(${spec})`,
    ...attributes(car, 'model'),
    `model.Parent = ${o.parent === 'ServerStorage' ? 'SS' : 'workspace'}`,
    'Selection:Set({model})',
    'CHS:SetWaypoint("Build drivable car")',
    `print("Built ${name} with CarKit. Check it in Play mode, then move it to ServerStorage as a template when you are happy.")`,
    '',
  );
  return L.join('\n');
}

function attributes(car: Car, v: string): string[] {
  const g = car.game;
  const a: [string, string | number][] = [
    ['CarName', car.game.carName || car.name], ['RoofHeight', r4(car.params.roof)], ['WheelRadius', r4(car.params.wheelRadius)],
    ['Drivetrain', g.drivetrain], ['MassKg', g.massKg], ['Handling', g.handling], ['RimStyle', g.rimStyle], ['RimFinish', g.rimFinish],
    ['ExhaustLayout', g.exhaustLayout], ['ExhaustShape', g.exhaustShape], ['ExhaustFinish', g.exhaustFinish], ['ExhaustSide', g.exhaustSide],
  ];
  return a.map(([k, x]) => `${v}:SetAttribute(${luaStr(k)}, ${typeof x === 'number' ? x : luaStr(x)})`);
}

/** The spec table k.finish expects, worked out from the car's sizes and lamps. */
export function finishSpec(car: Car): string {
  const P = car.params;
  const B = bodyInfo(car);
  const all = car.parts.filter((p) => !p.hidden).flatMap((p) => resolvePart(car, p));
  const centreOf = (re: RegExp, side?: number) => {
    const list = all.filter((p) => re.test(p.shape.name) && (side === undefined || Math.sign(p.m.elements[12]) === side));
    if (!list.length) return null;
    return piecesBox(list).getCenter(new THREE.Vector3());
  };
  const hl = centreOf(/^Headlight/, -1), hr = centreOf(/^Headlight/, 1);
  const tail = centreOf(/^Taillight/);
  const tip = centreOf(/^Tip$/);
  const front = -P.length / 2, rear = P.length / 2;
  const v = (x: THREE.Vector3 | null, d: [number, number, number]) => (x ? [r4(x.x), r4(x.y), r4(x.z)] : d);
  const fw = wheelCentre(car, 'FR'), rw = wheelCentre(car, 'RR');
  const lamp = (x: THREE.Vector3 | null, sx: number) => v(x ? new THREE.Vector3(x.x, x.y, front - 0.05) : null, [sx * (P.width / 2 - 1), P.belt - 0.6, r4(front - 0.05)]);
  const rimStyle = /rallye|fuchs/.test(car.game.rimStyle) ? car.game.rimStyle : 'fivespoke';
  const wheelW = (pos: 'F' | 'R') => {
    const p = car.parts.find((x) => x.wheel?.[0] === pos);
    const t = p && partShapes(car, p).find((s) => s.name === 'Tyre');
    return r4(t?.size[0] ?? (pos === 'F' ? P.wheelWidthF : P.wheelWidthR));
  };
  const seatZ = r4((B.rf + B.rb) / 2 + 0.2);
  return `{
  R = ${r4(P.wheelRadius)}, axleF = ${r4(fw[2])}, axleR = ${r4(rw[2])}, trackF = ${r4(P.trackF)}, trackR = ${r4(P.trackR)}, wheelWF = ${wheelW('F')}, wheelWR = ${wheelW('R')},
  chassis = {w = ${r4(Math.max(3, P.width - 0.4))}, h = 2.1, l = ${r4(P.length - 0.6)}, cy = ${r4(P.floor + 1.3)}},
  seat = {x = ${r4(B.gw * 0.4)}, y = ${r4(P.floor + 0.35)}, z = ${seatZ}, recline = 18, dashY = ${r4(P.belt - 0.35)}, dashZ = ${r4(B.ws + 0.6)}},
  roof = ${r4(P.roof)}, drivetrain = ${luaStr(car.game.drivetrain)}, massKg = ${car.game.massKg}, carName = ${luaStr(car.game.carName || car.name)},
  headLamps = {{${lamp(hl, -1).join(', ')}}, {${lamp(hr, 1).join(', ')}}}, rearLamp = {${v(tail ? new THREE.Vector3(0, tail.y, rear + 0.1) : null, [0, r4(P.belt - 0.5), r4(rear + 0.1)]).join(', ')}},
  exhaust = {${v(tip, [1.6, r4(P.floor + 0.3), r4(rear)]).join(', ')}},
  rim = {style = ${luaStr(rimStyle)}, color = Color3.fromHex(${luaStr(car.colors.rim)}), color2 = Color3.fromHex(${luaStr(car.colors.trim)})},
}`;
}
