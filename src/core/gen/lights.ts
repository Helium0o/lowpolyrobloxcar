import { bodyInfo } from './info';
import { bool, Kit, num, str, type Generator } from './kit';

// Head and taillights, named the way the game finds its lamps (Headlight, HeadlightHousing, Taillight,
// TailRing, TailHousing, ReverseLight): a Neon "Headlight" glows and takes the headlight colour in game.

const STYLES: [string, string][] = [['box', 'Box'], ['round', 'Round'], ['twin', 'Twin round'], ['bar', 'Slim bar'], ['quad', 'Quad'], ['brow', 'LED brow']];

function lamps(front: boolean): Generator {
  const name = front ? 'Headlight' : 'Taillight';
  return {
    type: front ? 'headlights' : 'taillights',
    label: front ? 'Headlights' : 'Taillights',
    slot: front ? 'headlights' : 'taillights',
    partName: front ? 'Headlights' : 'Taillights',
    defs: [
      { key: 'style', label: 'Style', type: 'select', options: front ? STYLES : [...STYLES, ['full', 'Full width bar']] },
      { key: 'width', label: 'Width', type: 'number', min: 0.2, max: 3, step: 0.02 },
      { key: 'height', label: 'Height', type: 'number', min: 0.08, max: 1.2, step: 0.02 },
      { key: 'x', label: 'Distance from centre', type: 'number', min: 0, max: 3.5, step: 0.02 },
      { key: 'y', label: 'Height above ground', type: 'number', min: 0.4, max: 4, step: 0.02 },
      { key: 'inset', label: 'Set back from the face', type: 'number', min: -0.4, max: 1.2, step: 0.01 },
      { key: 'housing', label: 'Dark housing', type: 'bool' },
      ...(front ? [] : [{ key: 'reverse', label: 'Reverse lights', type: 'bool' as const }]),
      ...(front ? [{ key: 'indicator', label: 'Amber indicators', type: 'bool' as const }] : []),
    ],
    defaults: (car) => ({
      style: front ? 'box' : 'box', width: 1.3, height: 0.36, x: car.params.width / 2 - 0.95,
      y: car.params.belt - (front ? 0.5 : 0.45), inset: front ? 0.05 : 0.05, housing: true, reverse: true, indicator: false,
    }),
    build(car, p) {
      const k = new Kit();
      const B = bodyInfo(car);
      const s = front ? -1 : 1; // which way is "out of the car" along z
      const style = str(p, 'style', 'box');
      const w = num(p, 'width', 1.3), h = num(p, 'height', 0.36);
      const cx = -Math.min(num(p, 'x', 2), B.hw - w / 2 + 0.2), y = num(p, 'y', 2);
      // face z where the lamp sits: the body's end face, or in from it
      const face = (front ? B.F : B.R) + -s * num(p, 'inset', 0);
      const lit = front ? '@light' : '@tail';
      const neon = { material: 'Neon' };
      if (bool(p, 'housing') && style !== 'full') {
        k.box(front ? 'HeadlightHousing' : 'TailHousing', cx - w / 2 - 0.06, cx + w / 2 + 0.06, y - h / 2 - 0.06, y + h / 2 + 0.06, face - 0.15 * s, face + 0.03 * s, front ? '#1e222c' : '#2a0c10', { mirror: true, material: front ? 'Glass' : 'SmoothPlastic' });
      }
      const lz = face + 0.07 * s;
      switch (style) {
        case 'box':
          k.box(name, cx - w / 2, cx + w / 2, y - h / 2, y + h / 2, lz - 0.05, lz + 0.05, lit, { mirror: true, ...neon });
          break;
        case 'round':
          k.tubeZ(name, cx, y, lz, Math.min(w, h) / 2, 0.1, lit, { mirror: true, ...neon });
          if (!front) k.tubeZ('TailRing', cx, y, lz - 0.02 * s, Math.min(w, h) / 2 + 0.07, 0.08, '#2a0c10', { mirror: true });
          break;
        case 'twin': {
          const r = Math.min(w / 4, h / 2);
          k.tubeZ(name, cx - w / 4, y, lz, r, 0.1, lit, { mirror: true, ...neon, repeat: { count: 2, offset: [w / 2, 0, 0], rotate: [0, 0, 0] } });
          if (!front) k.tubeZ('TailRing', cx - w / 4, y, lz - 0.02 * s, r + 0.06, 0.08, '#2a0c10', { mirror: true, repeat: { count: 2, offset: [w / 2, 0, 0], rotate: [0, 0, 0] } });
          break;
        }
        case 'bar':
          k.box(name, cx - w / 2, cx + w / 2, y - 0.06, y + 0.06, lz - 0.05, lz + 0.05, lit, { mirror: true, ...neon });
          break;
        case 'quad': {
          const r = Math.min(w / 4, h / 4);
          k.box(name, cx - w / 2 + 0.02, cx - w / 2 + 0.02 + r * 1.6, y - r * 0.8, y + r * 0.8, lz - 0.05, lz + 0.05, lit, { mirror: true, ...neon, repeat: { count: 3, offset: [(w - r * 1.6 - 0.04) / 2, 0, 0], rotate: [0, 0, 0] } });
          break;
        }
        case 'brow':
          k.box(name, cx - w / 2, cx + w / 2, y + h / 2 - 0.07, y + h / 2, lz - 0.05, lz + 0.05, lit, { mirror: true, ...neon });
          k.box(name, cx - w / 2, cx - w / 2 + 0.07, y - h / 2, y + h / 2, lz - 0.05, lz + 0.05, lit, { mirror: true, ...neon });
          break;
        case 'full':
          k.box(name, -(B.hw - 0.3), B.hw - 0.3, y - 0.07, y + 0.07, lz - 0.05, lz + 0.05, lit, neon);
          k.box('TailHousing', -(B.hw - 0.2), B.hw - 0.2, y - h / 2, y + h / 2, face - 0.1 * s, face + 0.03 * s, '#2a0c10');
          break;
      }
      if (!front && bool(p, 'reverse')) k.box('ReverseLight', cx + w / 2 + 0.12, cx + w / 2 + 0.42, y - 0.08, y + 0.08, lz - 0.04, lz + 0.04, '#f2f2f2', { mirror: true });
      if (front && bool(p, 'indicator')) k.box('Indicator', cx - w / 2 - 0.3, cx - w / 2 - 0.1, y - h / 2, y + h / 2, lz - 0.04, lz + 0.04, '#ffa020', { mirror: true, material: 'Neon' });
      return k.shapes;
    },
    presets: front
      ? [
          { name: 'Twin Projector', params: { style: 'twin', width: 1.2, height: 0.4 } },
          { name: 'Slim Bar', params: { style: 'bar', width: 1.6 } },
          { name: 'LED Brow', params: { style: 'brow', width: 1.3, height: 0.4 } },
          { name: 'Quad Round', params: { style: 'quad', width: 1.4, height: 0.4 } },
          { name: 'Retro Round', params: { style: 'round', width: 0.6, height: 0.6, housing: false } },
          { name: 'Amber Corner', params: { style: 'box', indicator: true } },
        ]
      : [
          { name: 'Quad Rings', params: { style: 'twin', width: 1.3, height: 0.5, housing: false } },
          { name: 'LED Bars', params: { style: 'bar', width: 1.6 } },
          { name: 'Light Bar', params: { style: 'full', height: 0.3 } },
          { name: 'Retro Round', params: { style: 'round', width: 0.55, height: 0.55 } },
          { name: 'Smoked', params: { style: 'box', housing: true } },
        ],
  };
}

export const headlightsGen = lamps(true);
export const taillightsGen = lamps(false);
