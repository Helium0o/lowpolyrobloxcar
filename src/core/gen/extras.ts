import type { SlotId } from '../types';
import { bodyInfo } from './info';
import { COLOR_OPTIONS, Kit, num, str, type Generator, type ParamDef } from './kit';

// Add-on extras, one per zone like the game's Extras tab. Each is a small generator with a few sliders.

const size = (key: string, label: string, min: number, max: number, step = 0.02): ParamDef => ({ key, label, type: 'number', min, max, step });
const colour: ParamDef = { key: 'color', label: 'Colour', type: 'select', options: COLOR_OPTIONS };

function extra(type: string, label: string, slot: SlotId, partName: string, defs: ParamDef[], defaults: Generator['defaults'], build: Generator['build']): Generator {
  return { type, label, slot, partName, defs, defaults, build };
}

export const EXTRAS: Generator[] = [
  extra('lightBar', 'Roof light bar', 'roofExtra', 'LightBar', [size('width', 'Width', 1, 6), size('lamps', 'Lamps', 1, 10, 1), size('shift', 'Move back', -2, 2)],
    (car) => ({ width: car.params.width * 0.6, lamps: 4, shift: -0.6 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const w = num(p, 'width', 3.6), n = Math.max(1, Math.round(num(p, 'lamps', 4)));
      const z = B.rf + num(p, 'shift', 0) + 0.3, y = car.params.roof + 0.02;
      k.box('LightBarBase', -w / 2, w / 2, y, y + 0.22, z - 0.18, z + 0.18, '@trim');
      const step = (w - 0.2) / n;
      k.box('Fog', -w / 2 + 0.1 + 0.05, -w / 2 + 0.1 + step - 0.05, y + 0.04, y + 0.2, z - 0.21, z - 0.17, '#fffaeb', { material: 'Neon', repeat: { count: n, offset: [step, 0, 0], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
  extra('roofScoop', 'Roof scoop', 'roofExtra', 'RoofScoop', [size('width', 'Width', 0.4, 3), size('length', 'Length', 0.4, 3), size('height', 'Height', 0.1, 0.8), colour],
    () => ({ width: 1.2, length: 1.4, height: 0.35, color: '@paint' }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const y = car.params.roof, z = (B.rf + B.rb) / 2;
      const h = num(p, 'height', 0.35);
      k.add('RoofScoop', 'wedge', [num(p, 'width', 1.2), h, num(p, 'length', 1.4)], [0, y + h / 2, z], [0, 0, 0], str(p, 'color', '@paint'));
      k.box('ScoopMouth', -num(p, 'width', 1.2) / 2 + 0.1, num(p, 'width', 1.2) / 2 - 0.1, y + 0.05, y + h - 0.05, z + num(p, 'length', 1.4) / 2, z + num(p, 'length', 1.4) / 2 + 0.03, '@trim');
      return k.shapes;
    }),
  extra('sharkFin', 'Shark fin', 'roofExtra', 'SharkFin', [size('length', 'Length', 0.3, 1.5), size('height', 'Height', 0.1, 0.6), colour],
    () => ({ length: 0.7, height: 0.25, color: '@paint' }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const h = num(p, 'height', 0.25), L = num(p, 'length', 0.7);
      k.add('SharkFin', 'wedge', [0.18, h, L], [0, car.params.roof + h / 2, B.rb - L / 2 - 0.1], [0, 0, 0], str(p, 'color', '@paint'));
      return k.shapes;
    }),
  extra('roofRack', 'Roof rack', 'roofExtra', 'RoofRack', [size('bars', 'Cross bars', 1, 6, 1), size('height', 'Height', 0.05, 0.6)],
    () => ({ bars: 3, height: 0.2 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const y = car.params.roof, h = num(p, 'height', 0.2);
      const gw = B.gw - 0.2;
      k.box('RackRail', -gw - 0.08, -gw + 0.08, y, y + h, B.rf, B.rb, '@trim', { mirror: true });
      const n = Math.round(num(p, 'bars', 3));
      const step = (B.rb - B.rf - 0.3) / Math.max(1, n - 1);
      k.box('RackBar', -gw, gw, y + h - 0.06, y + h + 0.04, B.rf + 0.1, B.rf + 0.2, '@trim', { repeat: { count: n, offset: [0, 0, step], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
  extra('hoodStacks', 'Hood stacks', 'hoodExtra', 'HoodStacks', [size('pipes', 'Pipes per side', 1, 6, 1), size('height', 'Height', 0.2, 2), size('radius', 'Pipe size', 0.05, 0.3, 0.01)],
    () => ({ pipes: 3, height: 0.7, radius: 0.1 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const z = B.ws - 1.2, y = B.heightAt(z), h = num(p, 'height', 0.7), r = num(p, 'radius', 0.1);
      const n = Math.round(num(p, 'pipes', 3));
      k.add('Stack', 'cylinder', [h, r * 2, r * 2], [-0.6, y + h / 2, z - 0.3 * (n - 1) / 2], [0, 0, 90], '@chrome', { mirror: true, material: 'Metal', repeat: { count: n, offset: [0, 0, 0.3], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
  extra('hoodPins', 'Hood pins', 'hoodExtra', 'HoodPins', [size('spread', 'Spread', 0.5, 3.4)],
    (car) => ({ spread: car.params.width / 2 - 0.8 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const z = B.F + 0.6, y = B.heightAt(z);
      k.add('HoodPin', 'cylinder', [0.05, 0.16, 0.16], [-num(p, 'spread', 2.2), y + 0.02, z], [0, 0, 90], '@chrome', { mirror: true, material: 'Metal' });
      return k.shapes;
    }),
  extra('sidePipes', 'Side pipes', 'sideExtra', 'SidePipes', [size('radius', 'Pipe size', 0.06, 0.3, 0.01), size('length', 'Length', 1, 8)],
    () => ({ radius: 0.12, length: 4 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const z = (B.fz + B.rz) / 2, r = num(p, 'radius', 0.12);
      k.tubeZ('SidePipe', -(B.hw + r + 0.05), B.floor + 0.15, z, r, num(p, 'length', 4), '@chrome', { mirror: true, material: 'Metal' });
      return k.shapes;
    }),
  extra('fenderVents', 'Fender vents', 'sideExtra', 'FenderVents', [size('slats', 'Slats', 1, 6, 1), colour],
    () => ({ slats: 3, color: '@trim' }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const z = B.fz + car.params.wheelRadius + 0.5, y = car.params.wheelRadius * 2 + 0.1;
      const n = Math.round(num(p, 'slats', 3));
      k.box('FenderVent', -(B.hw + 0.005), -(B.hw + 0.04), y - 0.03, y + 0.03, z - 0.35, z + 0.35, str(p, 'color', '@trim'), { mirror: true, repeat: { count: n, offset: [0, -0.14, 0], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
  extra('bullBar', 'Bull bar', 'frontExtra', 'BullBar', [size('width', 'Width', 1, 6), size('height', 'Height', 0.4, 2)],
    (car) => ({ width: car.params.width * 0.7, height: 1.2 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const w = num(p, 'width', 4), h = num(p, 'height', 1.2);
      const z = B.F - 0.55, y0 = B.floor + 0.1;
      k.box('BullBarPost', -w / 2 + 0.3, -w / 2 + 0.45, y0, y0 + h, z - 0.08, z + 0.08, '@trim', { mirror: true });
      k.box('BullBar', -w / 2 + 0.3, w / 2 - 0.3, y0 + h - 0.15, y0 + h, z - 0.08, z + 0.08, '@trim');
      k.box('BullBar', -w / 2, w / 2, y0 + h * 0.45, y0 + h * 0.45 + 0.15, z - 0.08, z + 0.08, '@trim');
      return k.shapes;
    }),
  extra('splitterFins', 'Splitter fins', 'frontExtra', 'SplitterFins', [size('count', 'Fins per side', 1, 4, 1)],
    () => ({ count: 2 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const n = Math.round(num(p, 'count', 2));
      k.box('SplitterFin', -B.hw + 0.4, -B.hw + 0.45, B.floor - 0.1, B.floor + 0.25, B.F - 0.6, B.F - 0.1, '@carbon', { mirror: true, repeat: { count: n, offset: [0.4, 0, 0], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
  extra('trunkBar', 'Chrome trunk bar', 'trunkExtra', 'TrunkBar', [size('width', 'Width', 0.5, 6)],
    (car) => ({ width: car.params.width * 0.6 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const w = num(p, 'width', 3.6);
      k.box('TrunkBar', -w / 2, w / 2, B.heightAt(B.R - 0.05) - 0.4, B.heightAt(B.R - 0.05) - 0.3, B.R - 0.02, B.R + 0.03, '@chrome', { material: 'Metal' });
      return k.shapes;
    }),
  extra('antenna', 'Antenna', 'trunkExtra', 'Antenna', [size('height', 'Height', 0.3, 3)],
    () => ({ height: 1.4 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const z = B.R - 0.6, h = num(p, 'height', 1.4);
      k.add('Antenna', 'cylinder', [h, 0.04, 0.04], [B.hw - 0.4, B.heightAt(z) + h / 2, z], [0, 0, 90], '@trim');
      return k.shapes;
    }),
  extra('rearFins', 'Diffuser fins', 'rearExtra', 'DiffuserFins', [size('count', 'Fins', 1, 9, 1), size('depth', 'Depth', 0.2, 1.2)],
    () => ({ count: 5, depth: 0.6 }),
    (car, p) => {
      const k = new Kit();
      const B = bodyInfo(car);
      const n = Math.round(num(p, 'count', 5));
      const w = car.params.width * 0.55, step = w / Math.max(1, n - 1);
      k.box('DiffuserFin', -w / 2 - 0.03, -w / 2 + 0.03, B.floor - 0.05, B.floor + 0.4, B.R - 0.2, B.R + num(p, 'depth', 0.6), '@carbon', { repeat: { count: n, offset: [step, 0, 0], rotate: [0, 0, 0] } });
      return k.shapes;
    }),
];
