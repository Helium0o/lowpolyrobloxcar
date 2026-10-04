import type { Car, Params } from '../types';
import { bodyInfo, glassParams, sliderProfile, bodyParams } from './info';
import { bool, COLOR_OPTIONS, Kit, num, str, type Generator } from './kit';

// The car's shell: Body (paint union with wheel arches cut out), Glass, Body2 (roof + pillars),
// details (mirrors, door lines, handles) and a simple interior seen through the windows.

const profileDefs = (when: (p: Params) => boolean) => [
  { key: 'noseHeight', label: 'Nose height', type: 'number' as const, min: 0.6, max: 4, step: 0.05, when },
  { key: 'noseLength', label: 'Nose slope length', type: 'number' as const, min: 0.05, max: 4, step: 0.05, when },
  { key: 'hoodFront', label: 'Hood front height', type: 'number' as const, min: 0.8, max: 5, step: 0.05, when },
  { key: 'cowl', label: 'Hood back height', type: 'number' as const, min: 0.8, max: 5, step: 0.05, when },
  { key: 'deck', label: 'Trunk front height', type: 'number' as const, min: 0.8, max: 6, step: 0.05, when },
  { key: 'tailTop', label: 'Trunk back height', type: 'number' as const, min: 0.8, max: 6, step: 0.05, when },
  { key: 'tailLength', label: 'Tail slope length', type: 'number' as const, min: 0.05, max: 4, step: 0.05, when },
  { key: 'tailHeight', label: 'Tail height', type: 'number' as const, min: 0.6, max: 6, step: 0.05, when },
];

export const bodyGen: Generator = {
  type: 'body',
  label: 'Body shell',
  slot: 'body',
  partName: 'Body',
  union: true,
  defs: [
    { key: 'mode', label: 'Shape the side by', type: 'select', options: [['sliders', 'Sliders'], ['points', 'Dragging points']] },
    ...profileDefs((p) => p.mode !== 'points'),
    { key: 'profile', label: 'Side profile', type: 'profile', when: (p) => p.mode === 'points', hint: 'Drag points in the side view. Double-click a line to add a point, right-click a point to remove it.' },
    { key: 'noseEdge', label: 'Round nose edge', type: 'number', min: 0, max: 1.2, step: 0.05 },
    { key: 'tailEdge', label: 'Round tail edge', type: 'number', min: 0, max: 1.2, step: 0.05 },
    { key: 'cornerF', label: 'Front corners', type: 'number', min: 0, max: 2, step: 0.05 },
    { key: 'cornerR', label: 'Rear corners', type: 'number', min: 0, max: 2, step: 0.05 },
    { key: 'chin', label: 'Chin slope', type: 'number', min: 0, max: 1.2, step: 0.05 },
    { key: 'archGap', label: 'Wheel arch gap', type: 'number', min: 0, max: 0.8, step: 0.02 },
    { key: 'archDepth', label: 'Wheel arch depth', type: 'number', min: 0.3, max: 2.5, step: 0.05 },
    { key: 'flare', label: 'Fender flares', type: 'number', min: 0, max: 0.6, step: 0.02 },
    { key: 'liners', label: 'Dark wheel wells', type: 'bool' },
  ],
  defaults: () => ({ mode: 'sliders', noseEdge: 0.35, tailEdge: 0.3, cornerF: 0.5, cornerR: 0.4, chin: 0.3, archGap: 0.22, archDepth: 1.2, flare: 0, liners: true }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const P = car.params;
    const W = B.hw;
    const prof = B.profile;
    k.under('Body', -W, W, B.floor, prof);
    // fender flares: a slightly wider band around each arch
    const flare = num(p, 'flare', 0);
    const R = P.wheelRadius;
    if (flare > 0.01) {
      for (const [z, track] of [[B.fz, P.trackF], [B.rz, P.trackR]] as const) {
        const top = Math.min(B.heightAt(z) - 0.15, R * 2 + 0.6);
        k.box('Flare', -W - flare, -W + 0.4, B.floor, top, z - R - 0.55, z + R + 0.55, '@paint', { mirror: true });
        void track;
      }
    }
    // rounded / chamfered edges: 45° cutting blocks
    const ne = num(p, 'noseEdge', 0);
    if (ne > 0.01) k.add('EdgeCut', 'block', [W * 2 + 2, ne * 1.414, ne * 1.414], [0, prof[0][1], B.F], [45, 0, 0], '#000000', { cut: true });
    const te = num(p, 'tailEdge', 0);
    if (te > 0.01) k.add('EdgeCut', 'block', [W * 2 + 2, te * 1.414, te * 1.414], [0, prof[prof.length - 1][1], B.R], [45, 0, 0], '#000000', { cut: true });
    const ch = num(p, 'chin', 0);
    if (ch > 0.01) k.add('ChinCut', 'block', [W * 2 + 2, ch * 1.414, ch * 1.414], [0, B.floor, B.F], [45, 0, 0], '#000000', { cut: true });
    const top = Math.max(...prof.map((q) => q[1])) + 1;
    const cf = num(p, 'cornerF', 0), cr = num(p, 'cornerR', 0);
    const fw = W + flare;
    if (cf > 0.01) k.add('CornerCut', 'block', [cf * 1.414, top - B.floor + 1, cf * 1.414], [-fw, (top + B.floor) / 2, B.F], [0, 45, 0], '#000000', { cut: true, mirror: true });
    if (cr > 0.01) k.add('CornerCut', 'block', [cr * 1.414, top - B.floor + 1, cr * 1.414], [-fw, (top + B.floor) / 2, B.R], [0, 45, 0], '#000000', { cut: true, mirror: true });
    // wheel arches (cylinders along X), like B.shell
    const gap = num(p, 'archGap', 0.22), depth = num(p, 'archDepth', 1.2);
    for (const [z, track, ww] of [[B.fz, P.trackF, P.wheelWidthF], [B.rz, P.trackR, P.wheelWidthR]] as const) {
      const xIn = Math.min(track - ww / 2 - 0.1, fw - depth);
      const len = fw + 0.6 - xIn;
      k.add('ArchCut', 'cylinder', [len, (R + gap) * 2, (R + gap) * 2], [-(xIn + len / 2), R, z], [0, 0, 0], '#000000', { cut: true, mirror: true });
    }
    return k.shapes;
  },
  presets: [
    { name: 'Smooth', params: { noseEdge: 0.45, tailEdge: 0.4, cornerF: 0.7, cornerR: 0.5, chin: 0.35 } },
    { name: 'Boxy', params: { noseEdge: 0.1, tailEdge: 0.1, cornerF: 0.15, cornerR: 0.15, chin: 0.1 } },
    { name: 'Widebody', params: { flare: 0.3, archGap: 0.3 } },
  ],
};

/** Separate dark wheel-well liners (the game names them WellLiner). */
export const linersGen: Generator = {
  type: 'liners',
  label: 'Wheel well liners',
  slot: 'details',
  partName: 'WellLiners',
  defs: [{ key: 'color', label: 'Colour', type: 'select', options: [['@trim', 'Black trim'], ['@paint', 'Paint']] }],
  defaults: () => ({ color: '@trim' }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const P = car.params;
    const b = bodyParams(car);
    const R = P.wheelRadius, gap = num(b, 'archGap', 0.22), depth = num(b, 'archDepth', 1.2);
    for (const [z, track, ww] of [[B.fz, P.trackF, P.wheelWidthF], [B.rz, P.trackR, P.wheelWidthR]] as const) {
      const xIn = Math.min(track - ww / 2 - 0.1, B.hw - depth);
      k.box('WellLiner', -(xIn + 0.02), -(xIn + 0.14), Math.max(B.floor + 0.05, R - (R + gap) + 0.6), R + R + gap - 0.05, z - R - gap + 0.02, z + R + gap - 0.02, str(p, 'color', '@trim'), { mirror: true });
    }
    return k.shapes;
  },
};

export const glassGen: Generator = {
  type: 'glass',
  label: 'Windows',
  slot: 'glass',
  partName: 'Glass',
  union: true,
  defs: [
    { key: 'windscreen', label: 'Windscreen base', type: 'number', min: 0.15, max: 0.7, step: 0.005, hint: 'How far back the windscreen starts (share of the car length).' },
    { key: 'roofFront', label: 'Roof front', type: 'number', min: 0.2, max: 0.8, step: 0.005 },
    { key: 'roofBack', label: 'Roof back', type: 'number', min: 0.3, max: 0.95, step: 0.005 },
    { key: 'rearGlass', label: 'Rear window base', type: 'number', min: 0.35, max: 1, step: 0.005 },
    { key: 'inset', label: 'Cabin narrower by', type: 'number', min: 0, max: 1.2, step: 0.02 },
    { key: 'tumble', label: 'Side glass lean', type: 'number', min: 0, max: 0.8, step: 0.02 },
  ],
  defaults: () => ({ windscreen: 0.36, roofFront: 0.5, roofBack: 0.66, rearGlass: 0.8, inset: 0.38, tumble: 0.15 }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const P = car.params;
    const roofY = P.roof - 0.18;
    const gw = B.gw;
    const o = { material: 'Glass', transparency: 0.3 };
    const tumble = num(p, 'tumble', 0);
    const pts = [[B.ws, B.belt], [B.rf, roofY], [B.rb, roofY], [B.rg, B.belt]];
    // lower glass band at full width, upper band narrower (side windows lean in)
    if (tumble > 0.01) {
      const mid = B.belt + (roofY - B.belt) * 0.5;
      const lerpZ = (za: number, zb: number) => za + (zb - za) * 0.5;
      k.under('Glass', -gw, gw, B.belt, [[B.ws, B.belt], [lerpZ(B.ws, B.rf), mid], [lerpZ(B.rg, B.rb), mid], [B.rg, B.belt]], '@glass', o);
      k.under('Glass', -(gw - tumble), gw - tumble, mid - 0.01, [[lerpZ(B.ws, B.rf), mid], [B.rf, roofY], [B.rb, roofY], [lerpZ(B.rg, B.rb), mid]], '@glass', o);
    } else {
      k.under('Glass', -gw, gw, B.belt, pts, '@glass', o);
    }
    return k.shapes;
  },
  presets: [
    { name: 'Sedan', params: { windscreen: 0.36, roofFront: 0.5, roofBack: 0.68, rearGlass: 0.8 } },
    { name: 'Fastback', params: { windscreen: 0.35, roofFront: 0.48, roofBack: 0.6, rearGlass: 0.9 } },
    { name: 'Hatchback', params: { windscreen: 0.3, roofFront: 0.44, roofBack: 0.86, rearGlass: 0.96 } },
    { name: 'Mid engine', params: { windscreen: 0.26, roofFront: 0.4, roofBack: 0.55, rearGlass: 0.72 } },
    { name: 'Wagon / SUV', params: { windscreen: 0.3, roofFront: 0.42, roofBack: 0.92, rearGlass: 0.97, tumble: 0.05 } },
  ],
};

export const roofGen: Generator = {
  type: 'roof',
  label: 'Roof and pillars',
  slot: 'roof',
  partName: 'Body2',
  union: true,
  defs: [
    { key: 'thickness', label: 'Roof thickness', type: 'number', min: 0.08, max: 0.5, step: 0.01 },
    { key: 'overhang', label: 'Roof overhang', type: 'number', min: 0, max: 0.4, step: 0.01 },
    { key: 'pillarA', label: 'Front pillars', type: 'number', min: 0, max: 0.5, step: 0.01 },
    { key: 'pillarB', label: 'Middle pillars', type: 'number', min: 0, max: 0.5, step: 0.01 },
    { key: 'pillarC', label: 'Rear pillars', type: 'number', min: 0, max: 1.5, step: 0.01 },
    { key: 'color', label: 'Roof colour', type: 'select', options: COLOR_OPTIONS },
  ],
  defaults: () => ({ thickness: 0.2, overhang: 0.06, pillarA: 0.2, pillarB: 0.18, pillarC: 0.5, color: '@paint' }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const P = car.params;
    const g = glassParams(car);
    const t = num(p, 'thickness', 0.2), oh = num(p, 'overhang', 0.06);
    const col = str(p, 'color', '@paint');
    const gw = B.gw - num(g, 'tumble', 0) ;
    const roofY = P.roof - 0.18;
    k.box('Roof', -(gw + oh), gw + oh, roofY - 0.02, roofY - 0.02 + t, B.rf - oh, B.rb + oh, col);
    const pa = num(p, 'pillarA', 0.2), pb = num(p, 'pillarB', 0.18), pc = num(p, 'pillarC', 0.5);
    const gwB = B.gw;
    if (pa > 0.01) k.slab('APillar', -(gwB + 0.06), -(gwB - pa), B.ws, B.belt, B.rf, roofY, 0.16, 0.03, col, { mirror: true });
    if (pc > 0.01) k.slab('CPillar', -(gwB + 0.06), -(gwB - Math.min(pc, 0.5)), B.rb, roofY, B.rg, B.belt, 0.16, 0.03, col, { mirror: true });
    if (pc > 0.5) {
      // wide C pillar: a solid panel over the back of the side glass
      const zA = B.rb - (pc - 0.5) * 1.5;
      k.under('CPillar', -(gwB + 0.06), -(gwB - 0.05), B.belt, [[zA, roofY], [B.rb, roofY], [B.rg, B.belt]], col, { mirror: true });
    }
    if (pb > 0.01) {
      const z = (B.rf + B.rb) / 2 - 0.2;
      k.box('BPillar', -(gwB + 0.05), -(gwB - 0.04), B.belt, roofY, z - pb / 2, z + pb / 2, col, { mirror: true });
    }
    return k.shapes;
  },
};

export const detailsGen: Generator = {
  type: 'details',
  label: 'Mirrors, doors and handles',
  slot: 'details',
  partName: 'Details',
  defs: [
    { key: 'mirrors', label: 'Mirrors', type: 'bool' },
    { key: 'mirrorColor', label: 'Mirror colour', type: 'select', options: COLOR_OPTIONS, when: (p) => !!p.mirrors },
    { key: 'doors', label: 'Door lines', type: 'select', options: [['0', 'None'], ['1', 'Two doors'], ['2', 'Four doors']] },
    { key: 'handles', label: 'Door handles', type: 'bool' },
    { key: 'trim', label: 'Window trim', type: 'bool' },
    { key: 'grille', label: 'Grille', type: 'select', options: [['none', 'None'], ['slats', 'Slats'], ['mesh', 'Mesh'], ['kidney', 'Twin']] },
    { key: 'grilleWidth', label: 'Grille width', type: 'number', min: 0.5, max: 6, step: 0.05, when: (p) => p.grille !== 'none' },
    { key: 'grilleHeight', label: 'Grille height', type: 'number', min: 0.1, max: 1.5, step: 0.02, when: (p) => p.grille !== 'none' },
    { key: 'grilleY', label: 'Grille height above ground', type: 'number', min: 0.3, max: 3.5, step: 0.02, when: (p) => p.grille !== 'none' },
    { key: 'badge', label: 'Badge', type: 'bool' },
  ],
  defaults: (car) => ({ mirrors: true, mirrorColor: '@paint', doors: '1', handles: true, trim: true, grille: 'slats', grilleWidth: 2.6, grilleHeight: 0.4, grilleY: car.params.belt - 0.75, badge: true }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const P = car.params;
    const W = B.hw;
    if (bool(p, 'mirrors')) {
      const z = B.ws + 0.35, y = B.belt + 0.25, x = B.gw + 0.05;
      k.box('Mirror', -(x + 0.05), -(x + 0.5), y - 0.15, y + 0.15, z - 0.17, z + 0.17, str(p, 'mirrorColor', '@paint'), { mirror: true });
      k.box('MirrorArm', -(x - 0.35), -(x + 0.07), y - 0.3, y - 0.2, z - 0.07, z + 0.07, '@trim', { mirror: true });
    }
    const doors = Number(str(p, 'doors', '1'));
    const doorTop = B.belt - 0.05;
    const doorBottom = B.floor + 0.45;
    if (doors > 0) {
      const z0 = B.ws + 0.15;
      const z1 = doors === 1 ? (B.rf + B.rb) / 2 + 0.6 : (B.rf + B.rb) / 2 - 0.2;
      const zs = doors === 1 ? [z0, z1] : [z0, z1, B.rb + 0.3];
      for (const z of zs) k.box('DoorLine', -(W + 0.005), -(W + 0.03), doorBottom, doorTop, z - 0.015, z + 0.015, '@trim', { mirror: true });
      if (bool(p, 'handles')) {
        const hz = doors === 1 ? [z1 - 0.7] : [z1 - 0.6, zs[2] - 0.6];
        for (const z of hz) k.box('DoorHandle', -(W + 0.005), -(W + 0.06), doorTop - 0.35, doorTop - 0.25, z - 0.22, z + 0.22, '@trim', { mirror: true });
      }
    }
    if (bool(p, 'trim')) k.box('WindowTrim', -(B.gw + 0.02), -(B.gw + 0.08), B.belt - 0.03, B.belt + 0.03, B.ws + 0.2, B.rg - 0.2, '@trim', { mirror: true });
    const grille = str(p, 'grille', 'none');
    if (grille !== 'none') {
      const gwid = num(p, 'grilleWidth', 2.6), gh = num(p, 'grilleHeight', 0.4), gy = num(p, 'grilleY', P.belt - 0.75);
      const z = B.F - 0.02;
      if (grille === 'kidney') {
        k.box('Grille', -0.08, -gwid / 2, gy - gh / 2, gy + gh / 2, z - 0.06, z + 0.1, '@trim', { mirror: true });
      } else {
        k.box('Grille', -gwid / 2, gwid / 2, gy - gh / 2, gy + gh / 2, z - 0.06, z + 0.1, '@trim');
        if (grille === 'slats') {
          const n = Math.max(1, Math.floor(gh / 0.13));
          k.box('GrilleSlat', -gwid / 2 + 0.05, gwid / 2 - 0.05, gy - gh / 2 + 0.07, gy - gh / 2 + 0.1, z - 0.1, z - 0.04, '@chrome', { repeat: { count: n, offset: [0, gh / n, 0], rotate: [0, 0, 0] } });
        } else {
          k.box('GrilleMesh', -gwid / 2 + 0.05, gwid / 2 - 0.05, gy - gh / 2 + 0.04, gy + gh / 2 - 0.04, z - 0.09, z - 0.05, '#46494f', { material: 'DiamondPlate' });
        }
      }
      if (bool(p, 'badge')) k.box('Badge', -0.25, 0.25, gy - 0.08, gy + 0.08, z - 0.13, z - 0.08, '#d21923', { material: 'Neon' });
    }
    return k.shapes;
  },
};

export const interiorGen: Generator = {
  type: 'interior',
  label: 'Interior',
  slot: 'interior',
  partName: 'Interior',
  defs: [
    { key: 'seats', label: 'Seats', type: 'bool' },
    { key: 'seatColor', label: 'Seat colour', type: 'select', options: [['#28282e', 'Black'], ['#7a2028', 'Red'], ['#c8b090', 'Tan'], ['@accent', 'Accent']] },
    { key: 'wheel', label: 'Steering wheel', type: 'bool' },
    { key: 'rhd', label: 'Right-hand drive', type: 'bool' },
  ],
  defaults: () => ({ seats: true, seatColor: '#28282e', wheel: true, rhd: false }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const W = B.gw - 0.3;
    const col = str(p, 'seatColor', '#28282e');
    const dashZ = B.ws + 0.55;
    const dashY = B.belt - 0.05;
    k.box('Dash', -W, W, dashY - 0.3, dashY + 0.3, dashZ - 0.45, dashZ + 0.45, '#222226');
    const sx = (bool(p, 'rhd') ? 1 : -1) * W * 0.48;
    if (bool(p, 'wheel')) k.add('SteeringWheel', 'cylinder', [0.12, 0.85, 0.85], [sx, dashY - 0.1, dashZ + 0.75], [0, 90, -25], '#1c1c20');
    if (bool(p, 'seats')) {
      const sz = (B.rf + B.rb) / 2 + 0.3;
      const sy = B.floor + 0.6;
      k.box('SeatBase', -W * 0.48 - 0.7, -W * 0.48 + 0.7, sy - 0.18, sy + 0.18, sz - 0.75, sz + 0.75, col, { mirror: true });
      k.add('SeatBack', 'block', [1.4, 1.8, 0.3], [-W * 0.48, sy + 1.0, sz + 0.9], [12, 0, 0], col, { mirror: true });
    }
    return k.shapes;
  },
};

/** Default slider values for a body (used when switching to point editing). */
export function profileFromSliders(car: Car): number[][] {
  const b = bodyParams(car), g = glassParams(car);
  return sliderProfile(car, b, g).map(([z, y]) => [Math.round((z / car.params.length) * 1000) / 1000, y]);
}
