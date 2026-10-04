import { decompress as zstdDecompress } from 'fzstd';

// Reader for Roblox binary model / place files (.rbxm / .rbxl), enough to bring cars in:
// instance tree, names, part sizes, CFrames, colours, materials, shapes and attributes.
// Format notes: https://github.com/rojo-rbx/rbx-dom/blob/master/docs/binary.md

export interface RInst {
  ref: number;
  className: string;
  name: string;
  props: Record<string, unknown>;
  attrs: Record<string, unknown>;
  parent: RInst | null;
  children: RInst[];
}

export interface RCFrame {
  p: [number, number, number];
  /** Row-major R00 R01 R02 R10 R11 R12 R20 R21 R22. */
  r: number[];
}

export const MATERIALS: Record<number, string> = {
  256: 'Plastic', 272: 'SmoothPlastic', 288: 'Neon', 512: 'Wood', 528: 'WoodPlanks', 784: 'Marble', 800: 'Slate',
  816: 'Concrete', 832: 'Granite', 848: 'Brick', 864: 'Pebble', 880: 'Cobblestone', 1040: 'CorrodedMetal',
  1056: 'DiamondPlate', 1072: 'Foil', 1088: 'Metal', 1280: 'Grass', 1296: 'Sand', 1312: 'Fabric', 1328: 'Snow',
  1344: 'Mud', 1360: 'Ground', 1376: 'Asphalt', 1392: 'Salt', 1536: 'Ice', 1552: 'Glacier', 1568: 'Glass',
  1584: 'ForceField', 1792: 'Air', 2048: 'Water',
};

/** CFrame rotation ids: (X, Y, Z) degrees applied Y, X, Z. */
const ROT_IDS: Record<number, [number, number, number]> = {
  0x02: [0, 0, 0], 0x03: [90, 0, 0], 0x05: [0, 180, 180], 0x06: [-90, 0, 0], 0x07: [0, 180, 90], 0x09: [0, 90, 90],
  0x0a: [0, 0, 90], 0x0c: [0, -90, 90], 0x0d: [-90, -90, 0], 0x0e: [0, -90, 0], 0x10: [90, -90, 0], 0x11: [0, 90, 180],
  0x14: [0, 180, 0], 0x15: [-90, -180, 0], 0x17: [0, 0, 180], 0x18: [90, 180, 0], 0x19: [0, 0, -90], 0x1b: [0, -90, -90],
  0x1c: [0, -180, -90], 0x1e: [0, 90, -90], 0x1f: [90, 90, 0], 0x20: [0, 90, 0], 0x22: [-90, 90, 0], 0x23: [0, -90, 180],
};

/** Rotation matrix (row-major) for Y, then X, then Z degrees: R = Ry * Rx * Rz. */
export function rotFromYXZ([x, y, z]: [number, number, number]): number[] {
  const d = Math.PI / 180;
  const cx = Math.cos(x * d), sx = Math.sin(x * d), cy = Math.cos(y * d), sy = Math.sin(y * d), cz = Math.cos(z * d), sz = Math.sin(z * d);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const r = mul3(mul3(Ry, Rx), Rz);
  return r.map((v) => (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9));
}
function mul3(a: number[], b: number[]): number[] {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}
export function rotFromId(id: number): number[] {
  return rotFromYXZ(ROT_IDS[id] ?? [0, 0, 0]);
}

// ---------- LZ4 block ----------
export function lz4Block(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    out.set(src.subarray(i, i + lit), o);
    i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let len = token & 15;
    if (len === 15) { let b; do { b = src[i++]; len += b; } while (b === 255); }
    len += 4;
    let from = o - off;
    for (let k = 0; k < len; k++) out[o++] = out[from++];
  }
  return out;
}

class Reader {
  o = 0;
  dv: DataView;
  constructor(public b: Uint8Array) { this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.b[this.o++]; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  i32() { const v = this.dv.getInt32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }
  take(n: number) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  str() { return this.take(this.u32()); }
  text() { return td.decode(this.str()); }
  get done() { return this.o >= this.b.length; }
}
const td = new TextDecoder();

// interleaved big-endian arrays
function deinterleave(b: Uint8Array, n: number, w: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const x = new Uint8Array(w);
    for (let j = 0; j < w; j++) x[j] = b[j * n + i];
    out.push(x);
  }
  return out;
}
const be32 = (x: Uint8Array) => ((x[0] << 24) | (x[1] << 16) | (x[2] << 8) | x[3]) >>> 0;
const zz = (v: number) => (v >>> 1) ^ -(v & 1);
function ints(r: Reader, n: number) { return deinterleave(r.take(4 * n), n, 4).map((x) => zz(be32(x))); }
function uints(r: Reader, n: number) { return deinterleave(r.take(4 * n), n, 4).map(be32); }
const f32buf = new DataView(new ArrayBuffer(4));
function rbxFloat(u: number) {
  const v = ((u >>> 1) | ((u & 1) << 31)) >>> 0;
  f32buf.setUint32(0, v);
  return f32buf.getFloat32(0);
}
function floats(r: Reader, n: number) { return uints(r, n).map(rbxFloat); }
function refs(r: Reader, n: number) {
  const v = ints(r, n);
  let acc = 0;
  return v.map((d) => (acc += d));
}

function readCFrames(r: Reader, n: number): RCFrame[] {
  const rots: number[][] = [];
  for (let i = 0; i < n; i++) {
    const id = r.u8();
    if (id === 0) { const m: number[] = []; for (let k = 0; k < 9; k++) m.push(r.f32()); rots.push(m); }
    else rots.push(rotFromId(id));
  }
  const x = floats(r, n), y = floats(r, n), z = floats(r, n);
  return rots.map((rr, i) => ({ p: [x[i], y[i], z[i]], r: rr }));
}

function readAttributes(blob: Uint8Array): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (blob.length < 4) return out;
  const r = new Reader(blob);
  try {
    const n = r.u32();
    for (let i = 0; i < n; i++) {
      const k = r.text();
      const t = r.u8();
      let v: unknown;
      switch (t) {
        case 2: v = r.text(); break;
        case 3: v = r.u8() !== 0; break;
        case 4: v = r.i32(); break;
        case 5: v = r.f32(); break;
        case 6: v = r.f64(); break;
        case 9: v = [r.f32(), r.i32()]; break;
        case 10: v = [r.f32(), r.i32(), r.f32(), r.i32()]; break;
        case 14: v = r.u32(); break;
        case 15: v = { color: [r.f32(), r.f32(), r.f32()] }; break;
        case 16: v = [r.f32(), r.f32()]; break;
        case 17: v = [r.f32(), r.f32(), r.f32()]; break;
        case 20: {
          const p: [number, number, number] = [r.f32(), r.f32(), r.f32()];
          const id = r.u8();
          let m: number[];
          if (id === 0) { m = []; for (let k = 0; k < 9; k++) m.push(r.f32()); } else m = rotFromId(id);
          v = { p, r: m } as RCFrame;
          break;
        }
        case 21: v = { enum: r.text(), value: r.u32() }; break;
        case 23: { const c = r.u32(); r.take(12 * c); v = null; break; }
        case 25: { const c = r.u32(); r.take(20 * c); v = null; break; }
        case 27: r.take(8); v = null; break;
        case 28: r.take(16); v = null; break;
        case 24: r.take(8); v = null; break; // NumberRange-ish fallbacks
        default: return out; // unknown type: stop rather than misread
      }
      if (v !== null) out[k] = v;
    }
  } catch {
    /* keep what was read */
  }
  return out;
}

export function readRbxm(data: Uint8Array): RInst[] {
  const head = td.decode(data.subarray(0, 8));
  if (head !== '<roblox!') throw new Error('This is not a binary Roblox file (.rbxm / .rbxl). Save it from Studio as a binary model.');
  let o = 32;
  const classes = new Map<number, { name: string; ids: number[] }>();
  const insts = new Map<number, RInst>();
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  while (o < data.length) {
    const name = td.decode(data.subarray(o, o + 4));
    const clen = dv.getUint32(o + 4, true), ulen = dv.getUint32(o + 8, true);
    o += 16;
    let body: Uint8Array;
    if (clen === 0) { body = data.subarray(o, o + ulen); o += ulen; }
    else {
      const raw = data.subarray(o, o + clen);
      o += clen;
      body = raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd ? zstdDecompress(raw) : lz4Block(raw, ulen);
    }
    const r = new Reader(body);
    if (name === 'INST') {
      const cid = r.u32();
      const cname = r.text();
      r.u8();
      const n = r.u32();
      const ids = refs(r, n);
      classes.set(cid, { name: cname, ids });
      for (const id of ids) insts.set(id, { ref: id, className: cname, name: '', props: {}, attrs: {}, parent: null, children: [] });
    } else if (name === 'PROP') {
      const cid = r.u32();
      const pname = r.text();
      const t = r.u8();
      const cls = classes.get(cid);
      if (!cls) continue;
      const n = cls.ids.length;
      let vals: unknown[] | null = null;
      try {
        switch (t) {
          case 0x01: {
            const raw = Array.from({ length: n }, () => r.str());
            vals = pname === 'AttributesSerialize' ? raw.map(readAttributes) : raw.map((v) => td.decode(v));
            break;
          }
          case 0x02: vals = Array.from(r.take(n), (x) => x !== 0); break;
          case 0x03: vals = ints(r, n); break;
          case 0x04: vals = floats(r, n); break;
          case 0x05: vals = Array.from({ length: n }, () => r.f64()); break;
          case 0x0c: case 0x0e: { const a = floats(r, n), b = floats(r, n), c = floats(r, n); vals = a.map((v, i) => [v, b[i], c[i]]); break; }
          case 0x10: vals = readCFrames(r, n); break;
          case 0x12: vals = uints(r, n); break;
          case 0x13: vals = refs(r, n); break;
          case 0x1a: { const a = r.take(n), b = r.take(n), c = r.take(n); vals = Array.from(a, (v, i) => [v, b[i], c[i]]); break; }
          case 0x1e: { r.u8(); const cfs = readCFrames(r, n); r.u8(); const has = Array.from(r.take(n), (x) => x !== 0); vals = cfs.map((c, i) => (has[i] ? c : null)); break; }
        }
      } catch {
        vals = null;
      }
      if (vals) cls.ids.forEach((id, i) => {
        const inst = insts.get(id)!;
        if (pname === 'Name') inst.name = vals![i] as string;
        else if (pname === 'AttributesSerialize') inst.attrs = vals![i] as Record<string, unknown>;
        else inst.props[pname] = vals![i];
      });
    } else if (name === 'PRNT') {
      r.u8();
      const n = r.u32();
      const ch = refs(r, n), pa = refs(r, n);
      ch.forEach((c, i) => {
        const child = insts.get(c), parent = insts.get(pa[i]);
        if (child && parent) { child.parent = parent; parent.children.push(child); }
      });
    } else if (name === 'END\0') break;
  }
  return [...insts.values()].filter((i) => !i.parent);
}

export function* descendants(i: RInst): Generator<RInst> {
  for (const c of i.children) { yield c; yield* descendants(c); }
}
