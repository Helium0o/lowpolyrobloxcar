import { lauxlib, lua, lualib, to_jsstring, to_luastring } from 'fengari';

// Runs a Studio command-bar script in a real Lua VM (fengari) against a small mock of the Roblox API,
// so the export tests check what the script actually builds, not just its text.
// Unknown enum names raise errors, like in Studio, so a wrong material or shape name fails the test.

const MOCK = String.raw`
local LOG = {}
local MATERIALS = {}
for _, n in ipairs({"Plastic","SmoothPlastic","Neon","Wood","WoodPlanks","Marble","Slate","Concrete","Granite","Brick","Pebble","Cobblestone","CorrodedMetal","DiamondPlate","Foil","Metal","Grass","Sand","Fabric","Ice","Glass","ForceField","Rock","Basalt","Asphalt","LeafyGrass","Salt","Limestone","Pavement","CrackedLava","Mud","Snow","Glacier","Ground","Sandstone","Cardboard","Carpet","CeramicTiles","ClayRoofTiles","RoofShingles","Leather","Plaster","Rubber"}) do MATERIALS[n] = true end
local function enum(kind, names)
  local t = {}
  for _, n in ipairs(names) do t[n] = {EnumType = kind, Name = n} end
  return setmetatable(t, {__index = function(_, k) error(kind .. " has no item " .. tostring(k)) end})
end
local matEnum = {}
for n in pairs(MATERIALS) do matEnum[n] = {EnumType = "Material", Name = n} end
Enum = {
  Material = setmetatable(matEnum, {__index = function(_, k) error("Material has no item " .. tostring(k)) end}),
  PartType = enum("PartType", {"Block", "Cylinder", "Ball", "Wedge", "CornerWedge"}),
  NormalId = enum("NormalId", {"Front", "Back", "Left", "Right", "Top", "Bottom"}),
  SurfaceType = enum("SurfaceType", {"Smooth", "Studs", "Inlet"}),
  SurfaceGuiSizingMode = enum("SurfaceGuiSizingMode", {"PixelsPerStud", "FixedSize"}),
}
local function num(v, what) if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then error("bad number for " .. what .. ": " .. tostring(v)) end return v end
Vector3 = {new = function(x, y, z) return {X = num(x, "X"), Y = num(y, "Y"), Z = num(z, "Z"), kind = "Vector3"} end}
CFrame = {new = function(...)
  local a = {...}
  if #a == 0 then a = {0,0,0, 1,0,0, 0,1,0, 0,0,1} end
  if #a ~= 12 then error("CFrame.new needs 12 numbers here, got " .. #a) end
  for i = 1, 12 do num(a[i], "CFrame") end
  return {c = a, kind = "CFrame"}
end}
Color3 = {fromHex = function(h)
  if type(h) ~= "string" or not h:match("^#?%x%x%x%x%x%x$") then error("bad hex colour " .. tostring(h)) end
  return {hex = h, kind = "Color3"}
end}
UDim2 = {fromScale = function(x, y) return {x, y} end}

local Inst = {}
Inst.__index = function(self, k)
  local m = rawget(Inst, k); if m then return m end
  return rawget(self, "_p")[k]
end
Inst.__newindex = function(self, k, v)
  local p = rawget(self, "_p")
  if k == "Parent" then
    local old = p.Parent
    if old then for i, c in ipairs(rawget(old, "_c")) do if c == self then table.remove(rawget(old, "_c"), i) break end end end
    if v then table.insert(rawget(v, "_c"), self) end
  elseif k == "Shape" and v.EnumType ~= "PartType" then error("Shape needs a PartType")
  elseif k == "Material" and v.EnumType ~= "Material" then error("Material needs a Material")
  end
  p[k] = v
end
local BASE = {Part = true, WedgePart = true, CornerWedgePart = true, UnionOperation = true}
local function new(cls)
  local o = setmetatable({_p = {ClassName = cls, Name = cls}, _c = {}, _a = {}}, Inst)
  return o
end
function Inst.IsA(self, c) return self.ClassName == c or (c == "BasePart" and BASE[self.ClassName]) end
function Inst.SetAttribute(self, k, v) rawget(self, "_a")[k] = v end
function Inst.GetAttribute(self, k) return rawget(self, "_a")[k] end
function Inst.GetChildren(self) local t = {} for i, c in ipairs(rawget(self, "_c")) do t[i] = c end return t end
function Inst.GetDescendants(self)
  local t = {}
  local function walk(o) for _, c in ipairs(rawget(o, "_c")) do table.insert(t, c) walk(c) end end
  walk(self) return t
end
function Inst.FindFirstChild(self, n) for _, c in ipairs(rawget(self, "_c")) do if c.Name == n then return c end end return nil end
function Inst.Destroy(self) self.Parent = nil end
function Inst.Clone(self)
  local o = new(self.ClassName)
  for k, v in pairs(rawget(self, "_p")) do if k ~= "Parent" then rawget(o, "_p")[k] = v end end
  return o
end
local function union(self, others, op)
  if type(others) ~= "table" then error(op .. " needs a table of parts") end
  local all = {self}
  for _, o in ipairs(others) do if not o:IsA("BasePart") then error(op .. " got a non-part") end table.insert(all, o) end
  local u = new("UnionOperation")
  u.Name = self.Name; u.CFrame = self.CFrame; u.Size = self.Size; u.Color = self.Color; u.Material = self.Material
  rawget(u, "_p").Inputs = #all
  table.insert(LOG, table.concat({"UNION", op, tostring(#all)}, "\t"))
  return u
end
function Inst.UnionAsync(self, others) return union(self, others, "union") end
function Inst.SubtractAsync(self, others) return union(self, others, "subtract") end

Instance = {new = function(cls)
  if not (BASE[cls] or cls == "Model" or cls == "Folder" or cls == "SurfaceGui" or cls == "Frame" or cls == "StringValue") then error("unexpected class " .. cls) end
  return new(cls)
end}
workspace = new("Workspace"); workspace.Name = "Workspace"
local services = {
  ChangeHistoryService = {SetWaypoint = function() end},
  Selection = {Set = function() end},
  ReplicatedStorage = new("ReplicatedStorage"),
  ServerStorage = new("ServerStorage"),
}
game = {GetService = function(_, n) local s = services[n] if not s then error("no service " .. n) end return s end}
function print(...) local t = {} for i, v in ipairs({...}) do t[i] = tostring(v) end table.insert(LOG, "PRINT\t" .. table.concat(t, " ")) end

function __dump(root)
  local out = {}
  for _, line in ipairs(LOG) do table.insert(out, line) end
  local function walk(o, path)
    for _, c in ipairs(rawget(o, "_c")) do
      local p = rawget(c, "_p")
      local here = path .. "/" .. tostring(p.Name)
      if BASE[p.ClassName] then
        local s, cf = p.Size, p.CFrame
        table.insert(out, table.concat({"PART", p.ClassName, here, p.Shape and p.Shape.Name or "", s.X .. "," .. s.Y .. "," .. s.Z,
          table.concat(cf.c, ","), p.Material and p.Material.Name or "", p.Color and p.Color.hex or "", tostring(p.Transparency or 0),
          tostring(p.Anchored), tostring(p.CanCollide), rawget(c, "_a").WorkshopRecipe and "recipe" or ""}, "\t"))
      elseif p.ClassName == "StringValue" then
        table.insert(out, table.concat({"VALUE", here, p.Value}, "\t"))
      end
      walk(c, here)
    end
  end
  walk(root, "")
  return table.concat(out, "\n")
end
`;

export interface MockPart {
  cls: string;
  path: string;
  shape: string;
  size: number[];
  cf: number[];
  material: string;
  color: string;
  transparency: number;
  anchored: boolean;
  canCollide: boolean;
  recipe: boolean;
}
export interface MockResult {
  parts: MockPart[];
  values: { path: string; value: string }[];
  unions: { op: string; inputs: number }[];
  prints: string[];
}

function run(L: unknown, code: string, name: string) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
    throw new Error(`${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
}

/** Runs the script and returns everything under `root` ("workspace" or a service name). */
export function runInMockStudio(script: string, root = 'workspace'): MockResult {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  run(L, MOCK, 'mock');
  run(L, script, 'export');
  const rootExpr = root === 'workspace' ? 'workspace' : `game:GetService(${JSON.stringify(root)})`;
  run(L, `__out = __dump(${rootExpr})`, 'dump');
  lua.lua_getglobal(L, to_luastring('__out'));
  const text = to_jsstring(lua.lua_tostring(L, -1));
  const res: MockResult = { parts: [], values: [], unions: [], prints: [] };
  for (const line of text.split('\n')) {
    const f = line.split('\t');
    if (f[0] === 'PART') {
      res.parts.push({
        cls: f[1], path: f[2], shape: f[3], size: f[4].split(',').map(Number), cf: f[5].split(',').map(Number), material: f[6], color: f[7],
        transparency: Number(f[8]), anchored: f[9] === 'true', canCollide: f[10] === 'true', recipe: f[11] === 'recipe',
      });
    } else if (f[0] === 'VALUE') res.values.push({ path: f[1], value: f.slice(2).join('\t') });
    else if (f[0] === 'UNION') res.unions.push({ op: f[1], inputs: Number(f[2]) });
    else if (f[0] === 'PRINT') res.prints.push(f.slice(1).join('\t'));
  }
  return res;
}

/** Only compiles the script (for scripts that need the game's own modules to run). */
export function compiles(script: string): void {
  const L = lauxlib.luaL_newstate();
  if (lauxlib.luaL_loadbuffer(L, to_luastring(script), null, to_luastring('export')) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
}
