import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';
import { components } from '../src/core/cf';
import { regenerateAll } from '../src/core/gen';
import { isUnion, resolvePart } from '../src/core/resolve';
import { buildTemplate, TEMPLATES } from '../src/core/templates';
import type { Car } from '../src/core/types';
import { buildExport } from '../src/export';
import { customParts, customPartsScript, exportableParts, leftSide } from '../src/export/customparts';
import { carFbx } from '../src/export/fbxCar';
import { measure } from '../src/export/measure';
import { studioScript } from '../src/export/studio';
import { importRbxm } from '../src/io/importCar';
import { GAME_ROLES, pieces as gamePieces } from './gameloader';
import { compiles, runInMockStudio } from './robloxmock';

const dir = 'src/templates/cars/';
const cars: [string, () => Car][] = [
  ...TEMPLATES.slice(0, 3).map((t) => [`starter ${t.id}`, () => buildTemplate(t)] as [string, () => Car]),
  ...['R34.rbxm', 'Porsche930.rbxm', 'ChargerHellcat.rbxm'].map((f) => [f, () => { const c = importRbxm(new Uint8Array(readFileSync(dir + f)), f).car; regenerateAll(c); return c; }] as [string, () => Car]),
];
const pos = (m: number[] | THREE.Matrix4) => (Array.isArray(m) ? new THREE.Vector3(m[0], m[1], m[2]) : new THREE.Vector3().setFromMatrixPosition(m));

describe('Studio script (model only) builds the car', () => {
  for (const [label, make] of cars) {
    it(label, () => {
      const car = make();
      const res = runInMockStudio(studioScript(car, { drivable: false, parent: 'Workspace' }));
      expect(res.prints.join('\n')).toMatch(/^Built /);
      const top = res.parts.filter((p) => p.path.split('/').length === 3); // /Model/Part
      expect(top.length).toBeGreaterThan(0);
      for (const p of res.parts) {
        expect(p.anchored, p.path).toBe(true);
        expect(p.canCollide, p.path).toBe(false);
      }
      // every visible part: unions as one UnionOperation with its recipe, the rest shape by shape at the same place
      const shown = car.parts.filter((p) => !p.hidden && !p.noExport);
      for (const part of shown) {
        const pieces = resolvePart(car, part).filter((p) => !p.cut);
        if (!pieces.length) continue;
        if (part.wheel) {
          expect(res.parts.some((p) => p.path.endsWith(`/${part.name}`)), part.name).toBe(true);
          continue;
        }
        if (isUnion(car, part)) {
          const u = res.parts.find((p) => p.cls === 'UnionOperation' && p.path.split('/').pop() === part.name.replace(/[^A-Za-z0-9_]/g, '_'));
          expect(u, `union ${part.name}`).toBeTruthy();
          expect(u!.recipe).toBe(true);
          continue;
        }
        for (const pc of pieces) {
          const want = pos(pc.m);
          const hit = res.parts.find((p) => p.path.split('/').pop() === pc.shape.name && pos(p.cf).distanceTo(want) < 1e-3);
          expect(hit, `${part.name}/${pc.shape.name}`).toBeTruthy();
          expect(hit!.size.map((v) => +v.toFixed(3))).toEqual(pc.size.map((v) => +v.toFixed(3)));
          expect(hit!.material).toBe(pc.material);
          // rotation matches the shape's rotation
          const got = hit!.cf.slice(3);
          const exp = components(pc.m).slice(3);
          got.forEach((v, i) => expect(v).toBeCloseTo(exp[i], 3));
        }
      }
    });
  }
  it('drivable script compiles', () => {
    for (const [, make] of cars.slice(0, 2)) compiles(studioScript(make(), { drivable: true, parent: 'Workspace' }));
  });
});

describe('shop parts land where they were drawn (read back with the game\'s own fit code)', () => {
  for (const [label, make] of cars) {
    it(label, () => {
      const car = make();
      const A = measure(car);
      const parts = exportableParts(car).filter((p) => p.slot !== 'wheel' && p.slot !== 'exhaust');
      const results = customParts(car, parts, { price: 100, currency: 'coins', level: 1 });
      let checked = 0;
      for (const r of results) {
        if (!r.data) continue;
        for (const row of r.data.p) expect(GAME_ROLES.has(String(row[0])), `${r.part.name} role ${row[0]}`).toBe(true);
        const game = gamePieces(A, r.data);
        let want = resolvePart(car, r.part).filter((p) => !p.cut);
        if (['sideSkirts', 'headlights', 'taillights'].includes(r.data.cat)) want = leftSide(want).left;
        for (const w of want) {
          const c = pos(w.m);
          const hit = game.find((g) => pos(g.cf).distanceTo(c) < 0.01);
          expect(hit, `${r.part.name}/${w.shape.name} at ${c.toArray().map((v) => v.toFixed(2))}`).toBeTruthy();
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
  it('CustomParts script adds StringValues the game can read', () => {
    const car = cars[0][1]();
    const results = customParts(car, exportableParts(car), { price: 250, currency: 'coins', level: 2 });
    const res = runInMockStudio(customPartsScript(results), 'ReplicatedStorage');
    const ok = results.filter((r) => r.data);
    expect(res.values.length).toBe(ok.length);
    for (const v of res.values) {
      const d = JSON.parse(v.value);
      expect(d.price).toBe(250);
      expect(Array.isArray(d.p)).toBe(true);
      expect(v.path.startsWith('/CustomParts/cp_')).toBe(true);
    }
    expect(ok.some((r) => r.data!.cat === 'rims')).toBe(true);
  });
});

describe('fbx', () => {
  const car = cars[0][1]();
  const bytes = carFbx(car);
  it('loads in three.js with one mesh per part, in the right place', () => {
    const group = new FBXLoader().parse(bytes.buffer as ArrayBuffer, '');
    const shown = car.parts.filter((p) => !p.hidden && !p.noExport);
    for (const part of shown) expect(group.getObjectByName(part.name.replace(/[^A-Za-z0-9_]/g, '_')), part.name).toBeTruthy();
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.max.z - box.min.z).toBeCloseTo(car.params.length + 1, 0);
  });
  it('is accepted by assimp when available', () => {
    mkdirSync('tests/out', { recursive: true });
    writeFileSync('tests/out/car.fbx', bytes);
    let out = '';
    try {
      out = execFileSync('assimp', ['info', 'tests/out/car.fbx'], { encoding: 'utf8' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    expect(out).toMatch(/Meshes:\s+\d+/);
  });
});

describe('one Export click', () => {
  it('writes every ticked file', () => {
    const car = cars[0][1]();
    const { files } = buildExport(car, { car: true, drivable: false, shopParts: exportableParts(car).map((p) => p.id), shop: { price: 1, currency: 'coins', level: 0 }, fbxCar: true, fbxParts: true, settings: true, project: true });
    const names = files.map((f) => f.name);
    expect(names.some((n) => n.endsWith('_Model.lua'))).toBe(true);
    expect(names.some((n) => n.endsWith('_ShopParts.lua'))).toBe(true);
    expect(names.some((n) => n.endsWith('.fbx'))).toBe(true);
    expect(names.some((n) => n.endsWith('_Settings.json'))).toBe(true);
    expect(names.some((n) => n.endsWith('.lpcar'))).toBe(true);
    const back = JSON.parse(new TextDecoder().decode(files.find((f) => f.name.endsWith('.lpcar'))!.data));
    expect(back.parts.length).toBe(car.parts.length);
  });
});

void readdirSync;
