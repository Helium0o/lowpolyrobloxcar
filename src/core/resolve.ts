import * as THREE from 'three';
import { fromPosRot, MIRROR_X, rotMatrix } from './cf';
import type { Car, ColorSlot, Kind, Part, Shape, V3, WheelPos } from './types';

// Turns the document into "pieces": one Roblox primitive each, placed in car space, with repeats and mirror
// copies expanded and linked parts filled in. The viewport, the exporters and the measurements all read pieces,
// so what you see is exactly what gets exported.

export interface Piece {
  key: string;
  part: Part;
  shape: Shape;
  kind: Kind;
  size: V3;
  /** Car-space placement (proper rotation, no scale). */
  m: THREE.Matrix4;
  color: string;
  material: string;
  transparency: number;
  reflectance: number;
  cut: boolean;
  /** 0 for the shape itself; copies made by Repeat count up. */
  copy: number;
  mirrored: boolean;
}

export function colorOf(car: Car, c: string): string {
  if (c.startsWith('@')) return car.colors[c.slice(1) as ColorSlot] ?? '#ffffff';
  return c;
}

export function wheelCentre(car: Car, w: WheelPos): V3 {
  const p = car.params;
  const front = w[0] === 'F';
  const z = front ? p.axleOffset : p.axleOffset + p.wheelbase;
  const track = front ? p.trackF : p.trackR;
  const x = w[1] === 'L' ? -track : track;
  return [x, p.wheelRadius, z];
}

/** Car-space matrix of a part. Wheels sit on their axle; left wheels are turned round so their face points out. */
export function partMatrix(car: Car, part: Part): THREE.Matrix4 {
  if (part.wheel) {
    const c = wheelCentre(car, part.wheel);
    return fromPosRot(c, [0, part.wheel[1] === 'L' ? 180 : 0, 0]);
  }
  return fromPosRot(part.pos, part.rot);
}

/** The shapes a part shows: its own, or those of the part it is linked to. */
export function partShapes(car: Car, part: Part): Shape[] {
  if (part.link) {
    const src = car.parts.find((p) => p.id === part.link);
    if (src && src !== part) return src.shapes;
  }
  return part.shapes;
}

export function shapeMatrix(s: Shape, out = new THREE.Matrix4()): THREE.Matrix4 {
  return fromPosRot(s.pos, s.rot, out);
}

const RY90 = new THREE.Matrix4().makeRotationY(Math.PI / 2);

/** The mirror image (across car X = 0) of a primitive, still a proper Roblox primitive. */
export function mirrorPlacement(kind: Kind, m: THREE.Matrix4, size: V3): { m: THREE.Matrix4; size: V3 } {
  const r = MIRROR_X.clone().multiply(m).multiply(MIRROR_X);
  // Every shape but the corner wedge is symmetric across its own X, so M·R·M is enough. A corner wedge's
  // mirror image is the same wedge turned 90° about Y with X and Z sizes swapped.
  if (kind === 'cornerwedge') return { m: r.multiply(RY90), size: [size[2], size[1], size[0]] };
  return { m: r, size: [...size] };
}

/** Placements (part space) of a shape and its repeats. */
export function repeatMatrices(s: Shape): THREE.Matrix4[] {
  const base = shapeMatrix(s);
  const out = [base];
  const r = s.repeat;
  if (!r || r.count <= 1) return out;
  for (let i = 1; i < Math.min(64, Math.round(r.count)); i++) {
    const turn = rotMatrix([r.rotate[0] * i, r.rotate[1] * i, r.rotate[2] * i]);
    const move = new THREE.Matrix4().makeTranslation(r.offset[0] * i, r.offset[1] * i, r.offset[2] * i);
    out.push(turn.multiply(move).multiply(base));
  }
  return out;
}

export function resolvePart(car: Car, part: Part, includeHidden = false): Piece[] {
  const out: Piece[] = [];
  const pm = partMatrix(car, part);
  for (const s of partShapes(car, part)) {
    if (s.hidden && !includeHidden) continue;
    const mats = repeatMatrices(s);
    mats.forEach((lm, i) => {
      const m = pm.clone().multiply(lm);
      const base: Piece = {
        key: `${part.id}/${s.id}/${i}`,
        part,
        shape: s,
        kind: s.kind,
        size: [...s.size],
        m,
        color: s.decal ? s.decal.color : colorOf(car, s.color),
        material: s.material,
        transparency: s.decal ? 0 : s.transparency ?? 0,
        reflectance: s.reflectance ?? 0,
        cut: !!s.cut,
        copy: i,
        mirrored: false,
      };
      out.push(base);
      if (s.mirror) {
        const mp = mirrorPlacement(s.kind, m, s.size);
        if (!sameSolid(s.kind, mp.m, mp.size, m, s.size)) out.push({ ...base, key: base.key + 'm', m: mp.m, size: mp.size, mirrored: true });
      }
    });
  }
  return out;
}

export function resolveCar(car: Car, opts: { includeHidden?: boolean; forExport?: boolean } = {}): Map<string, Piece[]> {
  const out = new Map<string, Piece[]>();
  for (const p of car.parts) {
    if (p.hidden && !opts.includeHidden) continue;
    if (opts.forExport && p.noExport) continue;
    out.set(p.id, resolvePart(car, p, opts.includeHidden));
  }
  return out;
}

/** True when the part exports as a Roblox Union. */
export function isUnion(car: Car, part: Part): boolean {
  return !!part.union || partShapes(car, part).some((s) => s.cut && !s.hidden);
}

/** Corners of a piece's bounding box in car space. */
export function pieceCorners(p: Piece): THREE.Vector3[] {
  const h = p.size.map((v) => v / 2);
  const out: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(new THREE.Vector3(x * h[0], y * h[1], z * h[2]).applyMatrix4(p.m));
  return out;
}

export function piecesBox(pieces: Piece[], includeCuts = false): THREE.Box3 {
  const b = new THREE.Box3();
  for (const p of pieces) if (includeCuts || !p.cut) for (const c of pieceCorners(p)) b.expandByPoint(c);
  return b;
}

/** Key points that pin down a primitive's solid (so two placements that look the same compare equal). */
export function solidPoints(kind: Kind, m: THREE.Matrix4, size: V3): THREE.Vector3[] {
  const [hx, hy, hz] = size.map((v) => v / 2);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  switch (kind) {
    case 'ball': return [P(0, 0, 0), new THREE.Vector3(Math.min(hx, hy, hz), 0, 0)];
    case 'cylinder': {
      const r = Math.min(hy, hz);
      return [P(-hx, 0, 0), P(hx, 0, 0), new THREE.Vector3(r, 0, 0)];
    }
    case 'wedge': return [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(hx, hy, hz)];
    case 'cornerwedge': return [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(hx, hy, -hz)];
    default: {
      const out: THREE.Vector3[] = [];
      for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) out.push(P(x, y, z));
      return out;
    }
  }
}

/** True when two primitives fill exactly the same space. */
export function sameSolid(kind: Kind, a: THREE.Matrix4, sa: V3, b: THREE.Matrix4, sb: V3, eps = 0.006): boolean {
  const A = solidPoints(kind, a, sa), B = solidPoints(kind, b, sb);
  if (A.length !== B.length) return false;
  const used = new Set<number>();
  for (const p of A) {
    const i = B.findIndex((q, j) => !used.has(j) && p.distanceTo(q) < eps);
    if (i < 0) return false;
    used.add(i);
  }
  return true;
}
