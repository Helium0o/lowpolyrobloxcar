import type { Car, Params } from '../types';
import { bool, Kit, num, str, type Generator } from './kit';

// Wheels in the game's rim frame: origin at the wheel centre, +X out of the wheel face. Part names follow the
// game's rim model (RimLip, RimBarrel, Spoke, RimHub, LugNut, RimCap, Caliper); the tyre exports as the WheelXX part.
// Spokes and lug nuts are one shape repeated round the X axis, so changing the count is one slider.

const STYLE_OPTIONS: [string, string][] = [
  ['spokes', 'Spokes'], ['star', 'Wide star'], ['split', 'Split spokes'], ['mesh', 'Cross lace'], ['turbine', 'Turbine'],
  ['dish', 'Deep dish'], ['disc', 'Aero disc'], ['steelie', 'Steel wheel'],
];

export const wheelGen: Generator = {
  type: 'wheel',
  label: 'Wheel',
  slot: 'wheel',
  partName: 'Wheel',
  defs: [
    { key: 'style', label: 'Rim style', type: 'select', options: STYLE_OPTIONS },
    { key: 'spokes', label: 'Spokes', type: 'number', min: 3, max: 20, step: 1, when: (p) => p.style !== 'disc' && p.style !== 'steelie' },
    { key: 'spokeWidth', label: 'Spoke width', type: 'number', min: 0.05, max: 0.6, step: 0.01, when: (p) => p.style !== 'disc' && p.style !== 'steelie' },
    { key: 'rimSize', label: 'Rim size', type: 'number', min: 0.4, max: 0.9, step: 0.01 },
    { key: 'dish', label: 'Dish depth', type: 'number', min: 0, max: 0.5, step: 0.01 },
    { key: 'lip', label: 'Lip', type: 'number', min: 0, max: 0.3, step: 0.01 },
    { key: 'lugs', label: 'Lug nuts', type: 'number', min: 0, max: 8, step: 1 },
    { key: 'caliper', label: 'Brake caliper', type: 'bool' },
    { key: 'caliperColor', label: 'Caliper colour', type: 'select', options: [['#d21e30', 'Red'], ['#f0b020', 'Yellow'], ['#2f6fe0', 'Blue'], ['#1e1e22', 'Black'], ['@accent', 'Accent']], when: (p) => !!p.caliper },
    { key: 'faceColor', label: 'Face colour', type: 'select', options: [['@rim', 'Rim colour'], ['@chrome', 'Chrome'], ['@paint', 'Paint'], ['@accent', 'Accent'], ['@trim', 'Black']] },
    { key: 'sidewall', label: 'Sidewall stripe', type: 'bool' },
    { key: 'rear', label: 'Size from', type: 'select', options: [['front', 'Front wheels'], ['rear', 'Rear wheels']] },
  ],
  defaults: () => ({ style: 'spokes', spokes: 5, spokeWidth: 0.2, rimSize: 0.66, dish: 0.06, lip: 0.08, lugs: 5, caliper: true, caliperColor: '#d21e30', faceColor: '@rim', sidewall: false, rear: 'front' }),
  build(car: Car, p: Params) {
    const k = new Kit();
    const P = car.params;
    const R = P.wheelRadius;
    const w = str(p, 'rear', 'front') === 'rear' ? P.wheelWidthR : P.wheelWidthF;
    const face = w / 2;
    const rr = R * num(p, 'rimSize', 0.66);
    const dish = num(p, 'dish', 0.06);
    const lip = num(p, 'lip', 0.08);
    const col = str(p, 'faceColor', '@rim');
    const metal = { material: 'Metal' };
    k.add('Tyre', 'cylinder', [w, R * 2, R * 2], [0, 0, 0], [0, 0, 0], '@tyre');
    if (bool(p, 'sidewall')) k.add('Sidewall', 'cylinder', [0.02, rr * 2 + 0.5, rr * 2 + 0.5], [face + 0.005, 0, 0], [0, 0, 0], '#f2f2f2');
    k.add('RimBarrel', 'cylinder', [0.05, rr * 2, rr * 2], [face - dish - 0.02, 0, 0], [0, 0, 0], '#3c3e44');
    if (lip > 0.005) k.add('RimLip', 'cylinder', [0.06, rr * 2 + lip * 2, rr * 2 + lip * 2], [face + 0.01, 0, 0], [0, 0, 0], '@chrome', metal);
    const x = face - dish + 0.03; // spoke plane
    const n = Math.round(num(p, 'spokes', 5));
    const sw = num(p, 'spokeWidth', 0.2);
    const spokeLen = rr - 0.05;
    const spoke = (wd: number) => {
      k.add('Spoke', 'block', [0.1, spokeLen * 0.85, wd], [x, spokeLen * 0.48, 0], [0, 0, 0], col, { ...metal, repeat: { count: n, offset: [0, 0, 0], rotate: [360 / n, 0, 0] } });
    };
    switch (str(p, 'style', 'spokes')) {
      case 'spokes':
        spoke(sw);
        break;
      case 'star':
        spoke(sw * 1.8);
        break;
      case 'split': {
        const s = k.add('Spoke', 'block', [0.1, spokeLen * 0.85, sw * 0.5], [x, spokeLen * 0.48, sw * 0.4], [0, 0, 0], col, { ...metal, repeat: { count: n, offset: [0, 0, 0], rotate: [360 / n, 0, 0] } });
        k.add('Spoke', 'block', [0.1, spokeLen * 0.85, sw * 0.5], [x, spokeLen * 0.48, -sw * 0.4], [0, 0, 0], col, { ...metal, repeat: s.repeat });
        break;
      }
      case 'mesh': {
        const rep = { count: n, offset: [0, 0, 0] as [number, number, number], rotate: [360 / n, 0, 0] as [number, number, number] };
        k.add('Spoke', 'block', [0.06, spokeLen * 0.9, sw * 0.4], [x, spokeLen * 0.48, 0], [25, 0, 0], col, { ...metal, repeat: rep });
        k.add('Spoke', 'block', [0.06, spokeLen * 0.9, sw * 0.4], [x + 0.03, spokeLen * 0.48, 0], [-25, 0, 0], col, { ...metal, repeat: rep });
        break;
      }
      case 'turbine':
        k.add('Spoke', 'block', [0.1, spokeLen * 0.8, sw], [x, spokeLen * 0.5, 0], [0, 30, 0], col, { ...metal, repeat: { count: n, offset: [0, 0, 0], rotate: [360 / n, 0, 0] } });
        k.add('Rim', 'cylinder', [0.05, rr * 2 - 0.05, rr * 2 - 0.05], [x - 0.06, 0, 0], [0, 0, 0], '#3c3e44');
        break;
      case 'dish':
        k.add('Rim', 'cylinder', [0.05, rr * 2, rr * 2], [face + 0.005, 0, 0], [0, 0, 0], '@chrome', metal);
        k.add('Spoke', 'block', [0.1, rr * 0.5, sw], [face - 0.25, rr * 0.3, 0], [0, 0, 0], col, { ...metal, repeat: { count: n, offset: [0, 0, 0], rotate: [360 / n, 0, 0] } });
        break;
      case 'disc':
        k.add('Rim', 'cylinder', [0.06, rr * 2 - 0.04, rr * 2 - 0.04], [x, 0, 0], [0, 0, 0], col, metal);
        k.add('DiscHole', 'cylinder', [0.02, rr * 0.3, rr * 0.3], [x + 0.03, rr * 0.62, 0], [0, 0, 0], '#26272b', { repeat: { count: 6, offset: [0, 0, 0], rotate: [60, 0, 0] } });
        break;
      case 'steelie':
        k.add('Rim', 'cylinder', [0.06, rr * 2 - 0.04, rr * 2 - 0.04], [x, 0, 0], [0, 0, 0], col);
        k.add('DiscHole', 'cylinder', [0.02, rr * 0.2, rr * 0.2], [x + 0.03, rr * 0.7, 0], [0, 0, 0], '#26272b', { repeat: { count: 8, offset: [0, 0, 0], rotate: [45, 0, 0] } });
        break;
    }
    k.add('RimHub', 'cylinder', [0.1, rr * 0.45, rr * 0.45], [x + 0.03, 0, 0], [0, 0, 0], col, metal);
    k.add('RimCap', 'cylinder', [0.06, rr * 0.22, rr * 0.22], [x + 0.09, 0, 0], [0, 0, 0], '@chrome', metal);
    const lugs = Math.round(num(p, 'lugs', 5));
    if (lugs > 0) k.add('LugNut', 'cylinder', [0.08, 0.07, 0.07], [x + 0.08, rr * 0.16, 0], [0, 0, 0], '@chrome', { ...metal, repeat: { count: lugs, offset: [0, 0, 0], rotate: [360 / lugs, 0, 0] } });
    if (bool(p, 'caliper')) k.add('Caliper', 'block', [0.16, 0.5, 0.7], [face - Math.max(0.2, dish + 0.15), rr * 0.55, -rr * 0.25], [-30, 0, 0], str(p, 'caliperColor', '#d21e30'));
    return k.shapes;
  },
  presets: [
    { name: 'Classic Star', params: { style: 'star', spokes: 5, spokeWidth: 0.24, lip: 0.06 } },
    { name: 'Split Five', params: { style: 'split', spokes: 5, spokeWidth: 0.3, lip: 0.1 } },
    { name: 'Mono Six', params: { style: 'spokes', spokes: 6, spokeWidth: 0.16 } },
    { name: 'Twin Seven', params: { style: 'split', spokes: 7, spokeWidth: 0.24 } },
    { name: 'Octane Eight', params: { style: 'spokes', spokes: 8, spokeWidth: 0.12 } },
    { name: 'Needle Fifteen', params: { style: 'spokes', spokes: 15, spokeWidth: 0.06 } },
    { name: 'Cross Lace', params: { style: 'mesh', spokes: 10, spokeWidth: 0.2 } },
    { name: 'Turbine', params: { style: 'turbine', spokes: 10, spokeWidth: 0.16 } },
    { name: 'Deep Dish', params: { style: 'dish', spokes: 5, dish: 0.35, lip: 0.14 } },
    { name: 'Aero Disc', params: { style: 'disc', dish: 0.02 } },
    { name: 'Steelie', params: { style: 'steelie', faceColor: '@trim', lip: 0, caliper: false } },
  ],
};

/** Exhaust tips, named like the game's ExhaustTips model (Tip, TipLip, TipMouth). */
export const exhaustGen: Generator = {
  type: 'exhaust',
  label: 'Exhaust tips',
  slot: 'exhaust',
  partName: 'ExhaustTips',
  defs: [
    { key: 'layout', label: 'Layout', type: 'select', options: [['single', 'Single'], ['dual', 'Dual (one side)'], ['dualSide', 'Dual (both sides)'], ['quad', 'Quad'], ['centerDual', 'Centre dual'], ['centerQuad', 'Centre quad']] },
    { key: 'shape', label: 'Tip shape', type: 'select', options: [['round', 'Round'], ['doublewall', 'Double wall'], ['bigbore', 'Big bore'], ['square', 'Square']] },
    { key: 'radius', label: 'Size', type: 'number', min: 0.08, max: 0.6, step: 0.01 },
    { key: 'length', label: 'Sticks out by', type: 'number', min: 0.05, max: 1, step: 0.01 },
    { key: 'x', label: 'Distance from centre', type: 'number', min: 0, max: 3.2, step: 0.02 },
    { key: 'y', label: 'Height above ground', type: 'number', min: 0.2, max: 2, step: 0.02 },
    { key: 'spacing', label: 'Spacing', type: 'number', min: 0.2, max: 1.2, step: 0.01 },
    { key: 'color', label: 'Colour', type: 'select', options: [['@chrome', 'Chrome'], ['#8c8f96', 'Steel'], ['#3a3d44', 'Black'], ['#7d6bd8', 'Burnt titanium'], ['@accent', 'Accent']] },
  ],
  defaults: (car) => ({ layout: 'dual', shape: 'round', radius: 0.18, length: 0.3, x: car.params.width / 2 - 1.2, y: car.params.floor + 0.25, spacing: 0.48, color: '@chrome' }),
  build(car, p) {
    const k = new Kit();
    const R = car.params.length / 2;
    const r = num(p, 'radius', 0.18), len = num(p, 'length', 0.3);
    const y = num(p, 'y', 0.6), sp = num(p, 'spacing', 0.48), xo = num(p, 'x', 1.9);
    const col = str(p, 'color', '@chrome');
    const shape = str(p, 'shape', 'round');
    const z = R + len / 2 - 0.05;
    const layout = str(p, 'layout', 'dual');
    const xs: { x: number; mirror: boolean }[] = [];
    switch (layout) {
      case 'single': xs.push({ x: xo, mirror: false }); break;
      case 'dual': xs.push({ x: xo - sp / 2, mirror: false }, { x: xo + sp / 2, mirror: false }); break;
      case 'dualSide': xs.push({ x: -xo, mirror: true }); break;
      case 'quad': xs.push({ x: -xo - sp / 2, mirror: true }, { x: -xo + sp / 2, mirror: true }); break;
      case 'centerDual': xs.push({ x: -sp / 2, mirror: true }); break;
      case 'centerQuad': xs.push({ x: -sp / 2, mirror: true }, { x: -sp * 1.5, mirror: true }); break;
    }
    for (const t of xs) {
      const o = { mirror: t.mirror };
      if (shape === 'square') {
        k.box('Tip', t.x - r, t.x + r, y - r * 0.8, y + r * 0.8, z - len / 2, z + len / 2, col, { ...o, material: 'Metal' });
        k.box('TipMouth', t.x - r + 0.04, t.x + r - 0.04, y - r * 0.8 + 0.04, y + r * 0.8 - 0.04, z + len / 2 - 0.03, z + len / 2 + 0.005, '#141416', o);
      } else {
        const rr = shape === 'bigbore' ? r * 1.35 : r;
        k.tubeZ('Tip', t.x, y, z, rr, len, col, { ...o, material: 'Metal' });
        if (shape === 'doublewall') k.tubeZ('TipLip', t.x, y, z + len / 2 - 0.02, rr * 0.8, 0.05, col, { ...o, material: 'Metal' });
        k.tubeZ('TipMouth', t.x, y, z + len / 2 - 0.005, rr * (shape === 'doublewall' ? 0.62 : 0.8), 0.03, '#141416', o);
      }
    }
    return k.shapes;
  },
};
