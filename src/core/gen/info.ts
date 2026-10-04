import type { Car, Params } from '../types';
import { num, pts, str } from './kit';

// Shared measurements every generator reads: where the body's nose, tail, hood, deck and cabin are.
// They come from the car's sizes and the body / windows generators, so a bumper or spoiler follows the body
// when the body changes.

export interface BodyInfo {
  /** Front and rear face z, half width. */
  F: number;
  R: number;
  hw: number;
  floor: number;
  belt: number;
  roof: number;
  /** Side profile top line, front to back, car-space [z, y]. */
  profile: number[][];
  heightAt(z: number): number;
  /** Windows: windscreen base, roof front, roof back, rear glass base (z), glass half width. */
  ws: number;
  rf: number;
  rb: number;
  rg: number;
  gw: number;
  /** Wheel axles. */
  fz: number;
  rz: number;
}

export function bodyParams(car: Car): Params {
  return car.parts.find((p) => p.gen?.type === 'body')?.gen?.params ?? {};
}
export function glassParams(car: Car): Params {
  return car.parts.find((p) => p.gen?.type === 'glass')?.gen?.params ?? {};
}

/** Slider profile: nose, hood, cowl (windscreen base), deck, tail. */
export function sliderProfile(car: Car, b: Params, g: Params): number[][] {
  const P = car.params;
  const F = -P.length / 2, R = P.length / 2;
  const ws = F + P.length * (num(g, 'windscreen', 0.36) );
  const rg = F + P.length * num(g, 'rearGlass', 0.78);
  const noseLen = num(b, 'noseLength', 0.5), tailLen = num(b, 'tailLength', 0.4);
  const out = [
    [F, num(b, 'noseHeight', P.floor + 1.2)],
    [F + noseLen, num(b, 'hoodFront', P.belt - 0.35)],
    [ws, num(b, 'cowl', P.belt - 0.05)],
    [rg, num(b, 'deck', P.belt)],
    [R - tailLen, num(b, 'tailTop', P.belt + 0.05)],
    [R, num(b, 'tailHeight', P.belt - 0.3)],
  ];
  // keep it ordered front to back
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][0] + 0.05) out[i][0] = out[i - 1][0] + 0.05;
  return out;
}

export function bodyInfo(car: Car): BodyInfo {
  const P = car.params;
  const b = bodyParams(car), g = glassParams(car);
  const F = -P.length / 2, R = P.length / 2;
  let profile: number[][];
  if (str(b, 'mode', 'sliders') === 'points' && pts(b, 'profile').length >= 2) {
    profile = pts(b, 'profile').map(([zf, y]) => [zf * P.length, y]);
  } else {
    profile = sliderProfile(car, b, g);
  }
  const heightAt = (z: number) => {
    if (z <= profile[0][0]) return profile[0][1];
    for (let i = 0; i < profile.length - 1; i++) {
      const [za, ya] = profile[i], [zb, yb] = profile[i + 1];
      if (z >= za && z <= zb) return zb - za < 1e-6 ? Math.max(ya, yb) : ya + ((yb - ya) * (z - za)) / (zb - za);
    }
    return profile[profile.length - 1][1];
  };
  const L = P.length;
  return {
    F, R, hw: P.width / 2, floor: P.floor, belt: P.belt, roof: P.roof, profile, heightAt,
    ws: F + L * num(g, 'windscreen', 0.36),
    rf: F + L * num(g, 'roofFront', 0.5),
    rb: F + L * num(g, 'roofBack', 0.66),
    rg: F + L * num(g, 'rearGlass', 0.78),
    gw: P.width / 2 - num(g, 'inset', 0.3),
    fz: P.axleOffset,
    rz: P.axleOffset + P.wheelbase,
  };
}
