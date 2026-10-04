import * as THREE from 'three';

// A line-by-line port of the parts of LAS's game that read CustomParts rows
// (ReplicatedStorage.ShopCatalog: Kit.customFrames, Kit.fitRow, Rim customStyle, Exhaust custom tips),
// so the tests can place exported rows exactly the way the game does.

export type Fit = [number, number]; // {offset, scale}
export interface GameFrame { cf: THREE.Matrix4; fx: Fit; fy: Fit; fz: Fit; mirror: boolean }
export interface Lamp { cf: THREE.Matrix4; hw: number; hh: number }
export interface GameAnchors {
  front: { z: number; W: number; yB: number; yT: number };
  rear: { z: number; W: number; yB: number; yT: number };
  side: { x: number; z: number; L: number; yB: number };
  deck: { y: number; z: number; hw: number };
  roof: { y: number; z: number; hw: number };
  hood: { cf: THREE.Matrix4; len: number; hw: number };
  heads: { L?: Lamp; R?: Lamp };
  tails: { L?: Lamp; R?: Lamp };
}

const CF = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const Ry = (a: number) => new THREE.Matrix4().makeRotationY(a);

export function customFrames(A: GameAnchors, slot: string, ref: Record<string, number> = {}): GameFrame[] {
  const k = (cur: number, was?: number) => (was !== undefined && was > 0.01 ? cur / was : 1);
  const same = ({ hoodExtra: 'hood', trunkExtra: 'spoiler', frontExtra: 'frontBumper', rearExtra: 'rearBumper' } as Record<string, string>)[slot];
  if (same) return customFrames(A, same, ref);
  const f = (cf: THREE.Matrix4, fx: Fit, fy: Fit, fz: Fit, mirror = false): GameFrame => ({ cf, fx, fy, fz, mirror });
  if (slot === 'roofExtra') return [f(CF(0, A.roof.y, A.roof.z), [0, k(A.roof.hw, ref.hw)], [0, 1], [0, 1])];
  if (slot === 'sideExtra') {
    const sd = A.side;
    return [f(CF(0, 0, sd.z), [0, k(sd.x, ref.x)], [sd.yB - (ref.yB ?? sd.yB), 1], [0, k(sd.L, ref.L)])];
  }
  if (slot === 'frontBumper' || slot === 'rearBumper') {
    const b = slot === 'frontBumper' ? A.front : A.rear;
    const ky = k(b.yT - b.yB, ref.yT !== undefined && ref.yB !== undefined ? ref.yT - ref.yB : undefined);
    const fr = slot === 'frontBumper' ? CF(0, 0, b.z).multiply(Ry(Math.PI)) : CF(0, 0, b.z);
    return [f(fr, [0, k(b.W, ref.W)], [b.yB - (ref.yB ?? b.yB) * ky, ky], [0, 1])];
  }
  if (slot === 'sideSkirts') {
    const sd = A.side;
    const fx: Fit = [0, k(sd.L, ref.L)], fy: Fit = [sd.yB - (ref.yB ?? sd.yB), 1];
    return [f(CF(-sd.x, 0, sd.z).multiply(Ry(-Math.PI / 2)), fx, fy, [0, 1]), f(CF(sd.x, 0, sd.z).multiply(Ry(Math.PI / 2)), fx, fy, [0, 1], true)];
  }
  if (slot === 'spoiler') return [f(CF(0, A.deck.y, A.deck.z), [0, k(A.deck.hw, ref.hw)], [0, 1], [0, 1])];
  if (slot === 'hood') return [f(A.hood.cf.clone(), [0, k(A.hood.hw, ref.hw)], [0, 1], [0, k(A.hood.len, ref.len)])];
  if (slot === 'headlights' || slot === 'taillights') {
    const t = slot === 'headlights' ? A.heads : A.tails;
    const out: GameFrame[] = [];
    for (const [key, m] of [['L', false], ['R', true]] as const) {
      const L = t[key];
      if (L) out.push(f(L.cf.clone(), [0, k(L.hw, ref.hw)], [0, k(L.hh, ref.hh)], [0, 1], m));
    }
    return out;
  }
  return [];
}

export interface GamePiece { r: string; s: THREE.Vector3; sh: string; cf: THREE.Matrix4 }
const SHAPES = ['Block', 'Wedge', 'Cylinder', 'Ball'];

/** CFrame.new(x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22) */
export function cframe(c: number[]): THREE.Matrix4 {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = c;
  return new THREE.Matrix4().set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
}

export function fitRow(row: (string | number)[], frame: THREE.Matrix4, fx: Fit, fy: Fit, fz: Fit, mirror = false): GamePiece {
  let [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = row.slice(5, 17) as number[];
  const [bx, by, bz] = [fx[1], fy[1], fz[1]];
  const len = (a: number, b: number, c: number) => Math.sqrt((a * bx) ** 2 + (b * by) ** 2 + (c * bz) ** 2);
  const sx = (row[2] as number) * len(r00, r10, r20), sy = (row[3] as number) * len(r01, r11, r21), sz = (row[4] as number) * len(r02, r12, r22);
  x = fx[0] + bx * x; y = fy[0] + by * y; z = fz[0] + bz * z;
  if (mirror) { x = -x; r01 = -r01; r02 = -r02; r10 = -r10; r20 = -r20; }
  return {
    r: row[0] as string, s: new THREE.Vector3(Math.max(sx, 0.02), Math.max(sy, 0.02), Math.max(sz, 0.02)), sh: SHAPES[row[1] as number] ?? 'Block',
    cf: frame.clone().multiply(cframe([x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22])),
  };
}

/** Kit.pieces for a custom design. */
export function pieces(A: GameAnchors, d: { cat: string; ref: Record<string, number>; p: (string | number)[][] }): GamePiece[] {
  const out: GamePiece[] = [];
  for (const f of customFrames(A, d.cat, d.ref)) for (const r of d.p) out.push(fitRow(r, f.cf, f.fx, f.fy, f.fz, f.mirror));
  return out;
}

/** Rim.customStyle: rows in the rim frame placed on a tyre of radius W and half width T. Returns wheel-frame pieces. */
export function rimPieces(d: { ref: Record<string, number>; p: (string | number)[][] }, W: number, T: number): GamePiece[] {
  const ref = d.ref ?? {};
  const k = W / (ref.W ?? W);
  return d.p.map((r) => {
    const c = cframe(r.slice(5, 17) as number[]);
    const pos = new THREE.Vector3().setFromMatrixPosition(c);
    const rot = c.clone().setPosition(0, 0, 0);
    const cf = CF(T + (pos.x - (ref.T ?? T)) * k, pos.y * k, pos.z * k).multiply(rot);
    return { r: r[0] as string, s: new THREE.Vector3(r[2] as number, r[3] as number, r[4] as number).multiplyScalar(k), sh: SHAPES[r[1] as number] ?? 'Block', cf };
  });
}

/** Exhaust buildTip for a custom tip shape: E = base * fromMatrix(0, -Z, Y, X), base = fromMatrix(pos, v, up, v x up). */
export function tipPieces(d: { p: (string | number)[][] }, pos: THREE.Vector3, v: THREE.Vector3): GamePiece[] {
  const up = Math.abs(v.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const z = v.clone().cross(up).normalize();
  const base = new THREE.Matrix4().makeBasis(v, up, z).setPosition(pos);
  const E = base.clone().multiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
  return d.p.map((r) => fitRow(r, E, [0, 1], [0, 1], [0, 1]));
}

/** Kit.ROLES plus the rim (face/lip/barrel) and tip (body/lip/soot) roles and "custom". */
export const GAME_ROLES = new Set([
  'paint', 'black', 'gloss', 'carbon', 'mesh', 'chrome', 'pink', 'mint', 'lav', 'sky', 'yellow', 'red', 'housing', 'head', 'fog',
  'amber', 'lens', 'smoke', 'tail', 'taildark', 'reverse', 'reflector', 'outlet', 'custom',
]);
