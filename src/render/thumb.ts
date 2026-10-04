import * as THREE from 'three';
import { isUnion, piecesBox, resolvePart } from '../core/resolve';
import type { Car } from '../core/types';
import { unionGeometry } from './csg';
import { primitiveGeometry } from './geometry';

// Small pictures of cars for the start screen, drawn one at a time with a shared hidden renderer.

let renderer: THREE.WebGLRenderer | null = null;
const W = 320, H = 190;

export function carThumbnail(car: Car): string {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(1);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9a, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 14, -9);
  scene.add(sun);
  const mats = new Map<string, THREE.Material>();
  const mat = (color: string, material: string, t: number) => {
    const k = `${color}${material}${t}`;
    let m = mats.get(k);
    if (!m) {
      m = material === 'Neon' ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: t > 0.05 || material === 'Glass', opacity: material === 'Glass' ? 0.6 : 1 - t });
      mats.set(k, m);
    }
    return m;
  };
  const box = new THREE.Box3();
  for (const part of car.parts) {
    if (part.hidden) continue;
    const pieces = resolvePart(car, part);
    box.union(piecesBox(pieces));
    if (isUnion(car, part)) {
      const g = unionGeometry(pieces);
      const f = pieces.find((p) => !p.cut);
      if (g && f) scene.add(new THREE.Mesh(g, mat(f.color, f.material, f.transparency)));
    } else for (const p of pieces) {
      if (p.cut) continue;
      const m = new THREE.Mesh(primitiveGeometry(p.kind, p.size), mat(p.color, p.material, p.transparency));
      m.matrixAutoUpdate = false;
      m.matrix.copy(p.m);
      scene.add(m);
    }
  }
  const c = box.isEmpty() ? new THREE.Vector3(0, 2, 0) : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 8 : box.getSize(new THREE.Vector3()).length() / 2;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 500);
  cam.position.copy(c).add(new THREE.Vector3(-0.62, 0.32, -0.72).normalize().multiplyScalar(r * 2.6));
  cam.lookAt(c);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  for (const m of mats.values()) m.dispose();
  return url;
}
