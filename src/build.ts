import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { ROLES, safeName, type Part, type Role } from './model';
import { hasMirrorCopy, mirrorMatrix, shapeGeometry, shapeMatrix } from './shapes';

// Turns a part (list of shapes) into the triangle meshes that get exported to Roblox.
// Roblox gives one material per MeshPart, so each part becomes up to five meshes:
//   paint   body paint, kept separate so it can be tinted in Roblox
//   tyre    tyres
//   detail  trim, chrome, rims, tips, accent (vertex coloured)
//   glass   windows, so Transparency can be set
//   lights  headlights, taillights, underglow, so Material can be set to Neon
// The first group present gets the bare part name (Body, WheelFL); the rest get a suffix
// (Body_Glass, WheelFL_Rim).

export type MeshGroup = 'paint' | 'tyre' | 'detail' | 'glass' | 'lights';
const GROUP_ORDER: MeshGroup[] = ['paint', 'tyre', 'detail', 'glass', 'lights'];
const GROUP_SUFFIX: Record<MeshGroup, string> = { paint: '_Paint', tyre: '_Tyre', detail: '_Trim', glass: '_Glass', lights: '_Lights' };

export function meshName(partName: string, group: MeshGroup, primary: MeshGroup, isWheel: boolean): string {
  if (group === primary) return partName;
  if (group === 'detail' && isWheel) return partName + '_Rim';
  return partName + GROUP_SUFFIX[group];
}

export function roleGroup(role: Role): MeshGroup {
  if (role === 'paint') return 'paint';
  if (role === 'tire') return 'tyre';
  if (role === 'glass') return 'glass';
  if (role === 'light' || role === 'tail' || role === 'glow') return 'lights';
  return 'detail';
}

export interface BuiltMesh {
  name: string;
  group: MeshGroup;
  /** Triangle soup in part-local space (3 vertices per triangle). */
  positions: Float32Array;
  /** Role index (into ROLES) per triangle. */
  roles: Uint8Array;
  tris: number;
}

export interface BuiltPart {
  part: Part;
  name: string;
  meshes: BuiltMesh[];
  tris: number;
  csgFailed: boolean;
}

interface Piece {
  geom: THREE.BufferGeometry; // non-indexed, part-local
  role: Role;
}

const partCache = new Map<string, { meshes: BuiltMesh[]; csgFailed: boolean }>();
let evaluator: Evaluator | null = null;

export function buildPart(part: Part): BuiltPart {
  const key = JSON.stringify([part.shapes, part.pivot[0]]);
  let hit = partCache.get(key);
  if (!hit) {
    hit = buildMeshes(part);
    partCache.set(key, hit);
    if (partCache.size > 400) partCache.delete(partCache.keys().next().value as string);
  }
  const name = safeName(part.name);
  const primary = hit.meshes[0]?.group ?? 'paint';
  const meshes = hit.meshes.map((m) => ({ ...m, name: meshName(name, m.group, primary, part.slot === 'wheel') }));
  return { part, name, meshes, tris: meshes.reduce((a, m) => a + m.tris, 0), csgFailed: hit.csgFailed };
}

/** Geometry for each visible shape (plus mirror copies) in part-local space. */
export function shapePieces(part: Part, holes: boolean): Piece[] {
  const out: Piece[] = [];
  const mm = mirrorMatrix(part.pivot[0]);
  for (const s of part.shapes) {
    if (s.hidden || !!s.hole !== holes) continue;
    const base = shapeGeometry(s);
    const m = shapeMatrix(s);
    out.push({ geom: transformed(base, m, false), role: s.role });
    if (hasMirrorCopy(s, part.pivot[0])) out.push({ geom: transformed(base, mm.clone().multiply(m), true), role: s.role });
  }
  return out;
}

function transformed(g: THREE.BufferGeometry, m: THREE.Matrix4, flip: boolean): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = (src.getAttribute('position').array as Float32Array).slice();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.applyMatrix4(m);
  if (flip) flipWinding(out.getAttribute('position').array as Float32Array);
  out.computeVertexNormals();
  return out;
}

function flipWinding(a: Float32Array) {
  for (let i = 0; i < a.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = a[i + 3 + k];
      a[i + 3 + k] = a[i + 6 + k];
      a[i + 6 + k] = t;
    }
  }
}

function buildMeshes(part: Part): { meshes: BuiltMesh[]; csgFailed: boolean } {
  const solids = shapePieces(part, false);
  const holes = shapePieces(part, true);
  let csgFailed = false;

  if (holes.length) {
    evaluator ??= makeEvaluator();
    const holeBoxes = holes.map((h) => {
      h.geom.computeBoundingBox();
      return h.geom.boundingBox!;
    });
    for (const piece of solids) {
      piece.geom.computeBoundingBox();
      let current = piece.geom;
      holes.forEach((h, i) => {
        if (!piece.geom.boundingBox!.intersectsBox(holeBoxes[i])) return;
        try {
          const a = new Brush(current);
          const b = new Brush(h.geom);
          a.updateMatrixWorld();
          b.updateMatrixWorld();
          const r = evaluator!.evaluate(a, b, SUBTRACTION);
          current = r.geometry.index ? r.geometry.toNonIndexed() : r.geometry;
        } catch (e) {
          csgFailed = true;
          console.warn('Cut failed', e);
        }
      });
      piece.geom = current;
    }
  }

  const byGroup = new Map<MeshGroup, { pos: number[]; roles: number[] }>();
  for (const p of solids) {
    const g = roleGroup(p.role);
    let acc = byGroup.get(g);
    if (!acc) byGroup.set(g, (acc = { pos: [], roles: [] }));
    const arr = p.geom.getAttribute('position').array as ArrayLike<number>;
    const tris = arr.length / 9;
    const ri = ROLES.indexOf(p.role);
    for (let i = 0; i < arr.length; i++) acc.pos.push(arr[i]);
    for (let t = 0; t < tris; t++) acc.roles.push(ri);
  }
  const meshes: BuiltMesh[] = [];
  for (const g of GROUP_ORDER) {
    const acc = byGroup.get(g);
    if (!acc || !acc.roles.length) continue;
    meshes.push({
      name: '',
      group: g,
      positions: new Float32Array(acc.pos),
      roles: new Uint8Array(acc.roles),
      tris: acc.roles.length,
    });
  }
  return { meshes, csgFailed };
}

function makeEvaluator(): Evaluator {
  const ev = new Evaluator();
  ev.attributes = ['position', 'normal'];
  ev.useGroups = false;
  return ev;
}

export function partHasHoles(part: Part): boolean {
  return part.shapes.some((s) => s.hole && !s.hidden);
}

/** Bounding box of a built part in car space. */
export function builtBounds(bp: BuiltPart, target = new THREE.Box3()): THREE.Box3 {
  target.makeEmpty();
  const v = new THREE.Vector3();
  for (const m of bp.meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      v.set(m.positions[i] + bp.part.pivot[0], m.positions[i + 1] + bp.part.pivot[1], m.positions[i + 2] + bp.part.pivot[2]);
      target.expandByPoint(v);
    }
  }
  return target;
}

/** A display geometry for a built mesh (flat normals + vertex colours). */
export function displayGeometry(m: BuiltMesh, colors: Record<Role, THREE.Color>): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  const col = new Float32Array(m.positions.length);
  for (let t = 0; t < m.tris; t++) {
    const c = colors[ROLES[m.roles[t]]];
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], t * 9 + k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
