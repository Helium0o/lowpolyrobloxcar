import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { anchors, customPart, leftSide, customParts, robloxPieces, slotFrame, studioScript, type CustomPart, type Piece } from '../src/customparts';
import { exportFiles } from '../src/export';
import type { Car, Part, SlotId } from '../src/model';
import { applyChoice, BASES, newCar, slotVariants } from '../src/templates';
import { GAME_ROLES, customFrames, fitRow, pieces, rimPieces, tipPieces, type GameAnchors, type GamePiece } from './gameloader';

// The game's anchors for the app's own car: the same numbers the export writes as `ref`, so a part placed by the game's
// loader on this car must land exactly where it was drawn.
function gameAnchors(car: Car, lampsOf: (cat: 'headlights' | 'taillights') => Part | undefined): GameAnchors {
  const a = anchors(car);
  const lamp = (cat: 'headlights' | 'taillights') => {
    const part = lampsOf(cat);
    if (!part) return {};
    const left = leftSide(robloxPieces(part).pieces).left;
    if (!left.length) return {};
    const { frame, ref } = slotFrame(car, cat, left);
    const R = frame.clone();
    R.elements[12] = -R.elements[12];
    return { L: { cf: frame, hw: ref.hw, hh: ref.hh }, R: { cf: R, hw: ref.hw, hh: ref.hh } };
  };
  return {
    front: a.front, rear: a.rear, side: a.side, deck: a.deck, roof: a.roof,
    hood: { cf: new THREE.Matrix4().makeTranslation(...a.hood.o), len: a.hood.len, hw: a.hood.hw },
    heads: lamp('headlights'), tails: lamp('taillights'),
  };
}

function same(game: GamePiece, app: Piece) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  game.cf.decompose(p, q, s);
  const p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3();
  app.m.decompose(p2, q2, s2);
  return p.distanceTo(p2) < 2e-3 && Math.abs(q.dot(q2)) > 1 - 1e-5 && game.s.distanceTo(new THREE.Vector3(...app.size).max(new THREE.Vector3(0.02, 0.02, 0.02))) < 2e-3;
}

function checkRows(d: CustomPart) {
  for (const r of d.p) {
    expect([17, 21]).toContain(r.length);
    expect(typeof r[0]).toBe('string');
    expect([0, 1, 2, 3]).toContain(r[1]);
    for (let i = 2; i < 17; i++) expect(Number.isFinite(r[i] as number)).toBe(true);
    const m = new THREE.Matrix3().set(...(r.slice(8, 17) as [number, number, number, number, number, number, number, number, number]));
    expect(Math.abs(m.determinant() - 1)).toBeLessThan(1e-3);
    if (r[0] === 'custom') {
      expect(r[17]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof r[18]).toBe('string');
    }
  }
}

const KIT_SLOTS: SlotId[] = ['frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood', 'hoodExtras', 'roofExtras', 'sideExtras', 'frontExtras', 'rearExtras', 'trunkExtras', 'headlights', 'taillights'];

describe('CustomParts export', () => {
  it('every body kit, extra and lamp lands where it was drawn when the game fits it to the same car', () => {
    let checked = 0;
    for (const base of BASES) {
      for (const slot of KIT_SLOTS) {
        for (const v of slotVariants(slot)) {
          if (v.id === 'none') continue;
          const car = newCar(base.id);
          applyChoice(car, slot, v.id);
          const part = car.parts.find((p) => p.slot === slot);
          if (!part) continue;
          const res = customPart(car, part);
          if (!res.data) continue; // e.g. a centre-only lamp bar has no left side
          checkRows(res.data);
          for (const r of res.data.p) expect(GAME_ROLES.has(r[0] as string)).toBe(true);
          const A = gameAnchors(car, (cat) => car.parts.find((p) => p.slot === cat));
          const placed = pieces(A, res.data);
          const all = robloxPieces(part).pieces;
          const M = new THREE.Matrix4().makeScale(-1, 1, 1);
          const left = leftSide(all).left;
          const want = ['sideSkirts', 'headlights', 'taillights'].includes(slot) ? [...left, ...left.map((p) => ({ ...p, m: M.clone().multiply(p.m).multiply(M) }))] : all;
          expect(placed.length, `${base.id} ${slot} ${v.id}`).toBe(want.length);
          for (const w of want) expect(placed.some((g) => same(g, w)), `${base.id} ${slot} ${v.id} ${w.shape.name ?? w.shape.type}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('stretches to a bigger car the way the game does', () => {
    const car = newCar('sedan');
    applyChoice(car, 'frontBumper', slotVariants('frontBumper')[1].id);
    const res = customPart(car, car.parts.find((p) => p.slot === 'frontBumper')!);
    const A = gameAnchors(car, () => undefined);
    const wide: GameAnchors = { ...A, front: { ...A.front, W: A.front.W * 1.2, z: A.front.z - 1 } };
    const f = customFrames(wide, 'frontBumper', res.data!.ref)[0];
    expect(f.fx[1]).toBeCloseTo(1.2, 5);
    const xs = res.data!.p.map((r) => fitRow(r, f.cf, f.fx, f.fy, f.fz).cf.elements[12]);
    const xs0 = pieces(A, res.data!).map((g) => g.cf.elements[12]);
    expect(Math.max(...xs.map(Math.abs))).toBeCloseTo(Math.max(...xs0.map(Math.abs)) * 1.2, 3);
  });

  it('rims use the rim frame and come back onto the wheel', () => {
    const car = newCar('sedan');
    for (const rim of ['split5', 'mesh', 'deepdish', 'aero']) {
      applyChoice(car, 'rims', rim);
      const [res] = customParts(car, car.parts.filter((p) => p.slot === 'wheel'));
      expect(res.id).toBe(`cp_rim_${rim}`);
      const d = res.data!;
      expect(d.cat).toBe('rims');
      expect(d.ref.W).toBeCloseTo(car.wheels.radius, 3);
      checkRows(d);
      expect(d.p.some((r) => r[0] === 'lip')).toBe(true);
      expect(d.p.some((r) => r[0] === 'face')).toBe(true);
      const fr = car.parts.find((p) => p.name === 'WheelFR')!;
      const want = robloxPieces(fr).pieces.filter((p) => p.shape.role !== 'tire');
      const got = rimPieces(d, d.ref.W, d.ref.T);
      const pivot = new THREE.Matrix4().makeTranslation(...fr.pivot);
      for (const w of want) expect(got.some((g) => same({ ...g, cf: pivot.clone().multiply(g.cf) }, w))).toBe(true);
      // Every rim piece sits on or beyond the tyre's inner half (never inside the car).
      for (const r of d.p) expect(r[5] as number).toBeGreaterThan(0);
    }
  });

  it('exhaust tips: one tip in the tip frame plus the layout', () => {
    const car = newCar('sedan');
    applyChoice(car, 'exhaust', 'quad');
    applyChoice(car, 'exhaustTips', 'doublewall');
    const part = car.parts.find((p) => p.slot === 'exhaustTips')!;
    const d = customPart(car, part).data!;
    expect(d.cat).toBe('exhaust');
    expect(d.layout).toBe('quad');
    expect(d.p.map((r) => r[0]).sort()).toEqual(['body', 'lip', 'soot']);
    checkRows(d);
    // Placed by the game on an outlet pointing backwards, the mouth faces +Z (out of the car's rear).
    const got = tipPieces(d, new THREE.Vector3(1, 0.6, 7), new THREE.Vector3(0, 0, 1));
    for (const g of got) {
      const p = new THREE.Vector3().setFromMatrixPosition(g.cf);
      expect(p.z).toBeGreaterThan(7);
      expect(Math.hypot(p.x - 1, p.y - 0.6)).toBeLessThan(0.01);
      expect(g.sh).toBe('Cylinder');
      // Cylinder axis (local X) runs along the pipe.
      expect(Math.abs(new THREE.Vector3().setFromMatrixColumn(g.cf, 0).z)).toBeCloseTo(1, 4);
    }
    applyChoice(car, 'exhaust', 'sidePipes');
    expect(customPart(car, car.parts.find((p) => p.slot === 'exhaustTips')!).data!.layout).toBe('sideExit');
  });

  it('two-sided slots store the left side only', () => {
    const car = newCar('sedan');
    applyChoice(car, 'sideSkirts', slotVariants('sideSkirts')[1].id);
    const skirts = car.parts.find((p) => p.slot === 'sideSkirts')!;
    const d = customPart(car, skirts).data!;
    expect(d.p.length * 2).toBe(robloxPieces(skirts).pieces.length);
  });

  it('a light bar across the centre comes back full width from its stored left half', () => {
    const car = newCar('sedan');
    applyChoice(car, 'taillights', 'bar');
    const part = car.parts.find((p) => p.slot === 'taillights')!;
    const d = customPart(car, part).data!;
    expect(d.p.length).toBe(1);
    const placed = pieces(gameAnchors(car, (cat) => car.parts.find((p) => p.slot === cat)), d);
    const xs = placed.flatMap((g) => [g.cf.elements[12] - g.s.x / 2, g.cf.elements[12] + g.s.x / 2]);
    const bar = robloxPieces(part).pieces[0];
    expect(Math.min(...xs)).toBeCloseTo(-bar.size[0] / 2, 3);
    expect(Math.max(...xs)).toBeCloseTo(bar.size[0] / 2, 3);
  });

  it('body, pipes and unassigned custom parts are skipped with a reason; custom parts with a game slot export', () => {
    const car = newCar('sedan');
    const body = customPart(car, car.parts.find((p) => p.slot === 'body')!);
    expect(body.data).toBeNull();
    expect(body.notes[0]).toMatch(/FBX/);
    const custom: Part = { id: 'x', name: 'Roof_Box', slot: 'custom', variant: 'custom', pivot: [0, 5, 0], shapes: [{ id: 's', type: 'box', pos: [0, 0.2, 0], rot: [0, 0, 0], size: [2, 0.4, 3], role: 'trim' }] };
    expect(customPart(car, custom).data).toBeNull();
    custom.gameSlot = 'roofExtra';
    const res = customPart(car, custom);
    expect(res.id).toBe('cp_roof_box');
    expect(res.data!.name).toBe('Roof Box');
    expect(res.data!.p[0][0]).toBe('black');
  });

  it('writes the files and a command bar script', () => {
    const car = newCar('sedan');
    applyChoice(car, 'spoiler', 'gt');
    const files = exportFiles(car, { game: true, parts: false, wholeCar: false, settings: false, recipes: false }, { scale: 1, whitePaint: false });
    const names = files.map((f) => f.name);
    expect(names).toContain('MyCar_CustomParts.lua');
    expect(names).toContain('MyCar_CustomParts.json');
    const json = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'MyCar_CustomParts.json')!.data));
    expect(Object.keys(json)).toContain('cp_spoiler_gtwing');
    const spoiler = JSON.parse(json.cp_spoiler_gtwing);
    expect(spoiler.cat).toBe('spoiler');
    expect(spoiler.ref.hw).toBeGreaterThan(2);
    const lua = new TextDecoder().decode(files.find((f) => f.name === 'MyCar_CustomParts.lua')!.data);
    expect(lua).toMatch(/ReplicatedStorage/);
    expect(lua).toMatch(/SetAttribute\("Count"/);
    expect(lua).toContain('"cp_spoiler_gtwing", [=[{');
    mkdirSync('tests/out/customparts', { recursive: true });
    for (const f of files) writeFileSync(`tests/out/customparts/${f.name}`, f.data);
    expect(studioScript([])).toMatch(/local parts = \{\n\}/);
  });
});
