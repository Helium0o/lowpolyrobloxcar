import * as THREE from 'three';
import { isUnion, resolvePart, type Piece } from '../core/resolve';
import type { Car } from '../core/types';
import { pieceGeometry, unionGeometry } from '../render/csg';

// A port of the game's Kit.measure (ReplicatedStorage.ShopCatalog): where the bumpers, skirts, deck, roof,
// hood and lamps of a car are. The game measures every car this way by raycasting its Body union; here the
// same rays hit the editor's own Body, so a part exported from this car carries the right "ref" sizes.

export interface Lamp { cf: THREE.Matrix4; hw: number; hh: number; bottom: number }
export interface Anchors {
  hw: number;
  zF: number;
  zR: number;
  top: number;
  R: number;
  fz: number;
  rz: number;
  front: { z: number; W: number; yB: number; yT: number };
  rear: { z: number; W: number; yB: number; yT: number };
  side: { x: number; z: number; L: number; yB: number };
  deck: { y: number; z: number; hw: number };
  roof: { y: number; z: number; hw: number };
  hood: { cf: THREE.Matrix4; len: number; hw: number };
  heads: { L?: Lamp; R?: Lamp };
  tails: { L?: Lamp; R?: Lamp };
  ws: number;
}

function meshOf(car: Car, names: string[]): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of car.parts) {
    if (p.hidden || !names.includes(p.name)) continue;
    const pieces = resolvePart(car, p);
    if (isUnion(car, p)) { const g = unionGeometry(pieces); if (g) geos.push(g); }
    else for (const pc of pieces) if (!pc.cut) geos.push(pieceGeometry(pc));
  }
  if (!geos.length) return null;
  const merged = mergeTris(geos);
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function mergeTris(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrs = geos.map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array);
  const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const HEAD = [/^Headlight/];
const TAIL = [/^Taillight/, /^TailRing/, /^TailHousing/];

function lampFrame(car: Car, pats: RegExp[], side: number, outward: THREE.Vector3): Lamp | undefined {
  const parts: Piece[] = [];
  for (const p of car.parts) {
    if (p.hidden) continue;
    for (const pc of resolvePart(car, p)) {
      if (pc.cut || !pats.some((re) => re.test(pc.shape.name))) continue;
      const x = pc.m.elements[12];
      if ((x < 0 && side < 0) || (x > 0 && side > 0)) parts.push(pc);
    }
  }
  if (!parts.length) return undefined;
  let main = parts[0], best = -1;
  for (const e of parts) {
    const d = [...e.size].sort((a, b) => a - b);
    const area = d[1] * d[2] * (/Housing|Cluster/.test(e.shape.name) ? 1.5 : 1);
    if (area > best) { best = area; main = e; }
  }
  const m = main.m;
  const axes = [new THREE.Vector3().setFromMatrixColumn(m, 0), new THREE.Vector3().setFromMatrixColumn(m, 1), new THREE.Vector3().setFromMatrixColumn(m, 2)];
  const dims = [main.size[0], main.size[1], main.size[2]];
  let thin = 0;
  for (let i = 1; i < 3; i++) if (dims[i] < dims[thin]) thin = i;
  const n = axes[thin].clone();
  if (n.dot(outward) < 0) n.negate();
  let hAx = axes[0], hd = -1;
  for (let i = 0; i < 3; i++) if (i !== thin && Math.abs(axes[i].x) > hd) { hd = Math.abs(axes[i].x); hAx = axes[i]; }
  const hv = hAx.clone();
  if (hv.x < 0) hv.negate();
  hv.addScaledVector(n, -hv.dot(n)).normalize();
  const v = n.clone().cross(hv);
  const o = new THREE.Vector3().setFromMatrixPosition(m);
  let minH = Infinity, maxH = -Infinity, minV = Infinity, maxV = -Infinity, maxN = -Infinity;
  for (const e of parts) {
    const hs = e.size.map((x) => x / 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const q = new THREE.Vector3(sx * hs[0], sy * hs[1], sz * hs[2]).applyMatrix4(e.m).sub(o);
      const a = q.dot(hv), b = q.dot(v), c = q.dot(n);
      minH = Math.min(minH, a); maxH = Math.max(maxH, a); minV = Math.min(minV, b); maxV = Math.max(maxV, b); maxN = Math.max(maxN, c);
    }
  }
  const centre = o.clone().addScaledVector(hv, (minH + maxH) / 2).addScaledVector(v, (minV + maxV) / 2).addScaledVector(n, maxN);
  const cf = new THREE.Matrix4().makeBasis(hv, v, n).setPosition(centre);
  return { cf, hw: (maxH - minH) / 2, hh: (maxV - minV) / 2, bottom: centre.y - v.y * (maxV - minV) / 2 };
}

export function measure(car: Car): Anchors {
  const body = meshOf(car, ['Body']) ?? meshOf(car, car.parts.filter((p) => p.slot === 'body').map((p) => p.name));
  const P = car.params;
  const bb = body?.geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(-P.width / 2, P.floor, -P.length / 2), new THREE.Vector3(P.width / 2, P.belt, P.length / 2));
  const hw = (bb.max.x - bb.min.x) / 2, zF = bb.min.z, zR = bb.max.z, top = bb.max.y;
  const ray = new THREE.Raycaster();
  const cast = (o: THREE.Vector3, d: THREE.Vector3) => {
    if (!body) return null;
    ray.set(o, d.clone().normalize());
    ray.far = d.length();
    const h = ray.intersectObject(body, false)[0];
    return h ? h.point : null;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const R = P.wheelRadius;
  const fz = P.axleOffset, rz = P.axleOffset + P.wheelbase;
  const bottomAt = (z: number) => cast(V(0, -3, z), V(0, 20, 0))?.y ?? 0.45;
  const topAt = (x: number, z: number) => cast(V(x, top + 3, z), V(0, -20, 0))?.y ?? null;
  const faceZ = (y: number, front: boolean) => (front ? cast(V(0, y, zF - 5), V(0, 0, 10)) : cast(V(0, y, zR + 5), V(0, 0, -10)))?.z ?? (front ? zF : zR);
  const halfWidthAt = (y: number, z: number) => cast(V(hw + 5, y, z), V(-10, 0, 0))?.x ?? hw;
  const heads = { L: lampFrame(car, HEAD, -1, V(0, 0.35, -1).normalize()), R: lampFrame(car, HEAD, 1, V(0, 0.35, -1).normalize()) };
  const tails = { L: lampFrame(car, TAIL, -1, V(0, 0.35, 1).normalize()), R: lampFrame(car, TAIL, 1, V(0, 0.35, 1).normalize()) };
  const lampBottom = (t: { L?: Lamp; R?: Lamp }) => Math.min(t.L?.bottom ?? Infinity, t.R?.bottom ?? Infinity);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const fb = bottomAt(zF + 0.5), rb = bottomAt(zR - 0.5);
  const noseY = topAt(0, zF + 0.3) ?? fb + 1.4;
  const tailY = topAt(0, zR - 0.3) ?? rb + 1.6;
  const fTop = clamp(Math.min(lampBottom(heads) - 0.08, noseY - 0.15), fb + 0.6, fb + 1.6);
  const rTop = clamp(Math.min(lampBottom(tails) - 0.08, tailY - 0.15), rb + 0.6, rb + 1.6);
  const fyP = fb + (fTop - fb) * 0.4, ryP = rb + (rTop - rb) * 0.4;
  const fFace = faceZ(fyP, true), rFace = faceZ(ryP, false);
  const front = { z: fFace, W: halfWidthAt(fyP, fFace + 0.5) + 0.04, yB: fb, yT: fTop };
  const rear = { z: rFace, W: halfWidthAt(ryP, rFace - 0.5) + 0.04, yB: rb, yT: rTop };
  const zMid = ((fz + R + 0.3) + (rz - R - 0.3)) / 2;
  const sb = bottomAt(zMid);
  const side = { x: halfWidthAt(sb + 0.3, zMid), z: zMid, L: (rz - R - 0.3) - (fz + R + 0.3), yB: sb };
  const dz = zR - 0.75;
  const dy = topAt(0, dz) ?? tailY;
  const deck = { y: dy, z: dz, hw: halfWidthAt(dy - 0.12, dz) * 0.96 };
  const glass = meshOf(car, ['Glass']);
  let roof: Anchors['roof'], ws: number;
  if (glass) {
    const gb = glass.geometry.boundingBox!;
    const gs = gb.getSize(V(0, 0, 0)), gc = gb.getCenter(V(0, 0, 0));
    roof = { y: gc.y + gs.y / 2 + 0.12, z: gc.z + gs.z / 2 - 0.15, hw: gs.x / 2 };
    const roofMesh = meshOf(car, ['Glass', 'Body2', 'Roof']);
    if (roofMesh) {
      ray.set(V(0, top + 4, gc.z + gs.z * 0.15), V(0, -1, 0));
      ray.far = 20;
      const hit = ray.intersectObject(roofMesh, false)[0];
      if (hit) { roof.y = hit.point.y; roof.z = gc.z + gs.z * 0.15; }
    }
    ws = gc.z - gs.z / 2;
  } else {
    roof = { y: top, z: 0, hw: hw * 0.7 };
    ws = zF * 0.25;
  }
  let hz0 = zF + 0.9, hz1 = ws - 0.45;
  if (hz1 - hz0 < 1.2) hz1 = hz0 + 1.2;
  const y0 = topAt(0, hz0) ?? noseY, y1 = topAt(0, hz1) ?? noseY;
  const o = V(0, (y0 + y1) / 2, (hz0 + hz1) / 2);
  const dirZ = V(0, y1 - y0, hz1 - hz0).normalize();
  const X = V(1, 0, 0);
  const hood = { cf: new THREE.Matrix4().makeBasis(X, dirZ.clone().cross(X), dirZ).setPosition(o), len: V(0, y1, hz1).distanceTo(V(0, y0, hz0)), hw: halfWidthAt(o.y - 0.1, o.z) * 0.66 };
  return { hw, zF, zR, top, R, fz, rz, front, rear, side, deck, roof, hood, heads, tails, ws };
}
