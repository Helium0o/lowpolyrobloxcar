import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { exportFiles, robloxCheck, visibleParts } from '../src/export';
import { applyChoice, newCar } from '../src/templates';

describe('export', () => {
  const car = newCar('sedan');
  applyChoice(car, 'spoiler', 'gt');
  applyChoice(car, 'exhaust', 'quad');
  car.effects.aura.style = 'sparkles';
  const files = exportFiles(car, { game: true, parts: true, wholeCar: true, settings: true, recipes: true }, { scale: 1, whitePaint: false });

  it('writes one fbx per part plus car, settings and recipes', () => {
    const names = files.map((f) => f.name);
    expect(names).toContain('WheelFL.fbx');
    expect(names).toContain('Body.fbx');
    expect(names).toContain('MyCar.fbx');
    expect(names).toContain('MyCar_Settings.rbxmx');
    expect(names).toContain('MyCar_Recipes.json');
    mkdirSync('tests/out/car', { recursive: true });
    for (const f of files) writeFileSync(`tests/out/car/${f.name}`, f.data);
  });

  it('whole-car fbx is readable by assimp', () => {
    let out = '';
    try {
      out = execFileSync('assimp', ['info', 'tests/out/car/MyCar.fbx'], { encoding: 'utf8' });
    } catch (e: any) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    expect(out).toMatch(/WheelFL/);
    expect(out).toMatch(/Body_Glass/);
  });

  it('settings carry the game attributes and fx attachments', () => {
    const json = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'MyCar_Settings.json')!.data));
    expect(json.attributes.RimStyle).toBe('split5');
    expect(json.attributes.ExhaustLayout).toBe('quad');
    expect(json.attributes.Aura).toBe('sparkles');
    expect(json.attachments.filter((a: any) => a.name === 'TipFx')).toHaveLength(4);
  });

  it('roblox check passes for the default car', () => {
    const issues = robloxCheck(car, visibleParts(car));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});
