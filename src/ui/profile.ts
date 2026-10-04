import { bodyInfo } from '../core/gen/info';
import type { Car } from '../core/types';

// Side-view editor for the body's top line. Drag points, double-click a line to add a point,
// right-click a point to remove it. Points are stored as [share of the car length, height].

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function profileEditor(car: Car, pts: number[][], o: { start(): void; live(p: number[][]): void; done(p: number[][]): void }): HTMLElement {
  const L = car.params.length;
  const B = bodyInfo(car);
  const top = Math.max(car.params.roof, ...pts.map((p) => p[1])) + 0.8;
  const svg = el('svg', { viewBox: `${B.F - 0.8} ${-top} ${L + 1.6} ${top + 0.4}`, class: 'profile', preserveAspectRatio: 'xMidYMid meet' });
  const wrap = document.createElement('div');
  wrap.className = 'profile-wrap';
  wrap.appendChild(svg);
  let cur = pts.map((p) => [...p]);

  // reference drawing: ground, wheels, windows
  svg.appendChild(el('line', { x1: B.F - 1, y1: 0, x2: B.R + 1, y2: 0, class: 'ground' }));
  for (const z of [B.fz, B.rz]) svg.appendChild(el('circle', { cx: z, cy: -car.params.wheelRadius, r: car.params.wheelRadius, class: 'wheel' }));
  svg.appendChild(el('polyline', { points: [[B.ws, B.belt], [B.rf, car.params.roof], [B.rb, car.params.roof], [B.rg, B.belt]].map(([z, y]) => `${z},${-y}`).join(' '), class: 'glass' }));
  svg.appendChild(el('line', { x1: B.F, y1: -B.floor, x2: B.R, y2: -B.floor, class: 'floor' }));
  const fill = el('polygon', { class: 'body' });
  const line = el('polyline', { class: 'line' });
  svg.append(fill, line);
  const dots = el('g');
  svg.appendChild(dots);

  const toCar = (e: MouseEvent) => {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, -q.y];
  };
  const snap = (v: number, s: number) => Math.round(v / s) * s;
  const draw = () => {
    const abs = cur.map(([f, y]) => [f * L, y]);
    line.setAttribute('points', abs.map(([z, y]) => `${z},${-y}`).join(' '));
    fill.setAttribute('points', [...abs.map(([z, y]) => `${z},${-y}`), `${abs[abs.length - 1][0]},${-B.floor}`, `${abs[0][0]},${-B.floor}`].join(' '));
    dots.replaceChildren();
    abs.forEach(([z, y], i) => {
      const c = el('circle', { cx: z, cy: -y, r: 0.22, class: 'pt' });
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (e.button !== 0) return;
        o.start();
        c.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const [zz, yy] = toCar(ev);
          const lo = i > 0 ? cur[i - 1][0] + 0.005 : -0.6, hi = i < cur.length - 1 ? cur[i + 1][0] - 0.005 : 0.6;
          cur[i] = [Math.min(hi, Math.max(lo, snap(zz / L, ev.shiftKey ? 0.001 : 0.0025))), Math.max(car.params.floor + 0.1, snap(yy, ev.shiftKey ? 0.01 : 0.05))];
          if (i === 0) cur[0][0] = Math.min(cur[0][0], -0.45);
          if (i === cur.length - 1) cur[i][0] = Math.max(cur[i][0], 0.45);
          draw();
          o.live(cur.map((p) => [round(p[0]), round(p[1])]));
        };
        const up = () => {
          c.removeEventListener('pointermove', move);
          c.removeEventListener('pointerup', up);
          o.done(cur.map((p) => [round(p[0]), round(p[1])]));
        };
        c.addEventListener('pointermove', move);
        c.addEventListener('pointerup', up);
      });
      c.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (cur.length <= 3) return;
        o.start();
        cur.splice(i, 1);
        draw();
        o.done(cur);
      });
      dots.appendChild(c);
    });
  };
  line.addEventListener('dblclick', (e) => {
    const [z, y] = toCar(e);
    const f = z / L;
    const i = cur.findIndex((p) => p[0] > f);
    if (i <= 0) return;
    o.start();
    cur.splice(i, 0, [round(f), round(y)]);
    draw();
    o.done(cur);
  });
  draw();
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Drag the dots. Double-click the line to add one, right-click a dot to remove it. Hold Shift for fine steps.';
  wrap.appendChild(hint);
  return wrap;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
