import { bodyInfo } from './info';
import { bool, COLOR_OPTIONS, Kit, num, str, type Generator } from './kit';

// Body kit generators: bumpers, side skirts, spoilers and hoods. Every slider has a real-world meaning
// (studs), and each generator has presets named after the game's own shop designs where they match.

const LIP_OPTIONS: [string, string][] = [['@trim', 'Black trim'], ['@carbon', 'Carbon'], ['@paint', 'Paint'], ['@accent', 'Accent']];

export const frontBumperGen: Generator = {
  type: 'frontBumper',
  label: 'Front bumper',
  slot: 'frontBumper',
  partName: 'FrontBumper',
  defs: [
    { key: 'height', label: 'Height', type: 'number', min: 0.3, max: 2, step: 0.02 },
    { key: 'depth', label: 'Sticks out by', type: 'number', min: 0.05, max: 1.2, step: 0.02 },
    { key: 'widthPad', label: 'Wider than body by', type: 'number', min: -0.6, max: 0.6, step: 0.02 },
    { key: 'color', label: 'Colour', type: 'select', options: COLOR_OPTIONS },
    { key: 'lip', label: 'Splitter depth', type: 'number', min: 0, max: 1.2, step: 0.02 },
    { key: 'lipColor', label: 'Splitter colour', type: 'select', options: LIP_OPTIONS, when: (p) => (p.lip as number) > 0 },
    { key: 'intake', label: 'Centre intake width', type: 'number', min: 0, max: 5, step: 0.05 },
    { key: 'intakeHeight', label: 'Intake height', type: 'number', min: 0.1, max: 1.2, step: 0.02, when: (p) => (p.intake as number) > 0 },
    { key: 'slats', label: 'Intake slats', type: 'number', min: 0, max: 8, step: 1, when: (p) => (p.intake as number) > 0 },
    { key: 'sideVents', label: 'Side vents', type: 'bool' },
    { key: 'canards', label: 'Canards', type: 'number', min: 0, max: 3, step: 1 },
    { key: 'fogs', label: 'Fog lights', type: 'bool' },
    { key: 'towHook', label: 'Tow hook', type: 'bool' },
  ],
  defaults: () => ({ height: 1.0, depth: 0.3, widthPad: 0, color: '@paint', lip: 0.25, lipColor: '@trim', intake: 2.6, intakeHeight: 0.45, slats: 2, sideVents: true, canards: 0, fogs: false, towHook: false }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const yB = B.floor - 0.05;
    const h = num(p, 'height', 1), d = num(p, 'depth', 0.3);
    const W = B.hw + num(p, 'widthPad', 0) - 0.02;
    const z0 = B.F - d, z1 = B.F + 0.35;
    const col = str(p, 'color', '@paint');
    k.box('FrontBumper', -W, W, yB, yB + h, z0, z1, col);
    const lip = num(p, 'lip', 0);
    if (lip > 0.01) k.box('Splitter', -W + 0.1, W - 0.1, yB - 0.08, yB + 0.05, z0 - lip, z0 + 0.4, str(p, 'lipColor', '@trim'));
    const iw = num(p, 'intake', 0), ih = num(p, 'intakeHeight', 0.45);
    const iy = yB + h * 0.42;
    if (iw > 0.01) {
      k.box('Intake', -iw / 2, iw / 2, iy - ih / 2, iy + ih / 2, z0 - 0.03, z0 + 0.1, '@trim');
      const n = Math.round(num(p, 'slats', 0));
      if (n > 0) k.box('IntakeSlat', -iw / 2 + 0.05, iw / 2 - 0.05, iy - ih / 2 + ih / (n + 1) - 0.025, iy - ih / 2 + ih / (n + 1) + 0.025, z0 - 0.06, z0 - 0.02, col, { repeat: { count: n, offset: [0, ih / (n + 1), 0], rotate: [0, 0, 0] } });
    }
    if (bool(p, 'sideVents')) k.box('SideIntake', -W + 0.25, -W + 0.95, iy - 0.22, iy + 0.22, z0 - 0.03, z0 + 0.1, '@trim', { mirror: true });
    const cn = Math.round(num(p, 'canards', 0));
    if (cn > 0) k.add('Canard', 'wedge', [0.5, 0.06, 0.5], [-W - 0.2, yB + h * 0.35, z0 + 0.35], [0, 90, 12], '@carbon', { mirror: true, repeat: { count: cn, offset: [0, 0.22, 0.05], rotate: [0, 0, 0] } });
    if (bool(p, 'fogs')) k.box('FogLight', -W + 0.3, -W + 0.75, yB + h * 0.65 - 0.12, yB + h * 0.65 + 0.12, z0 - 0.04, z0 + 0.05, '#ebaf46', { mirror: true, material: 'Neon' });
    if (bool(p, 'towHook')) k.box('TowHook', -W + 0.6, -W + 0.75, yB + 0.15, yB + 0.4, z0 - 0.3, z0 + 0.05, '#e03030', { });
    return k.shapes;
  },
  presets: [
    { name: 'Street Lip', params: { lip: 0.25, intake: 2.6, slats: 2, sideVents: true, canards: 0 } },
    { name: 'Track Splitter', params: { lip: 0.7, lipColor: '@carbon', intake: 3.2, slats: 0, canards: 2, depth: 0.4 } },
    { name: 'Time Attack', params: { lip: 0.9, lipColor: '@carbon', intake: 3.6, intakeHeight: 0.6, slats: 0, canards: 2, towHook: true } },
    { name: 'Classic Chrome', params: { color: '@chrome', lip: 0, intake: 1.8, slats: 4, sideVents: false, height: 0.6 } },
    { name: 'Rally', params: { lip: 0.2, fogs: true, towHook: true, intake: 2, slats: 3 } },
    { name: 'Drift Spec', params: { lip: 0.45, intake: 3.0, intakeHeight: 0.55, slats: 1, sideVents: true, towHook: true, widthPad: 0.15 } },
    { name: 'Stealth', params: { color: '@trim', lip: 0.3, intake: 3, slats: 0 } },
  ],
};

export const rearBumperGen: Generator = {
  type: 'rearBumper',
  label: 'Rear bumper',
  slot: 'rearBumper',
  partName: 'RearBumper',
  defs: [
    { key: 'height', label: 'Height', type: 'number', min: 0.3, max: 2, step: 0.02 },
    { key: 'depth', label: 'Sticks out by', type: 'number', min: 0.05, max: 1.2, step: 0.02 },
    { key: 'widthPad', label: 'Wider than body by', type: 'number', min: -0.6, max: 0.6, step: 0.02 },
    { key: 'color', label: 'Colour', type: 'select', options: COLOR_OPTIONS },
    { key: 'diffuser', label: 'Diffuser width', type: 'number', min: 0, max: 5, step: 0.05 },
    { key: 'fins', label: 'Diffuser fins', type: 'number', min: 0, max: 9, step: 1, when: (p) => (p.diffuser as number) > 0 },
    { key: 'diffColor', label: 'Diffuser colour', type: 'select', options: LIP_OPTIONS, when: (p) => (p.diffuser as number) > 0 },
    { key: 'rainLight', label: 'Rain light', type: 'bool' },
    { key: 'reflectors', label: 'Reflectors', type: 'bool' },
    { key: 'towHook', label: 'Tow hook', type: 'bool' },
  ],
  defaults: () => ({ height: 1.0, depth: 0.25, widthPad: 0, color: '@paint', diffuser: 2.8, fins: 3, diffColor: '@trim', rainLight: false, reflectors: true, towHook: false }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const yB = B.floor - 0.05;
    const h = num(p, 'height', 1), d = num(p, 'depth', 0.25);
    const W = B.hw + num(p, 'widthPad', 0) - 0.02;
    const z0 = B.R - 0.35, z1 = B.R + d;
    const col = str(p, 'color', '@paint');
    k.box('RearBumper', -W, W, yB, yB + h, z0, z1, col);
    const dw = num(p, 'diffuser', 0);
    if (dw > 0.01) {
      const dc = str(p, 'diffColor', '@trim');
      k.box('Diffuser', -dw / 2, dw / 2, yB - 0.05, yB + h * 0.4, z1 - 0.1, z1 + 0.08, dc);
      const n = Math.round(num(p, 'fins', 0));
      if (n > 0) {
        const step = dw / (n + 1);
        k.box('DiffuserFin', -dw / 2 + step - 0.03, -dw / 2 + step + 0.03, yB - 0.1, yB + h * 0.4, z1 - 0.1, z1 + 0.3, dc, { repeat: { count: n, offset: [step, 0, 0], rotate: [0, 0, 0] } });
      }
    }
    if (bool(p, 'rainLight')) k.box('RainLight', -0.18, 0.18, yB + 0.08, yB + 0.3, z1 + 0.05, z1 + 0.14, '#d21e30', { material: 'Neon' });
    if (bool(p, 'reflectors')) k.box('Reflector', -W + 0.2, -W + 0.75, yB + h * 0.6, yB + h * 0.6 + 0.12, z1, z1 + 0.03, '#a01020', { mirror: true });
    if (bool(p, 'towHook')) k.box('TowHook', W - 0.75, W - 0.6, yB + 0.15, yB + 0.4, z1 - 0.05, z1 + 0.3, '#e03030');
    return k.shapes;
  },
  presets: [
    { name: 'Street', params: { diffuser: 2.4, fins: 2, rainLight: false } },
    { name: 'Track Diffuser', params: { diffuser: 4, fins: 5, diffColor: '@carbon', rainLight: true, towHook: true } },
    { name: 'Classic Chrome', params: { color: '@chrome', diffuser: 0, height: 0.6, reflectors: false } },
    { name: 'Stealth', params: { color: '@trim', diffuser: 3.2, fins: 4 } },
  ],
};

export const sideSkirtsGen: Generator = {
  type: 'sideSkirts',
  label: 'Side skirts',
  slot: 'sideSkirts',
  partName: 'SideSkirt',
  defs: [
    { key: 'height', label: 'Height', type: 'number', min: 0.1, max: 1, step: 0.02 },
    { key: 'out', label: 'Sticks out by', type: 'number', min: 0, max: 0.6, step: 0.01 },
    { key: 'color', label: 'Colour', type: 'select', options: [...COLOR_OPTIONS] },
    { key: 'lip', label: 'Lower lip', type: 'number', min: 0, max: 0.5, step: 0.01 },
    { key: 'lipColor', label: 'Lip colour', type: 'select', options: LIP_OPTIONS, when: (p) => (p.lip as number) > 0 },
    { key: 'vent', label: 'Vent', type: 'bool' },
    { key: 'stripe', label: 'Accent stripe', type: 'bool' },
  ],
  defaults: () => ({ height: 0.35, out: 0.08, color: '@paint', lip: 0.15, lipColor: '@trim', vent: false, stripe: false }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const R = car.params.wheelRadius;
    const z0 = B.fz + R + 0.3, z1 = B.rz - R - 0.3;
    const yB = B.floor - 0.05;
    const h = num(p, 'height', 0.35), out = num(p, 'out', 0.08);
    const x0 = -(B.hw - 0.1), x1 = -(B.hw + out);
    k.box('SideSkirt', x0, x1, yB, yB + h, z0, z1, str(p, 'color', '@paint'), { mirror: true });
    const lip = num(p, 'lip', 0);
    if (lip > 0.01) k.box('SkirtLip', x1 + 0.05, x1 - lip, yB - 0.04, yB + 0.06, z0 + 0.1, z1 - 0.1, str(p, 'lipColor', '@trim'), { mirror: true });
    if (bool(p, 'vent')) k.box('SkirtVent', x1 - 0.01, x1 + 0.02, yB + h * 0.3, yB + h * 0.75, z1 - 1.0, z1 - 0.3, '@trim', { mirror: true });
    if (bool(p, 'stripe')) k.box('SkirtStripe', x1 - 0.01, x1 + 0.02, yB + h * 0.8, yB + h * 0.9, z0 + 0.1, z1 - 0.1, '@accent', { mirror: true });
    return k.shapes;
  },
  presets: [
    { name: 'Street', params: { height: 0.35, out: 0.08, lip: 0.15 } },
    { name: 'Vented', params: { height: 0.45, out: 0.12, vent: true, lip: 0.1 } },
    { name: 'Chrome Rocker', params: { height: 0.18, out: 0.05, color: '@chrome', lip: 0 } },
    { name: 'Rally Guard', params: { height: 0.55, out: 0.2, color: '@trim', lip: 0 } },
  ],
};

export const spoilerGen: Generator = {
  type: 'spoiler',
  label: 'Spoiler',
  slot: 'spoiler',
  partName: 'Wing',
  defs: [
    { key: 'style', label: 'Style', type: 'select', options: [['wing', 'Wing on stands'], ['swan', 'Swan neck wing'], ['ducktail', 'Ducktail'], ['lip', 'Lip'], ['hoop', 'Hoop']] },
    { key: 'span', label: 'Width', type: 'number', min: 1, max: 9, step: 0.05 },
    { key: 'chord', label: 'Blade depth', type: 'number', min: 0.2, max: 2, step: 0.02 },
    { key: 'height', label: 'Height above trunk', type: 'number', min: 0, max: 2.5, step: 0.02, when: (p) => p.style !== 'lip' && p.style !== 'ducktail' },
    { key: 'angle', label: 'Angle', type: 'number', min: -20, max: 30, step: 1 },
    { key: 'shift', label: 'Move back', type: 'number', min: -3, max: 1.5, step: 0.02 },
    { key: 'stands', label: 'Stand spacing', type: 'number', min: 0.4, max: 6, step: 0.05, when: (p) => p.style === 'wing' || p.style === 'swan' },
    { key: 'plates', label: 'End plates', type: 'bool', when: (p) => p.style === 'wing' || p.style === 'swan' },
    { key: 'deck', label: 'Second blade', type: 'bool', when: (p) => p.style === 'wing' },
    { key: 'color', label: 'Colour', type: 'select', options: COLOR_OPTIONS },
  ],
  defaults: (car) => ({ style: 'wing', span: car.params.width - 0.5, chord: 0.9, height: 0.9, angle: -6, shift: 0, stands: car.params.width - 2, plates: true, deck: false, color: '@trim' }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    const style = str(p, 'style', 'wing');
    const zc = B.R - 0.75 + num(p, 'shift', 0);
    const deckY = B.heightAt(zc);
    const hx = num(p, 'span', 5) / 2, chord = num(p, 'chord', 0.9), ang = num(p, 'angle', -6);
    const col = str(p, 'color', '@trim');
    if (style === 'lip') {
      k.add('DuckTail', 'wedge', [hx * 2, 0.22, chord], [0, deckY + 0.11, zc], [ang, 0, 0], col);
      return k.shapes;
    }
    if (style === 'ducktail') {
      k.add('DuckTail', 'wedge', [hx * 2, 0.45, chord * 1.3], [0, deckY + 0.2, zc + 0.1], [ang, 0, 0], col);
      return k.shapes;
    }
    const yBlade = deckY + num(p, 'height', 0.9);
    const ux = num(p, 'stands', 3) / 2;
    if (style === 'hoop') {
      k.box('WingStand', -hx, -hx + 0.18, deckY - 0.05, yBlade, zc - chord / 2, zc + chord / 2, col, { mirror: true });
      k.add('Wing', 'block', [hx * 2, 0.16, chord], [0, yBlade + 0.08, zc], [ang, 0, 0], col);
      return k.shapes;
    }
    if (style === 'swan') {
      // stands come over the top and hold the blade from above
      k.box('WingStand', -ux - 0.08, -ux + 0.08, deckY - 0.05, yBlade + 0.35, zc - 0.25, zc + 0.05, col, { mirror: true });
      k.box('WingStand', -ux - 0.08, -ux + 0.08, yBlade + 0.15, yBlade + 0.35, zc - 0.05, zc + 0.35, col, { mirror: true });
    } else {
      k.box('WingStand', -ux - 0.09, -ux + 0.09, deckY - 0.05, yBlade, zc - 0.25, zc + 0.25, col, { mirror: true });
    }
    k.add('Wing', 'block', [hx * 2 - 0.12, 0.14, chord], [0, yBlade + 0.07, zc], [ang, 0, 0], col);
    if (bool(p, 'deck') && style === 'wing') k.add('Wing', 'block', [hx * 2 - 0.12, 0.1, chord * 0.55], [0, yBlade + 0.42, zc + chord * 0.35], [ang - 8, 0, 0], col);
    if (bool(p, 'plates')) k.box('WingPlate', -hx - 0.05, -hx + 0.05, yBlade - 0.25, yBlade + 0.35 + (bool(p, 'deck') ? 0.35 : 0), zc - chord / 2 - 0.05, zc + chord / 2 + 0.05, col, { mirror: true });
    return k.shapes;
  },
  presets: [
    { name: 'Street Wing', params: { style: 'wing', height: 0.7, chord: 0.8, plates: true, deck: false } },
    { name: 'GT Wing', params: { style: 'wing', height: 1.2, chord: 1.1, plates: true, color: '@carbon' } },
    { name: 'Swan Neck', params: { style: 'swan', height: 1.3, chord: 1.1, plates: true, color: '@carbon' } },
    { name: 'Double Deck', params: { style: 'wing', height: 1.0, chord: 1.0, deck: true } },
    { name: 'Ducktail', params: { style: 'ducktail', chord: 1.1, angle: 10, color: '@paint' } },
    { name: 'Lip', params: { style: 'lip', chord: 0.6, angle: 4, color: '@paint' } },
    { name: 'Hoop', params: { style: 'hoop', height: 0.6, chord: 0.6, color: '@paint' } },
  ],
};

export const hoodGen: Generator = {
  type: 'hood',
  label: 'Hood',
  slot: 'hood',
  partName: 'Hood',
  defs: [
    { key: 'style', label: 'Style', type: 'select', options: [['scoop', 'Scoop'], ['twin', 'Twin scoops'], ['bulge', 'Power bulge'], ['vents', 'Vents'], ['louvres', 'Louvres'], ['stripes', 'Racing stripes'], ['panel', 'Carbon panel']] },
    { key: 'width', label: 'Width', type: 'number', min: 0.4, max: 5, step: 0.05 },
    { key: 'length', label: 'Length', type: 'number', min: 0.4, max: 6, step: 0.05 },
    { key: 'height', label: 'Height', type: 'number', min: 0.03, max: 1, step: 0.01 },
    { key: 'pos', label: 'Position along hood', type: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'count', label: 'Count', type: 'number', min: 1, max: 12, step: 1, when: (p) => p.style === 'vents' || p.style === 'louvres' },
    { key: 'color', label: 'Colour', type: 'select', options: COLOR_OPTIONS },
  ],
  defaults: () => ({ style: 'scoop', width: 1.4, length: 1.6, height: 0.3, pos: 0.55, count: 4, color: '@paint' }),
  build(car, p) {
    const k = new Kit();
    const B = bodyInfo(car);
    // the hood's slope from the nose to the windscreen
    const za = B.F + 0.9, zb = B.ws - 0.45;
    const ya = B.heightAt(za), yb = B.heightAt(zb);
    const t = num(p, 'pos', 0.5);
    const zc = za + (zb - za) * t, yc = B.heightAt(zc);
    const ang = -Math.atan2(yb - ya, zb - za) * (180 / Math.PI);
    const w = num(p, 'width', 1.4), L = num(p, 'length', 1.6), h = num(p, 'height', 0.3);
    const col = str(p, 'color', '@paint');
    const style = str(p, 'style', 'scoop');
    const at = (x: number, lift: number, dz = 0): [number, number, number] => {
      const a = (-ang * Math.PI) / 180;
      return [x, yc + lift * Math.cos(a) + dz * Math.sin(a), zc - lift * Math.sin(a) + dz * Math.cos(a)];
    };
    switch (style) {
      case 'scoop':
        k.add('HoodScoop', 'wedge', [w, h, L], at(0, h / 2), [ang, 0, 0], col);
        k.add('ScoopMouth', 'block', [w - 0.2, h * 0.7, 0.05], at(0, h * 0.55, L / 2 + 0.01), [ang, 0, 0], '@trim');
        break;
      case 'twin':
        k.add('HoodScoop', 'wedge', [w / 2.4, h, L], at(-w / 3, h / 2), [ang, 0, 0], col, { mirror: true });
        break;
      case 'bulge':
        k.add('HoodBulge', 'block', [w, h * 0.6, L], at(0, h * 0.3), [ang, 0, 0], col);
        k.add('HoodBulge', 'wedge', [w, h * 0.6, 0.6], at(0, h * 0.3, -L / 2 - 0.3), [ang, 180, 0], col);
        break;
      case 'vents': {
        const n = Math.round(num(p, 'count', 4));
        k.add('HoodVent', 'block', [w / 2.2, 0.04, 0.16], at(-w / 3.5, 0.03, -L / 2), [ang, 0, 0], '@trim', { mirror: true, repeat: { count: n, offset: [0, 0, 0], rotate: [0, 0, 0] } });
        // spread the repeats along the slope
        const s = k.shapes[k.shapes.length - 1];
        const a = (-ang * Math.PI) / 180;
        const step = L / Math.max(1, n - 1);
        s.repeat = { count: n, offset: [0, step * Math.sin(a), step * Math.cos(a)], rotate: [0, 0, 0] };
        break;
      }
      case 'louvres': {
        const n = Math.round(num(p, 'count', 6));
        const a = (-ang * Math.PI) / 180;
        const step = L / Math.max(1, n - 1);
        k.add('Louvre', 'wedge', [w / 2.5, 0.08, 0.2], at(-w / 3, 0.04, -L / 2), [ang, 0, 0], '@trim', { mirror: true, repeat: { count: n, offset: [0, step * Math.sin(a), step * Math.cos(a)], rotate: [0, 0, 0] } });
        break;
      }
      case 'stripes':
        k.add('HoodStripe', 'block', [w / 4, 0.02, (zb - za) + 1.2], [-w / 4, B.heightAt((za + zb) / 2) + 0.01, (za + zb) / 2], [ang, 0, 0], '@accent', { mirror: true });
        break;
      case 'panel':
        k.add('HoodPanel', 'block', [w, 0.03, L], at(0, 0.015), [ang, 0, 0], '@carbon');
        break;
    }
    return k.shapes;
  },
  presets: [
    { name: 'Single Scoop', params: { style: 'scoop', width: 1.4, length: 1.6, height: 0.3 } },
    { name: 'Twin Scoops', params: { style: 'twin', width: 2.4, length: 1.4, height: 0.25 } },
    { name: 'Power Bulge', params: { style: 'bulge', width: 2.2, length: 2.6, height: 0.35, pos: 0.6 } },
    { name: 'Track Vents', params: { style: 'vents', width: 2.8, length: 1.2, count: 4, pos: 0.4 } },
    { name: 'Corner Louvres', params: { style: 'louvres', width: 3.4, length: 1.4, count: 6, pos: 0.5 } },
    { name: 'Racing Stripes', params: { style: 'stripes', width: 1.6 } },
    { name: 'Carbon Panel', params: { style: 'panel', width: 3.6, length: 3, pos: 0.5 } },
  ],
};
