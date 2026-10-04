// Tiny DOM helpers and form controls shared by the panels.

type Attrs = Record<string, unknown> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS: Record<string, string> = {
  eye: '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>',
  eyeOff: '<path d="M2 2l12 12M6.5 3.3A7 7 0 0 1 8 3c4.5 0 7 5 7 5a12 12 0 0 1-2 2.6M4 5A12 12 0 0 0 1 8s2.5 5 7 5a7 7 0 0 0 3-.7"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
  unlock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 5.8-1"/>',
  undo: '<path d="M5 3L2 6l3 3"/><path d="M2 6h8a4 4 0 0 1 0 8H7"/>',
  redo: '<path d="M11 3l3 3-3 3"/><path d="M14 6H6a4 4 0 0 0 0 8h3"/>',
  move: '<path d="M8 1v14M1 8h14M8 1l-2 2M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2"/>',
  rotate: '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M12 1v4H8"/>',
  scale: '<rect x="2" y="7" width="7" height="7"/><path d="M7 2h7v7M14 2L9 7"/>',
  select: '<path d="M3 2l9 5-4 1.5L6.5 13z"/>',
  mirror: '<path d="M8 1v14" stroke-dasharray="2 1.5"/><path d="M6 4L2 12h4zM10 4l4 8h-4z"/>',
  copy: '<rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>',
  trash: '<path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10"/>',
  link: '<path d="M7 9a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4L9 3"/><path d="M9 7a3 3 0 0 0-4 0L2 10a3 3 0 0 0 4 4l1-1"/>',
  sliders: '<path d="M3 2v12M8 2v12M13 2v12"/><circle cx="3" cy="10" r="1.5"/><circle cx="8" cy="5" r="1.5"/><circle cx="13" cy="9" r="1.5"/>',
  cut: '<rect x="2" y="2" width="12" height="12" stroke-dasharray="2 1.5"/><path d="M5 5l6 6M11 5l-6 6"/>',
  box: '<path d="M2 5l6-3 6 3v6l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v6"/>',
  block: '<path d="M2 5l6-3 6 3v6l-6 3-6-3z"/><path d="M2 5l6 3 6-3M8 8v6"/>',
  wedge: '<path d="M2 13h12V4z"/><path d="M2 13l12-9"/>',
  cornerwedge: '<path d="M2 13h10l2-9z"/><path d="M12 13l2-9M2 13l12-9"/>',
  cylinder: '<ellipse cx="4" cy="8" rx="2" ry="5"/><path d="M4 3h8M4 13h8"/><ellipse cx="12" cy="8" rx="2" ry="5"/>',
  ball: '<circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="6" ry="2"/>',
  plus: '<path d="M8 2v12M2 8h12"/>',
  frame: '<path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"/><circle cx="8" cy="8" r="2"/>',
  repeat: '<rect x="1" y="5" width="4" height="6"/><rect x="6" y="5" width="4" height="6" opacity=".6"/><rect x="11" y="5" width="4" height="6" opacity=".3"/>',
  drop: '<path d="M8 1v9M5 7l3 3 3-3"/><path d="M2 14h12"/>',
  xray: '<rect x="2" y="2" width="12" height="12" rx="2" stroke-dasharray="3 2"/><circle cx="8" cy="8" r="3"/>',
  grid: '<path d="M1 5h14M1 11h14M5 1v14M11 1v14"/>',
  car: '<path d="M2 10V8l2-3h7l3 3v2z"/><circle cx="5" cy="11" r="1.5"/><circle cx="11" cy="11" r="1.5"/>',
  image: '<rect x="1" y="3" width="14" height="10" rx="1"/><circle cx="5" cy="7" r="1.5"/><path d="M1 12l5-4 4 3 2-2 3 3"/>',
  save: '<path d="M2 2h10l2 2v10H2z"/><path d="M5 2v4h6V2M5 14v-4h6v4"/>',
  folder: '<path d="M1 4h5l1 2h8v8H1z"/>',
  export: '<path d="M8 10V1M5 4l3-3 3 3"/><path d="M2 9v5h12V9"/>',
  file: '<path d="M3 1h6l4 4v10H3z"/><path d="M9 1v4h4"/>',
  group: '<rect x="1" y="1" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><path d="M4 7v5h5M12 9V4H7" stroke-dasharray="1.5 1.5"/>',
  split: '<path d="M2 2h5v5H2zM9 9h5v5H9z"/><path d="M9 2h5v5H9z" opacity=".5"/>',
  align: '<path d="M2 1v14"/><rect x="4" y="3" width="9" height="3"/><rect x="4" y="9" width="5" height="3"/>',
  help: '<circle cx="8" cy="8" r="7"/><path d="M6 6a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.6M8 12v.5"/>',
  measure: '<path d="M1 11l10-10 4 4-10 10z"/><path d="M4 8l1.5 1.5M6 6l1.5 1.5M8 4l1.5 1.5"/>',
  chevron: '<path d="M6 4l4 4-4 4"/>',
  star: '<path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>',
};

export function icon(name: string, title?: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = (title ? `<title>${title}</title>` : '') + (ICONS[name] ?? '');
  return svg;
}

export function btn(label: string | Node, onClick: (e: MouseEvent) => void, opts: { icon?: string; title?: string; class?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = h('button', { class: `btn ${opts.class ?? ''}`, title: opts.title ?? (typeof label === 'string' ? label : ''), disabled: opts.disabled, onclick: (e: MouseEvent) => onClick(e) });
  if (opts.icon) b.appendChild(icon(opts.icon));
  if (label !== '') b.appendChild(typeof label === 'string' ? h('span', {}, label) : label);
  return b;
}

/** Safe arithmetic for number fields: "2+0.5", "3*2", "-1.25". */
export function evalNumber(text: string): number | null {
  const t = text.trim().replace(/,/g, '.');
  if (!/^[\d+\-*/().\s]+$/.test(t)) return null;
  try {
    const v = Function(`"use strict";return (${t});`)() as number;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export interface NumberOpts {
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  /** Called many times while dragging the label or the slider. */
  live?: (v: number) => void;
  /** Called once when the edit is finished. */
  done: (v: number) => void;
  start?: () => void;
  slider?: boolean;
}

/** A number box. Type a value (maths works), drag its label left / right, or use the slider. */
export function numberField(label: string, value: number, o: NumberOpts): HTMLElement {
  const digits = o.digits ?? 3;
  const fmt = (v: number) => String(Math.round(v * 10 ** digits) / 10 ** digits);
  const clampV = (v: number) => Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
  const input = h('input', { class: 'num', type: 'text', value: fmt(value), spellcheck: false });
  let cur = value;
  const set = (v: number, final: boolean) => {
    cur = clampV(v);
    input.value = fmt(cur);
    if (slider) slider.value = String(cur);
    if (final) o.done(cur);
    else o.live?.(cur);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { input.value = fmt(cur); input.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const st = (o.step ?? 0.1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      set(cur + st, true);
    }
    e.stopPropagation();
  });
  input.addEventListener('change', () => {
    const v = evalNumber(input.value);
    if (v === null) { input.value = fmt(cur); return; }
    set(v, true);
  });
  const lab = h('label', { class: 'scrub', title: 'Drag left or right to change' }, label);
  lab.addEventListener('pointerdown', (e) => {
    const x0 = e.clientX, v0 = cur;
    let moved = false;
    lab.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; o.start?.(); }
      const step = o.step ?? 0.05;
      set(v0 + Math.round(dx / 4) * step * (ev.shiftKey ? 0.1 : 1), false);
    };
    const up = () => {
      lab.removeEventListener('pointermove', move);
      lab.removeEventListener('pointerup', up);
      if (moved) o.done(cur);
      else input.focus();
    };
    lab.addEventListener('pointermove', move);
    lab.addEventListener('pointerup', up);
  });
  let slider: HTMLInputElement | null = null;
  if (o.slider && o.min !== undefined && o.max !== undefined) {
    slider = h('input', { type: 'range', min: o.min, max: o.max, step: o.step ?? 0.01, value: value, class: 'slider' });
    let started = false;
    slider.addEventListener('input', () => {
      if (!started) { started = true; o.start?.(); }
      set(Number(slider!.value), false);
    });
    slider.addEventListener('change', () => { started = false; set(Number(slider!.value), true); });
  }
  return h('div', { class: `field ${slider ? 'has-slider' : ''}` }, lab, slider, input);
}

/** Three number boxes in a row (X Y Z). */
export function vecField(label: string, v: [number, number, number], o: { step?: number; min?: number; done: (v: [number, number, number]) => void; live?: (v: [number, number, number]) => void; start?: () => void }): HTMLElement {
  const cur = [...v] as [number, number, number];
  const parts = ['X', 'Y', 'Z'].map((ax, i) =>
    numberField(ax, v[i], {
      step: o.step, min: o.min,
      start: o.start,
      live: (x) => { cur[i] = x; o.live?.([...cur] as [number, number, number]); },
      done: (x) => { cur[i] = x; o.done([...cur] as [number, number, number]); },
    }),
  );
  return h('div', { class: 'vec' }, h('div', { class: 'vec-label' }, label), h('div', { class: 'vec-row' }, parts));
}

export function selectField(label: string, value: string, options: [string, string][], done: (v: string) => void): HTMLElement {
  const sel = h('select', { onchange: () => done(sel.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  if (!options.some(([v]) => v === value)) sel.prepend(h('option', { value, selected: true }, value));
  return h('div', { class: 'field' }, h('label', {}, label), sel);
}

export function checkField(label: string, value: boolean, done: (v: boolean) => void, hint?: string): HTMLElement {
  const cb = h('input', { type: 'checkbox', checked: value, onchange: () => done(cb.checked) });
  return h('label', { class: 'check', title: hint ?? '' }, cb, h('span', {}, label));
}

export function textField(label: string, value: string, done: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'text', value, spellcheck: false });
  input.addEventListener('change', () => done(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });
  return h('div', { class: 'field' }, h('label', {}, label), input);
}

export function colorInput(value: string, live: (v: string) => void, done: (v: string) => void): HTMLInputElement {
  const c = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff', class: 'color' });
  c.addEventListener('input', () => live(c.value));
  c.addEventListener('change', () => done(c.value));
  return c;
}

export function section(title: string, body: Child[], opts: { open?: boolean; key?: string; actions?: Node[] } = {}): HTMLElement {
  const key = opts.key ? `lpcb.sec.${opts.key}` : null;
  let open = opts.open ?? true;
  try { if (key) { const v = localStorage.getItem(key); if (v !== null) open = v === '1'; } } catch { /* ignore */ }
  const d = h('details', { class: 'sec', open }, h('summary', {}, h('span', {}, title), opts.actions ? h('span', { class: 'sec-actions', onclick: (e: Event) => e.preventDefault() }, opts.actions) : null), h('div', { class: 'sec-body' }, body));
  d.addEventListener('toggle', () => { try { if (key) localStorage.setItem(key, d.open ? '1' : '0'); } catch { /* ignore */ } });
  return d;
}

let toastTimer = 0;
export function toast(msg: string, ms = 3200) {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

export function modal(title: string, body: Node, opts: { wide?: boolean; onClose?: () => void; footer?: Node[] } = {}): { close(): void; el: HTMLElement } {
  const root = document.getElementById('modal')!;
  const close = () => { root.innerHTML = ''; root.classList.remove('open'); document.removeEventListener('keydown', key); opts.onClose?.(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: `dialog ${opts.wide ? 'wide' : ''}` },
    h('div', { class: 'dialog-head' }, h('h2', {}, title), btn('', close, { icon: 'plus', class: 'icon close', title: 'Close' })),
    h('div', { class: 'dialog-body' }, body),
    opts.footer ? h('div', { class: 'dialog-foot' }, opts.footer) : null,
  );
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'backdrop', onclick: close }));
  root.appendChild(box);
  root.classList.add('open');
  document.addEventListener('keydown', key);
  return { close, el: box };
}

export function menu(items: ({ label: string; key?: string; run: () => void; disabled?: boolean } | '-')[], x: number, y: number) {
  const old = document.getElementById('ctx');
  old?.remove();
  const el = h('div', { id: 'ctx', class: 'menu', style: `left:${x}px;top:${y}px` },
    items.map((it) => it === '-' ? h('hr') : h('button', { disabled: it.disabled, onclick: () => { el.remove(); it.run(); } }, h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : null)),
  );
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  if (r.right > innerWidth) el.style.left = `${innerWidth - r.width - 6}px`;
  if (r.bottom > innerHeight) el.style.top = `${innerHeight - r.height - 6}px`;
  const off = (e: Event) => { if (!el.contains(e.target as Node)) { el.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
}
