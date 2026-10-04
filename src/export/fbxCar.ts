import * as THREE from 'three';
import { isUnion, partMatrix, resolvePart, type Piece } from '../core/resolve';
import { safeName, type Car, type Part } from '../core/types';
import { pieceGeometry, unionGeometry } from '../render/csg';
import { writeFbx, type FbxMesh, type FbxNode } from './fbx';

// FBX (second export format): one mesh per part, cuts already applied, vertex colours from the shapes.
// Each part's pivot is its own origin (the wheel centre for wheels), so parts can be swapped after import.

function meshFor(car: Car, part: Part, origin: THREE.Vector3): FbxMesh | null {
  const pieces = resolvePart(car, part);
  if (!pieces.some((p) => !p.cut)) return null;
  const geos: { g: THREE.BufferGeometry; c: THREE.Color }[] = [];
  if (isUnion(car, part)) {
    const g = unionGeometry(pieces);
    const first = pieces.find((p) => !p.cut)!;
    if (g) geos.push({ g, c: new THREE.Color(first.color) });
  } else {
    for (const p of pieces) if (!p.cut && !p.shape.decal) geos.push({ g: pieceGeometry(p), c: new THREE.Color(p.color) });
    for (const p of pieces) if (p.shape.decal) geos.push({ g: pieceGeometry(p), c: new THREE.Color(p.shape.decal.color) });
  }
  let tris = 0;
  for (const e of geos) tris += e.g.getAttribute('position').count / 3;
  const positions = new Float32Array(tris * 9);
  const triColors = new Float32Array(tris * 3);
  let t = 0;
  for (const e of geos) {
    const pos = e.g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      positions[t * 9 + (i % 3) * 3 + 0] = pos.getX(i) - origin.x;
      positions[t * 9 + (i % 3) * 3 + 1] = pos.getY(i) - origin.y;
      positions[t * 9 + (i % 3) * 3 + 2] = pos.getZ(i) - origin.z;
      if (i % 3 === 2) {
        triColors.set([e.c.r, e.c.g, e.c.b], t * 3);
        t++;
      }
    }
  }
  const main = pieces.find((p) => !p.cut) as Piece;
  const c = new THREE.Color(main.color);
  return { name: safeName(part.name), positions, triColors, material: { name: `${safeName(part.name)}_Mat`, color: [c.r, c.g, c.b], opacity: 1 - main.transparency } };
}

export function partNode(car: Car, part: Part): FbxNode | null {
  const o = new THREE.Vector3().setFromMatrixPosition(partMatrix(car, part));
  const mesh = meshFor(car, part, o);
  if (!mesh) return null;
  return { name: safeName(part.name), translation: [o.x, o.y, o.z], mesh };
}

export function carFbx(car: Car): Uint8Array {
  const children = car.parts.filter((p) => !p.hidden && !p.noExport).map((p) => partNode(car, p)).filter((n): n is FbxNode => !!n);
  return writeFbx([{ name: safeName(car.name), translation: [0, 0, 0], children }], { creator: 'Low Poly Car Builder' });
}

export function partFbx(car: Car, part: Part): Uint8Array | null {
  const n = partNode(car, part);
  if (!n) return null;
  // a single part is exported with its pivot at the origin
  return writeFbx([{ ...n, translation: [0, 0, 0] }], { creator: 'Low Poly Car Builder' });
}
