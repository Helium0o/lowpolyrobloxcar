// Minimal binary FBX 7.4 writer for static meshes: named hierarchy, flat normals,
// vertex colours, simple projected UVs and one material per mesh. Written from the
// public format notes (same container layout Blender's exporter uses).

export interface FbxMesh {
  name: string;
  /** Triangle soup, 3 vertices per triangle, in the mesh's local space. */
  positions: Float32Array;
  /** RGB (0..1) per triangle. */
  triColors: Float32Array;
  material: { name: string; color: [number, number, number]; opacity: number };
}

export interface FbxNode {
  name: string;
  translation: [number, number, number];
  mesh?: FbxMesh;
  children?: FbxNode[];
}

export interface FbxOptions {
  /** Multiplies every coordinate. 1 = 1 stud per unit. */
  scale?: number;
  creator?: string;
}

// ---- low level node encoding ----

type Prop =
  | { t: 'C'; v: boolean }
  | { t: 'I'; v: number }
  | { t: 'L'; v: bigint }
  | { t: 'D'; v: number }
  | { t: 'S'; v: string }
  | { t: 'R'; v: Uint8Array }
  | { t: 'd'; v: ArrayLike<number> }
  | { t: 'i'; v: ArrayLike<number> };

interface Node {
  name: string;
  props: Prop[];
  children: Node[];
}

const enc = new TextEncoder();

const n = (name: string, props: Prop[] = [], children: Node[] = []): Node => ({ name, props, children });
const I = (v: number): Prop => ({ t: 'I', v });
const L = (v: bigint | number): Prop => ({ t: 'L', v: BigInt(v) });
const D = (v: number): Prop => ({ t: 'D', v });
const S = (v: string): Prop => ({ t: 'S', v });
const C = (v: boolean): Prop => ({ t: 'C', v });
const Ad = (v: ArrayLike<number>): Prop => ({ t: 'd', v });
const Ai = (v: ArrayLike<number>): Prop => ({ t: 'i', v });

/** Properties70 "P" entry. */
function P(name: string, type: string, label: string, flags: string, ...values: Prop[]): Node {
  return n('P', [S(name), S(type), S(label), S(flags), ...values]);
}

class Out {
  buf = new Uint8Array(1 << 16);
  len = 0;
  private view = new DataView(this.buf.buffer);
  ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.len + extra) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
    this.view = new DataView(nb.buffer);
  }
  u8(v: number) { this.ensure(1); this.view.setUint8(this.len, v); this.len += 1; }
  u32(v: number) { this.ensure(4); this.view.setUint32(this.len, v, true); this.len += 4; }
  i32(v: number) { this.ensure(4); this.view.setInt32(this.len, v, true); this.len += 4; }
  i64(v: bigint) { this.ensure(8); this.view.setBigInt64(this.len, v, true); this.len += 8; }
  f64(v: number) { this.ensure(8); this.view.setFloat64(this.len, v, true); this.len += 8; }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  patchU32(at: number, v: number) { this.view.setUint32(at, v, true); }
  result() { return this.buf.slice(0, this.len); }
}

function writeProp(o: Out, p: Prop) {
  o.u8(p.t.charCodeAt(0));
  switch (p.t) {
    case 'C': o.u8(p.v ? 1 : 0); break;
    case 'I': o.i32(p.v); break;
    case 'L': o.i64(p.v); break;
    case 'D': o.f64(p.v); break;
    case 'S':
    case 'R': {
      const b = p.t === 'S' ? enc.encode(p.v) : p.v;
      o.u32(b.length);
      o.bytes(b);
      break;
    }
    case 'd':
    case 'i': {
      const count = p.v.length;
      const w = p.t === 'd' ? 8 : 4;
      o.u32(count);
      o.u32(0); // encoding: raw
      o.u32(count * w);
      for (let i = 0; i < count; i++) p.t === 'd' ? o.f64(p.v[i]) : o.i32(p.v[i]);
      break;
    }
  }
}

const SENTINEL = new Uint8Array(13);

function writeNode(o: Out, node: Node) {
  const start = o.len;
  o.u32(0); // end offset, patched
  o.u32(node.props.length);
  o.u32(0); // property list length, patched
  const name = enc.encode(node.name);
  o.u8(name.length);
  o.bytes(name);
  const propStart = o.len;
  for (const p of node.props) writeProp(o, p);
  o.patchU32(start + 8, o.len - propStart);
  if (node.children.length || !node.props.length) {
    for (const c of node.children) writeNode(o, c);
    o.bytes(SENTINEL);
  }
  o.patchU32(start, o.len);
}

// Fixed ids/time used so the footer matches (same constants as Blender's exporter).
const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
const TIME_ID = '1970-01-01 10:00:00:000';
const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
const VERSION = 7400;

function encodeFile(top: Node[]): Uint8Array {
  const o = new Out();
  o.bytes(enc.encode('Kaydara FBX Binary  \0'));
  o.u8(0x1a);
  o.u8(0x00);
  o.u32(VERSION);
  for (const t of top) writeNode(o, t);
  o.bytes(SENTINEL);
  o.bytes(FOOT_ID);
  o.bytes(new Uint8Array(4));
  let pad = ((o.len + 15) & ~15) - o.len;
  if (pad === 0) pad = 16;
  o.bytes(new Uint8Array(pad));
  o.u32(VERSION);
  o.bytes(new Uint8Array(120));
  o.bytes(FOOT_MAGIC);
  return o.result();
}

// ---- scene ----

const objName = (name: string, cls: string) => `${name}\u0000\u0001${cls}`;

export function writeFbx(roots: FbxNode[], opts: FbxOptions = {}): Uint8Array {
  const scale = opts.scale ?? 1;
  const creator = opts.creator ?? 'Low Poly Car Builder';
  let nextId = 1000000n;
  const id = () => nextId++;

  const objects: Node[] = [];
  const connections: Node[] = [];
  const counts = { Model: 0, Geometry: 0, Material: 0, NodeAttribute: 0 };
  const oo = (child: bigint, parent: bigint) => connections.push(n('C', [S('OO'), L(child), L(parent)]));

  const modelNode = (mid: bigint, name: string, kind: 'Mesh' | 'Null', t: [number, number, number]) =>
    n('Model', [L(mid), S(objName(name, 'Model')), S(kind)], [
      n('Version', [I(232)]),
      n('Properties70', [], [
        P('Lcl Translation', 'Lcl Translation', '', 'A', D(t[0] * scale), D(t[1] * scale), D(t[2] * scale)),
        P('Lcl Rotation', 'Lcl Rotation', '', 'A', D(0), D(0), D(0)),
        P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)),
        P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)),
        P('InheritType', 'enum', '', '', I(1)),
      ]),
      n('Shading', [C(true)]),
      n('Culling', [S('CullingOff')]),
    ]);

  const visit = (node: FbxNode, parent: bigint) => {
    const mid = id();
    counts.Model++;
    if (node.mesh) {
      objects.push(modelNode(mid, node.name, 'Mesh', node.translation));
      const gid = id();
      counts.Geometry++;
      objects.push(geometryNode(gid, node.name, node.mesh, scale));
      const matId = id();
      counts.Material++;
      objects.push(materialNode(matId, node.mesh.material));
      oo(gid, mid);
      oo(matId, mid);
    } else {
      objects.push(modelNode(mid, node.name, 'Null', node.translation));
      const aid = id();
      counts.NodeAttribute++;
      objects.push(n('NodeAttribute', [L(aid), S(objName('', 'NodeAttribute')), S('Null')], [n('TypeFlags', [S('Null')])]));
      oo(aid, mid);
    }
    oo(mid, parent);
    for (const c of node.children ?? []) visit(c, mid);
  };
  for (const r of roots) visit(r, 0n);

  const definitions = n('Definitions', [], [
    n('Version', [I(100)]),
    n('Count', [I(1 + counts.Model + counts.Geometry + counts.Material + counts.NodeAttribute)]),
    n('ObjectType', [S('GlobalSettings')], [n('Count', [I(1)])]),
    ...(['Model', 'Geometry', 'Material', 'NodeAttribute'] as const)
      .filter((k) => counts[k] > 0)
      .map((k) => n('ObjectType', [S(k)], [n('Count', [I(counts[k])])])),
  ]);

  const top: Node[] = [
    n('FBXHeaderExtension', [], [
      n('FBXHeaderVersion', [I(1003)]),
      n('FBXVersion', [I(VERSION)]),
      n('EncryptionType', [I(0)]),
      n('CreationTimeStamp', [], [
        n('Version', [I(1000)]), n('Year', [I(1970)]), n('Month', [I(1)]), n('Day', [I(1)]),
        n('Hour', [I(10)]), n('Minute', [I(0)]), n('Second', [I(0)]), n('Millisecond', [I(0)]),
      ]),
      n('Creator', [S(creator)]),
      n('SceneInfo', [S(objName('GlobalInfo', 'SceneInfo')), S('UserData')], [
        n('Type', [S('UserData')]),
        n('Version', [I(100)]),
        n('MetaData', [], [
          n('Version', [I(100)]), n('Title', [S('')]), n('Subject', [S('')]), n('Author', [S('')]),
          n('Keywords', [S('')]), n('Revision', [S('')]), n('Comment', [S('')]),
        ]),
        n('Properties70', [], [
          P('Original|ApplicationVendor', 'KString', '', '', S('Helium0o')),
          P('Original|ApplicationName', 'KString', '', '', S(creator)),
          P('Original|ApplicationVersion', 'KString', '', '', S('0.1')),
        ]),
      ]),
    ]),
    n('FileId', [{ t: 'R', v: FILE_ID }]),
    n('CreationTime', [S(TIME_ID)]),
    n('Creator', [S(creator)]),
    n('GlobalSettings', [], [
      n('Version', [I(1000)]),
      n('Properties70', [], [
        P('UpAxis', 'int', 'Integer', '', I(1)),
        P('UpAxisSign', 'int', 'Integer', '', I(1)),
        P('FrontAxis', 'int', 'Integer', '', I(2)),
        P('FrontAxisSign', 'int', 'Integer', '', I(1)),
        P('CoordAxis', 'int', 'Integer', '', I(0)),
        P('CoordAxisSign', 'int', 'Integer', '', I(1)),
        P('OriginalUpAxis', 'int', 'Integer', '', I(1)),
        P('OriginalUpAxisSign', 'int', 'Integer', '', I(1)),
        P('UnitScaleFactor', 'double', 'Number', '', D(1)),
        P('OriginalUnitScaleFactor', 'double', 'Number', '', D(1)),
        P('AmbientColor', 'ColorRGB', 'Color', '', D(0), D(0), D(0)),
        P('DefaultCamera', 'KString', '', '', S('Producer Perspective')),
        P('TimeMode', 'enum', '', '', I(11)),
        P('TimeSpanStart', 'KTime', 'Time', '', L(0)),
        P('TimeSpanStop', 'KTime', 'Time', '', L(46186158000n)),
        P('CustomFrameRate', 'double', 'Number', '', D(24)),
      ]),
    ]),
    n('Documents', [], [
      n('Count', [I(1)]),
      n('Document', [L(id()), S(''), S('Scene')], [
        n('Properties70', [], [P('SourceObject', 'object', '', ''), P('ActiveAnimStackName', 'KString', '', '', S(''))]),
        n('RootNode', [L(0)]),
      ]),
    ]),
    n('References'),
    definitions,
    n('Objects', [], objects),
    n('Connections', [], connections),
    n('Takes', [], [n('Current', [S('')])]),
  ];
  return encodeFile(top);
}

function materialNode(mid: bigint, m: FbxMesh['material']): Node {
  const [r, g, b] = m.color;
  return n('Material', [L(mid), S(objName(m.name, 'Material')), S('')], [
    n('Version', [I(102)]),
    n('ShadingModel', [S('lambert')]),
    n('MultiLayer', [I(0)]),
    n('Properties70', [], [
      P('DiffuseColor', 'Color', '', 'A', D(r), D(g), D(b)),
      P('DiffuseFactor', 'Number', '', 'A', D(1)),
      P('TransparencyFactor', 'Number', '', 'A', D(1 - m.opacity)),
      P('Emissive', 'Vector3D', 'Vector', '', D(0), D(0), D(0)),
      P('Ambient', 'Vector3D', 'Vector', '', D(0), D(0), D(0)),
      P('Diffuse', 'Vector3D', 'Vector', '', D(r), D(g), D(b)),
      P('Opacity', 'double', 'Number', '', D(m.opacity)),
    ]),
  ]);
}

function geometryNode(gid: bigint, name: string, mesh: FbxMesh, scale: number): Node {
  const p = mesh.positions;
  const tris = p.length / 9;

  // Weld identical corners so the mesh is one closed surface in Roblox.
  const vertMap = new Map<string, number>();
  const verts: number[] = [];
  const polyIdx: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colorList: number[] = [];
  const colorMap = new Map<string, number>();
  const colorIdx: number[] = [];

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);

  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ax = p[o], ay = p[o + 1], az = p[o + 2];
    const ux = p[o + 3] - ax, uy = p[o + 4] - ay, uz = p[o + 5] - az;
    const vx = p[o + 6] - ax, vy = p[o + 7] - ay, vz = p[o + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue; // degenerate sliver
    nx /= len; ny /= len; nz /= len;
    const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);

    const cr = mesh.triColors[t * 3], cg = mesh.triColors[t * 3 + 1], cb = mesh.triColors[t * 3 + 2];
    const ck = `${cr.toFixed(4)},${cg.toFixed(4)},${cb.toFixed(4)}`;
    let ci = colorMap.get(ck);
    if (ci === undefined) {
      ci = colorList.length / 4;
      colorMap.set(ck, ci);
      colorList.push(cr, cg, cb, 1);
    }

    for (let k = 0; k < 3; k++) {
      const x = p[o + k * 3], y = p[o + k * 3 + 1], z = p[o + k * 3 + 2];
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let vi = vertMap.get(key);
      if (vi === undefined) {
        vi = verts.length / 3;
        vertMap.set(key, vi);
        verts.push(x * scale, y * scale, z * scale);
      }
      polyIdx.push(k === 2 ? -vi - 1 : vi);
      normals.push(nx, ny, nz);
      colorIdx.push(ci);
      // Box projection along the face's main axis, packed into 0..1.
      let u: number, v: number;
      if (anx >= any && anx >= anz) { u = (z - minZ) / ext; v = (y - minY) / ext; }
      else if (any >= anz) { u = (x - minX) / ext; v = (z - minZ) / ext; }
      else { u = (x - minX) / ext; v = (y - minY) / ext; }
      uvs.push(u, v);
    }
  }
  const uvIndex = Array.from({ length: uvs.length / 2 }, (_, i) => i);

  return n('Geometry', [L(gid), S(objName(name, 'Geometry')), S('Mesh')], [
    n('Properties70'),
    n('GeometryVersion', [I(124)]),
    n('Vertices', [Ad(verts)]),
    n('PolygonVertexIndex', [Ai(polyIdx)]),
    n('LayerElementNormal', [I(0)], [
      n('Version', [I(101)]),
      n('Name', [S('')]),
      n('MappingInformationType', [S('ByPolygonVertex')]),
      n('ReferenceInformationType', [S('Direct')]),
      n('Normals', [Ad(normals)]),
    ]),
    n('LayerElementColor', [I(0)], [
      n('Version', [I(101)]),
      n('Name', [S('Col')]),
      n('MappingInformationType', [S('ByPolygonVertex')]),
      n('ReferenceInformationType', [S('IndexToDirect')]),
      n('Colors', [Ad(colorList)]),
      n('ColorIndex', [Ai(colorIdx)]),
    ]),
    n('LayerElementUV', [I(0)], [
      n('Version', [I(101)]),
      n('Name', [S('UVMap')]),
      n('MappingInformationType', [S('ByPolygonVertex')]),
      n('ReferenceInformationType', [S('IndexToDirect')]),
      n('UV', [Ad(uvs)]),
      n('UVIndex', [Ai(uvIndex)]),
    ]),
    n('LayerElementMaterial', [I(0)], [
      n('Version', [I(101)]),
      n('Name', [S('')]),
      n('MappingInformationType', [S('AllSame')]),
      n('ReferenceInformationType', [S('IndexToDirect')]),
      n('Materials', [Ai([0])]),
    ]),
    n('Layer', [I(0)], [
      n('Version', [I(100)]),
      n('LayerElement', [], [n('Type', [S('LayerElementNormal')]), n('TypedIndex', [I(0)])]),
      n('LayerElement', [], [n('Type', [S('LayerElementColor')]), n('TypedIndex', [I(0)])]),
      n('LayerElement', [], [n('Type', [S('LayerElementUV')]), n('TypedIndex', [I(0)])]),
      n('LayerElement', [], [n('Type', [S('LayerElementMaterial')]), n('TypedIndex', [I(0)])]),
    ]),
  ]);
}
