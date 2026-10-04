import { buildPart } from './build';
import { CAR_TRI_TARGET, exportFiles, robloxCheck, visibleParts, type ExportChoice } from './export';
import { customPart, customParts, GAME_CAT_NAMES, GAME_CATS, gameCatOf, type GameCat } from './customparts';
import { openTextFile, saveFile, saveFiles } from './io';
import { ROLE_LABELS, ROLES, SHAPE_LABELS, SHAPE_TYPES, cloneCar, safeName, uid, type Car, type Effects, type Part, type Role, type Shape, type ShapeType, type SlotId, type Vec3 } from './model';
import type { Store } from './store';
import {
  BASES, CATEGORIES, EXHAUST_FINISHES, PAINT_PRESETS, RIM_FINISHES, SLOT_NAMES, applyChoice, applyWheelSettings, baseSpec, makeCtx, newCar, partSlotFor, slotVariants,
} from './templates';
import { Thumbs } from './thumbs';
import type { GizmoMode, Viewport, ViewName } from './viewport';

// ---------- tiny DOM helper ----------

type Attrs = Record<string, unknown> & { class?: string; style?: string };
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && k !== 'style' && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const MYPARTS_KEY = 'lpcb.myparts.v1';
interface SavedPart {
  name: string;
  slot: Part['slot'];
  shapes: Shape[];
}
function loadMyParts(): SavedPart[] {
  try {
    return JSON.parse(localStorage.getItem(MYPARTS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveMyParts(list: SavedPart[]) {
  try {
    localStorage.setItem(MYPARTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

const AURAS: Effects['aura']['style'][] = ['none', 'sparkles', 'stars', 'glow', 'fire', 'bubbles'];
const BOOSTS: Effects['boost']['style'][] = ['none', 'flame', 'neon', 'smoke', 'rainbow'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class UI {
  private thumbs = new Thumbs();
  private leftTab: 'car' | 'parts' = 'car';
  private clipboard: Shape | null = null;
  private openSections = new Set<string>(['Body', 'Body kit']);
  private statsTimer = 0;

  constructor(private store: Store, private vp: Viewport) {
    this.buildChrome();
    store.on((c) => this.onChange(c));
    this.bindKeys();
    this.vp.setShowHoles(this.showHoles);
    this.renderAll();
    this.vp.focusSelection();
  }

  // ---------- layout ----------

  private buildChrome() {
    const top = $('#top');
    const btn = (label: string, title: string, fn: () => void, id?: string) => h('button', { class: 'tb', title, onclick: fn, id }, label);
    top.append(
      h('div', { class: 'brand' }, h('span', { class: 'logo' }), 'Low Poly Car Builder'),
      h('div', { class: 'group' },
        btn('New', 'Start a new car', () => this.newDialog()),
        btn('Open', 'Open a saved car (Ctrl+O)', () => this.open()),
        btn('Save', 'Save this car (Ctrl+S)', () => this.save()),
      ),
      h('div', { class: 'group' },
        btn('↶', 'Undo (Ctrl+Z)', () => this.store.undo(), 'undo'),
        btn('↷', 'Redo (Ctrl+Y)', () => this.store.redo(), 'redo'),
      ),
      h('div', { class: 'group', id: 'views' },
        ...(['persp', 'front', 'side', 'back', 'top'] as ViewName[]).map((v) => btn(v === 'persp' ? '3D' : cap(v), `${cap(v)} view`, () => { this.vp.setView(v); this.renderTools(); })),
      ),
      h('div', { class: 'spacer' }),
      h('input', { class: 'carname', value: this.store.car.name, title: 'Car name (used for file names)', id: 'carname', onchange: (e: Event) => this.store.update((c) => (c.name = safeName((e.target as HTMLInputElement).value) || 'MyCar'), 'sel') }),
      h('button', { class: 'tb primary', title: 'Export for Roblox (Ctrl+E)', onclick: () => this.exportDialog() }, 'Export for Roblox'),
    );
  }

  private renderAll() {
    this.vp.setCar(this.store.car, this.store.sel);
    this.thumbs.setColors(this.store.car);
    this.renderLeft();
    this.renderTools();
    this.renderInspector();
    this.scheduleStats();
    this.renderTopState();
  }

  private onChange(c: string) {
    if (c === 'sel') {
      this.vp.setCar(this.store.car, this.store.sel);
      this.renderInspector();
      this.renderTools();
      if (this.leftTab === 'parts') this.renderLeft();
      this.renderTopState();
      return;
    }
    if (c === 'paint') {
      this.vp.setColors(this.store.car);
      this.vp.updateEffects(this.store.car);
      this.thumbs.setColors(this.store.car);
      this.renderTopState();
      this.scheduleLeft();
      return;
    }
    if (c === 'effects') {
      this.vp.updateEffects(this.store.car);
      this.renderTopState();
      this.scheduleLeft();
      return;
    }
    this.renderAll();
  }

  private leftTimer = 0;
  private scheduleLeft() {
    clearTimeout(this.leftTimer);
    this.leftTimer = window.setTimeout(() => this.renderLeft(), 250);
  }

  private renderTopState() {
    ($('#undo') as HTMLButtonElement).disabled = !this.store.canUndo;
    ($('#redo') as HTMLButtonElement).disabled = !this.store.canRedo;
    const name = $('#carname') as HTMLInputElement;
    if (document.activeElement !== name) name.value = this.store.car.name;
    document.querySelectorAll('#views button').forEach((b, i) => b.classList.toggle('on', (['persp', 'front', 'side', 'back', 'top'] as ViewName[])[i] === this.vp.view));
  }

  // ---------- left panel ----------

  private renderLeft() {
    const left = $('#left');
    const scroll = left.querySelector('.body')?.scrollTop ?? 0;
    left.replaceChildren(
      h('div', { class: 'tabs' },
        h('button', { class: this.leftTab === 'car' ? 'on' : '', onclick: () => { this.leftTab = 'car'; this.renderLeft(); } }, 'Car'),
        h('button', { class: this.leftTab === 'parts' ? 'on' : '', onclick: () => { this.leftTab = 'parts'; this.renderLeft(); } }, 'Parts & shapes'),
      ),
      h('div', { class: 'body' }, ...(this.leftTab === 'car' ? this.carPanel() : this.partsPanel())),
    );
    left.querySelector('.body')!.scrollTop = scroll;
  }

  private section(title: string, ...kids: (Node | null)[]): HTMLElement {
    const d = h('details', { class: 'sec', open: this.openSections.has(title) }, h('summary', {}, title), ...kids);
    d.addEventListener('toggle', () => (d.open ? this.openSections.add(title) : this.openSections.delete(title)));
    return d;
  }

  private carPanel(): Node[] {
    const car = this.store.car;
    const out: Node[] = [];
    this.thumbs.clearQueue();

    const baseCards = h('div', { class: 'cards' }, ...BASES.map((b) =>
      this.card(b.name, car.base === b.id, `base:${b.id}`, 'three', () => newCar(b.id).parts.filter((p) => p.slot !== 'custom'), () => {
        if (b.id === car.base) return;
        this.store.update((c) => applyChoice(c, 'body', b.id));
      })));
    out.push(this.section('Body', baseCards));

    for (const cat of CATEGORIES) {
      const rows: (Node | null)[] = cat.slots.map((slot) => this.slotRow(slot));
      if (cat.name === 'Lights') {
        rows.push(
          this.colorRow('Headlight colour', 'light'),
          this.colorRow('Taillight colour', 'tail'),
          h('div', { class: 'row' }, h('label', {}, 'Underglow'),
            this.toggle(car.effects.underglow.on, (v) => this.store.update((c) => (c.effects.underglow.on = v), 'effects'))),
          car.effects.underglow.on ? this.colorRow('Underglow colour', 'glow') : null,
          car.effects.underglow.on ? this.sliderRow('Glow brightness', car.effects.underglow.brightness, 0.5, 5, 0.5, (v) => this.store.update((c) => (c.effects.underglow.brightness = v), 'effects', 'glowb')) : null,
          h('div', { class: 'row' }, h('label', {}, 'Headlight beams'),
            this.toggle(car.effects.headlightBeams, (v) => this.store.update((c) => (c.effects.headlightBeams = v), 'effects'))),
        );
        out.push(this.section('Lights', ...rows));
        out.push(this.paintSection());
        continue;
      }
      if (cat.name === 'Wheels') {
        rows.push(
          this.finishRow('Rim finish', RIM_FINISHES, car.rimFinish, (name, hex) => this.store.update((c) => { c.rimFinish = name; c.paint.rim = hex; }, 'paint')),
          this.colorRow('Tyre colour', 'tire'),
          h('div', { class: 'sub' }, 'Wheel size (studs)'),
          ...(['radius', 'width', 'wheelbase', 'track'] as const).map((k) => {
            const lim = { radius: [0.6, 2.4, 0.01], width: [0.4, 2, 0.01], wheelbase: [4, 16, 0.05], track: [3, 9, 0.05] }[k];
            return this.sliderRow(cap(k === 'wheelbase' ? 'wheelbase' : k), car.wheels[k], lim[0], lim[1], lim[2], (v) =>
              this.store.update((c) => applyWheelSettings(c, { ...c.wheels, [k]: v }), 'car', 'wheel-' + k));
          }),
          h('button', { class: 'link', onclick: () => this.store.update((c) => applyWheelSettings(c, { ...baseSpec(c.base).wheels })) }, 'Reset wheel size'),
        );
      }
      if (cat.name === 'Exhaust & boost') {
        rows.push(
          this.finishRow('Exhaust finish', EXHAUST_FINISHES, car.exhaustFinish, (name, hex) => this.store.update((c) => { c.exhaustFinish = name; c.paint.tip = hex; }, 'paint')),
          h('div', { class: 'sub' }, 'Boost trail'),
          h('div', { class: 'chips' }, ...BOOSTS.map((b) => h('button', { class: 'chip' + (car.effects.boost.style === b ? ' on' : ''), onclick: () => this.store.update((c) => (c.effects.boost.style = b), 'effects') }, cap(b)))),
          car.effects.boost.style !== 'none' && car.effects.boost.style !== 'rainbow' && car.effects.boost.style !== 'smoke'
            ? h('div', { class: 'row' }, h('label', {}, 'Trail colour'), this.colorInput(car.effects.boost.color, (v) => this.store.update((c) => (c.effects.boost.color = v), 'effects', 'boostc')))
            : null,
        );
      }
      out.push(this.section(cat.name, ...rows));
    }

    out.push(this.section('Effects',
      h('div', { class: 'sub' }, 'Aura'),
      h('div', { class: 'chips' }, ...AURAS.map((a) => h('button', { class: 'chip' + (car.effects.aura.style === a ? ' on' : ''), onclick: () => this.store.update((c) => (c.effects.aura.style = a), 'effects') }, cap(a)))),
      car.effects.aura.style !== 'none' ? h('div', { class: 'row' }, h('label', {}, 'Aura colour'), this.colorInput(car.effects.aura.color, (v) => this.store.update((c) => (c.effects.aura.color = v), 'effects', 'aurac'))) : null,
      h('p', { class: 'note' }, 'Effects are exported as settings (the _Settings file) that your game turns into particles and lights. The preview here is a still picture so it never keeps the GPU busy.'),
    ));
    return out;
  }

  private paintSection(): HTMLElement {
    const car = this.store.car;
    return this.section('Paint & windows',
      h('div', { class: 'swatches' }, ...PAINT_PRESETS.map((p) =>
        h('button', { class: 'swatch', title: p.name, style: `background: linear-gradient(135deg, ${p.paint.paint} 60%, ${p.paint.accent} 60%)`, onclick: () => this.store.update((c) => Object.assign(c.paint, p.paint), 'paint') }))),
      this.colorRow('Paint', 'paint'),
      this.colorRow('Accent / stripes', 'accent'),
      this.colorRow('Trim', 'trim'),
      this.colorRow('Chrome', 'chrome'),
      this.colorRow('Window tint', 'glass'),
      this.sliderRow('Window darkness', car.glassOpacity, 0, 1, 0.05, (v) => this.store.update((c) => (c.glassOpacity = v), 'paint', 'glass-op')),
    );
  }

  private slotRow(slot: SlotId): HTMLElement {
    const car = this.store.car;
    const variants = slotVariants(slot);
    const mine = loadMyParts().filter((p) => p.slot === slot);
    const view = slot.startsWith('rear') || slot === 'taillights' || slot.startsWith('exhaust') || slot === 'trunkExtras' || slot === 'spoiler' ? 'rear' : slot === 'rims' || slot === 'tyres' ? 'side' : slot === 'sideSkirts' || slot === 'sideExtras' ? 'three' : 'front';
    const cards = variants.map((v) =>
      this.card(v.name, car.choices[slot] === v.id, `${car.base}:${slot}:${v.id}:${slot === 'rims' || slot === 'tyres' || slot === 'exhaustTips' ? car.choices.tyres + car.choices.rims + car.choices.exhaust : ''}`, view, () => {
        if (v.id === 'none') return [];
        const tmp = cloneCar(car);
        applyChoice(tmp, slot, v.id);
        const kinds = partSlotFor(slot);
        const parts = tmp.parts.filter((p) => kinds.includes(p.slot));
        return slot === 'rims' || slot === 'tyres' ? parts.filter((p) => p.name === 'WheelFR') : slot === 'exhaustTips' ? parts.filter((p) => p.slot === 'exhaustTips' || p.slot === 'exhaust') : parts;
      }, () => this.store.update((c) => applyChoice(c, slot, v.id))));
    for (const m of mine) {
      cards.push(this.card('★ ' + m.name, false, `mine:${m.name}:${m.shapes.length}`, view, () => [this.partFromSaved(m)], () => this.store.update((c) => {
        const kinds = partSlotFor(slot);
        c.parts = c.parts.filter((p) => !kinds.includes(p.slot));
        c.parts.push(this.partFromSaved(m));
      })));
    }
    return h('div', { class: 'slot' }, h('div', { class: 'slotname' }, SLOT_NAMES[slot]), h('div', { class: 'cards' }, ...cards));
  }

  private partFromSaved(m: SavedPart): Part {
    const car = this.store.car;
    const c = makeCtx(baseSpec(car.base), car.wheels);
    const pivot: Vec3 = m.slot in c.mounts ? [...c.mounts[m.slot as keyof typeof c.mounts]] as Vec3 : [0, 0, 0];
    return { id: uid('p'), name: safeName(m.name), slot: m.slot, variant: 'mine', pivot, shapes: m.shapes.map((s) => ({ ...s, id: uid('s') })) };
  }

  private card(label: string, on: boolean, key: string, view: 'front' | 'rear' | 'side' | 'three', parts: () => Part[], pick: () => void): HTMLElement {
    const img = h('img', { alt: '', draggable: false });
    const el = h('button', { class: 'card' + (on ? ' on' : ''), title: label, onclick: pick }, h('div', { class: 'thumb' }, img), h('span', {}, label));
    if (label === 'None') el.querySelector('.thumb')!.append(h('span', { class: 'none' }, '∅'));
    else this.thumbs.request(key, view, parts, (url) => (img.src = url));
    return el;
  }

  private colorInput(value: string, set: (v: string) => void): HTMLInputElement {
    return h('input', { type: 'color', value, oninput: (e: Event) => set((e.target as HTMLInputElement).value) });
  }

  private colorRow(label: string, role: Role): HTMLElement {
    return h('div', { class: 'row' }, h('label', {}, label), this.colorInput(this.store.car.paint[role], (v) => this.store.update((c) => (c.paint[role] = v), 'paint', 'col-' + role)));
  }

  private finishRow(label: string, finishes: Record<string, string>, current: string, set: (name: string, hex: string) => void): HTMLElement {
    return h('div', {}, h('div', { class: 'sub' }, label),
      h('div', { class: 'chips' }, ...Object.entries(finishes).map(([name, hex]) =>
        h('button', { class: 'chip' + (current === name ? ' on' : ''), onclick: () => set(name, hex) }, h('i', { class: 'dot', style: `background:${hex}` }), cap(name)))));
  }

  private sliderRow(label: string, value: number, min: number, max: number, step: number, set: (v: number) => void): HTMLElement {
    const out = h('span', { class: 'val' }, String(value));
    return h('div', { class: 'row' }, h('label', {}, label),
      h('input', { type: 'range', min, max, step, value, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = String(v); set(v); } }), out);
  }

  private toggle(on: boolean, set: (v: boolean) => void): HTMLElement {
    return h('button', { class: 'toggle' + (on ? ' on' : ''), onclick: () => set(!on), 'aria-pressed': String(on) }, h('i'));
  }

  // ---------- parts / outliner ----------

  private partsPanel(): Node[] {
    const car = this.store.car;
    const sel = this.store.sel;
    const list = h('div', { class: 'outliner' });
    for (const p of car.parts) {
      const tris = buildPart(p).tris;
      const row = h('div', { class: 'opart' + (sel.partId === p.id && !sel.shapeId ? ' on' : '') },
        h('button', { class: 'eye' + (p.hidden ? ' off' : ''), title: p.hidden ? 'Show' : 'Hide', onclick: () => this.store.update((c) => { const q = c.parts.find((x) => x.id === p.id)!; q.hidden = !q.hidden; }) }, p.hidden ? '◌' : '●'),
        h('button', { class: 'lock' + (p.locked ? ' on' : ''), title: p.locked ? 'Unlock' : 'Lock', onclick: () => this.store.update((c) => { const q = c.parts.find((x) => x.id === p.id)!; q.locked = !q.locked; }) }, p.locked ? '🔒' : '🔓'),
        h('span', { class: 'pname', onclick: () => this.store.select({ partId: p.id, shapeId: null }) }, p.name),
        h('span', { class: 'tris' }, `${tris}`),
      );
      list.append(row);
      if (sel.partId === p.id) {
        for (const s of p.shapes) {
          list.append(h('div', { class: 'oshape' + (sel.shapeId === s.id ? ' on' : ''), onclick: () => this.store.select({ partId: p.id, shapeId: s.id }) },
            h('i', { class: 'dot', style: `background:${s.hole ? '#ff3355' : car.paint[s.role]}` }),
            `${s.name ?? SHAPE_LABELS[s.type]}${s.hole ? ' (hole)' : ''}${s.mirror ? ' ⇋' : ''}`));
        }
      }
    }
    const mine = loadMyParts();
    return [
      h('div', { class: 'row gap' },
        h('button', { class: 'tb', onclick: () => this.addCustomPart() }, '+ New custom part'),
      ),
      list,
      h('div', { class: 'sub' }, 'My saved parts'),
      mine.length
        ? h('div', { class: 'mylist' }, ...mine.map((m, i) => h('div', { class: 'myrow' },
          h('span', {}, `${m.name}`), h('small', {}, m.slot === 'custom' ? 'custom' : SLOT_NAMES[m.slot as SlotId] ?? m.slot),
          h('button', { class: 'link', onclick: () => this.store.update((c) => { const np = this.partFromSaved(m); c.parts.push(np); this.store.sel = { partId: np.id, shapeId: null }; }) }, 'Add'),
          h('button', { class: 'link danger', onclick: () => { const l = loadMyParts(); l.splice(i, 1); saveMyParts(l); this.renderLeft(); this.renderLeft(); } }, 'Remove'))))
        : h('p', { class: 'note' }, 'Select a part and press "Save as my part" to keep it here and in its slot.'),
    ];
  }

  private addCustomPart(): Part {
    const n = this.store.car.parts.filter((p) => p.slot === 'custom').length + 1;
    const part: Part = { id: uid('p'), name: `Custom_${n}`, slot: 'custom', variant: 'custom', pivot: [0, 0, 0], shapes: [] };
    this.store.update((c) => c.parts.push(part));
    this.store.select({ partId: part.id, shapeId: null });
    return part;
  }

  // ---------- viewport tools ----------

  private renderTools() {
    const tools = $('#tools');
    const sel = this.store.sel;
    const mode = this.vp.gizmoMode;
    const tb = (label: string, title: string, fn: () => void, on = false, disabled = false) => h('button', { class: 'tool' + (on ? ' on' : ''), title, onclick: fn, disabled }, label);
    tools.replaceChildren(
      h('div', { class: 'tgroup' }, h('span', { class: 'tlabel' }, 'Add'),
        ...SHAPE_TYPES.map((t) => tb(shapeIcon(t), `Add ${SHAPE_LABELS[t]}`, () => this.addShape(t)))),
      h('div', { class: 'tgroup' },
        tb('Move', 'Move (G)', () => this.setGizmo('translate'), mode === 'translate'),
        tb('Rotate', 'Rotate (R)', () => this.setGizmo('rotate'), mode === 'rotate'),
        tb('Scale', 'Scale (S)', () => this.setGizmo('scale'), mode === 'scale', !sel.shapeId),
      ),
      h('div', { class: 'tgroup' },
        tb('Snap ' + (this.vp.snap.on ? this.vp.snap.move : 'off'), 'Snap to grid (click to change step)', () => this.cycleSnap(), this.vp.snap.on),
        tb('Holes', 'Show hole (Negate) shapes', () => { this.showHoles = !this.showHoles; this.vp.setShowHoles(this.showHoles); this.renderTools(); }, this.showHoles),
        tb('Focus', 'Frame the selection (F)', () => this.vp.focusSelection()),
      ),
    );
  }
  private showHoles = false;

  private setGizmo(m: GizmoMode) {
    this.vp.setGizmo(m);
    this.renderTools();
  }

  private cycleSnap() {
    const steps = [0.05, 0.1, 0.25, 0.5, 1];
    const s = this.vp.snap;
    if (!s.on) { s.on = true; s.move = steps[0]; }
    else {
      const i = steps.indexOf(s.move);
      if (i === steps.length - 1) s.on = false;
      else s.move = steps[i + 1];
    }
    this.vp.applySnap();
    this.renderTools();
  }

  private addShape(type: ShapeType) {
    let part = this.store.part;
    if (!part || part.locked) part = this.store.car.parts.find((p) => p.slot === 'custom') ?? this.addCustomPart();
    const pid = part.id;
    const size: Vec3 = type === 'cylinder' || type === 'cone' ? [1, 1, 1] : type === 'tire' ? [2, 0.8, 2] : type === 'taperBox' ? [2, 1, 2] : [1, 1, 1];
    const world = this.vp.dropPoint(size[1]);
    const s: Shape = {
      id: uid('s'), type, pos: [world[0] - part.pivot[0], world[1] - part.pivot[1], world[2] - part.pivot[2]], rot: [0, 0, 0], size, role: 'paint',
      sides: type === 'sphere' ? 8 : type === 'tire' ? 12 : 10, mirror: false,
      ...(type === 'chamferBox' ? { chamfer: 0.2 } : {}), ...(type === 'taperBox' ? { taper: [0.7, 0.7, 0] as Vec3 } : {}), ...(type === 'cone' ? { taper: [0, 0, 0] as Vec3 } : {}), ...(type === 'tire' ? { inner: 0.6 } : {}),
    };
    this.store.update((c) => c.parts.find((p) => p.id === pid)!.shapes.push(s));
    this.store.select({ partId: pid, shapeId: s.id });
  }

  // ---------- inspector ----------

  renderInspector() {
    const ins = $('#inspector');
    const part = this.store.part, shape = this.store.shape;
    if (!part) {
      ins.replaceChildren(h('h3', {}, 'Nothing selected'),
        h('p', { class: 'note' }, 'Pick templates on the left, or click the car to select a part. Click the selected part again to edit one of its shapes.'),
        h('div', { class: 'keys' }, ...[
          ['Click', 'select part, then shape'], ['G / R / S', 'move, rotate, scale'], ['Ctrl+D', 'duplicate'], ['Del', 'delete'], ['M', 'mirror left/right'],
          ['N', 'hole (Negate)'], ['F', 'focus'], ['1 3 7 5', 'front, side, top, 3D'], ['Ctrl+Z / Y', 'undo / redo'],
        ].map(([k, v]) => h('div', {}, h('kbd', {}, k), v))));
      return;
    }
    const pid = part.id;
    const editPart = (fn: (p: Part) => void, co?: string) => this.store.update((c) => fn(c.parts.find((p) => p.id === pid)!), 'car', co);
    if (!shape) {
      ins.replaceChildren(
        h('h3', {}, 'Part'),
        this.textRow('Name', part.name, (v) => editPart((p) => (p.name = safeName(v)))),
        h('div', { class: 'kv' }, h('label', {}, 'Slot'), h('span', {}, part.slot === 'custom' ? 'Custom' : part.slot === 'wheel' ? 'Wheel' : SLOT_NAMES[part.slot])),
        part.slot === 'custom'
          ? h('div', { class: 'kv' }, h('label', {}, 'Game slot'), h('select', { onchange: (e: Event) => editPart((p) => { const v = (e.target as HTMLSelectElement).value; p.gameSlot = v ? v as GameCat : undefined; }) },
            h('option', { value: '', selected: !part.gameSlot }, 'Pick one…'),
            ...GAME_CATS.map((c) => h('option', { value: c, selected: part.gameSlot === c }, GAME_CAT_NAMES[c]))))
          : h('div', { class: 'kv' }, h('label', {}, 'In game'), h('span', {}, (() => { const c = gameCatOf(part); return c ? GAME_CAT_NAMES[c] : 'FBX only'; })())),
        this.vecRow('Pivot', part.pivot, 0.05, (v) => editPart((p) => (p.pivot = v), 'pivot')),
        h('p', { class: 'note' }, 'The pivot is the mount point. It becomes the mesh pivot in Roblox.'),
        h('div', { class: 'btns' },
          h('button', { class: 'tb', onclick: () => this.addShapeMenu() }, '+ Shape'),
          h('button', { class: 'tb', onclick: () => this.saveAsMine(part) }, 'Save as my part'),
          h('button', { class: 'tb', onclick: () => this.exportPart(part) }, 'Export this part'),
          h('button', { class: 'tb', onclick: () => this.duplicatePart() }, 'Duplicate'),
          h('button', { class: 'tb danger', onclick: () => this.deleteSelection() }, 'Delete part'),
        ),
        h('div', { class: 'sub' }, `Shapes (${part.shapes.length})`),
        h('div', { class: 'shapelist' }, ...part.shapes.map((s) => h('button', { class: 'chip', onclick: () => this.store.select({ partId: pid, shapeId: s.id }) },
          h('i', { class: 'dot', style: `background:${s.hole ? '#ff3355' : this.store.car.paint[s.role]}` }), s.name ?? SHAPE_LABELS[s.type]))),
      );
      return;
    }
    const sid = shape.id;
    const edit = (fn: (s: Shape) => void, co?: string) => editPart((p) => fn(p.shapes.find((s) => s.id === sid)!), co);
    const rows: Node[] = [
      h('h3', {}, 'Shape ', h('small', {}, `in ${part.name}`)),
      this.textRow('Name', shape.name ?? '', (v) => edit((s) => (s.name = v || undefined))),
      h('div', { class: 'kv' }, h('label', {}, 'Type'), h('select', { onchange: (e: Event) => edit((s) => (s.type = (e.target as HTMLSelectElement).value as ShapeType)) },
        ...SHAPE_TYPES.map((t) => h('option', { value: t, selected: t === shape.type }, SHAPE_LABELS[t])))),
      h('div', { class: 'kv' }, h('label', {}, 'Colour'), h('select', { onchange: (e: Event) => edit((s) => (s.role = (e.target as HTMLSelectElement).value as Role)) },
        ...ROLES.map((r) => h('option', { value: r, selected: r === shape.role }, ROLE_LABELS[r])))),
      this.vecRow('Position', shape.pos, 0.05, (v) => edit((s) => (s.pos = v), 'pos')),
      this.vecRow('Rotation', shape.rot, 5, (v) => edit((s) => (s.rot = v), 'rot')),
      this.vecRow('Size', shape.size, 0.05, (v) => edit((s) => (s.size = v.map((n) => Math.max(0.02, n)) as Vec3), 'size')),
    ];
    if (['cylinder', 'halfCylinder', 'cone', 'sphere', 'tire'].includes(shape.type)) rows.push(this.numRow('Sides', shape.sides ?? 8, 1, (v) => edit((s) => (s.sides = Math.round(Math.min(32, Math.max(3, v)))), 'sides')));
    if (shape.type === 'chamferBox') rows.push(this.numRow('Chamfer', shape.chamfer ?? 0.2, 0.05, (v) => edit((s) => (s.chamfer = Math.min(0.49, Math.max(0, v))), 'ch')));
    if (shape.type === 'taperBox') {
      const t = shape.taper ?? [0.8, 0.7, 0];
      rows.push(this.vecRow('Top W/L/shift', t, 0.05, (v) => edit((s) => (s.taper = v), 'taper'), ['W', 'L', '↕']));
    }
    if (shape.type === 'cone') rows.push(this.numRow('Top size', shape.taper?.[0] ?? 0, 0.05, (v) => edit((s) => (s.taper = [Math.min(1, Math.max(0, v)), 0, 0]), 'cone')));
    if (shape.type === 'tire') rows.push(this.numRow('Hole size', shape.inner ?? 0.6, 0.05, (v) => edit((s) => (s.inner = Math.min(0.95, Math.max(0.05, v))), 'inner')));
    rows.push(
      h('div', { class: 'checks' },
        h('label', {}, h('input', { type: 'checkbox', checked: !!shape.mirror, onchange: () => edit((s) => (s.mirror = !s.mirror)) }), 'Mirror left/right (M)'),
        h('label', {}, h('input', { type: 'checkbox', checked: !!shape.hole, onchange: () => edit((s) => (s.hole = !s.hole)) }), 'Hole / Negate (N)'),
        h('label', {}, h('input', { type: 'checkbox', checked: !!shape.hidden, onchange: () => edit((s) => (s.hidden = !s.hidden)) }), 'Hidden'),
      ),
      h('div', { class: 'btns' },
        h('button', { class: 'tb', onclick: () => this.duplicateShape() }, 'Duplicate'),
        h('button', { class: 'tb', onclick: () => edit((s) => { s.pos[1] = s.size[1] / 2 - part.pivot[1]; }) }, 'Drop to ground'),
        h('button', { class: 'tb', onclick: () => this.store.select({ partId: pid, shapeId: null }) }, 'Select part'),
        h('button', { class: 'tb danger', onclick: () => this.deleteSelection() }, 'Delete'),
      ),
    );
    ins.replaceChildren(...rows);
  }

  private addShapeMenu() {
    this.modal('Add a shape', h('div', { class: 'cards' }, ...SHAPE_TYPES.map((t) => h('button', { class: 'card', onclick: () => { this.closeModal(); this.addShape(t); } }, h('div', { class: 'thumb big' }, shapeIcon(t)), h('span', {}, SHAPE_LABELS[t])))));
  }

  private textRow(label: string, value: string, set: (v: string) => void): HTMLElement {
    return h('div', { class: 'kv' }, h('label', {}, label), h('input', { type: 'text', value, onchange: (e: Event) => set((e.target as HTMLInputElement).value) }));
  }

  private numRow(label: string, value: number, step: number, set: (v: number) => void): HTMLElement {
    return h('div', { class: 'kv' }, h('label', {}, label), h('input', { type: 'number', step, value: round3(value), onchange: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) set(v); } }));
  }

  private vecRow(label: string, v: Vec3, step: number, set: (v: Vec3) => void, axes = ['X', 'Y', 'Z']): HTMLElement {
    const inputs = v.map((n, i) => h('input', { type: 'number', step, value: round3(n), title: axes[i], onchange: () => {
      const vals = inputs.map((x) => Number(x.value)) as Vec3;
      if (vals.every(Number.isFinite)) set(vals);
    } }));
    return h('div', { class: 'kv vec' }, h('label', {}, label), h('div', { class: 'xyz' }, ...inputs.map((inp, i) => h('span', { class: 'ax ax' + i }, axes[i], inp))));
  }

  // ---------- editing commands ----------

  private duplicateShape() {
    const part = this.store.part, shape = this.store.shape;
    if (!part || !shape) return;
    const copy: Shape = { ...JSON.parse(JSON.stringify(shape)), id: uid('s') };
    const step = this.vp.snap.on ? Math.max(0.25, this.vp.snap.move) : 0.25;
    copy.pos = [copy.pos[0], copy.pos[1], copy.pos[2] + step * 2];
    this.store.update((c) => {
      const p = c.parts.find((x) => x.id === part.id)!;
      p.shapes.splice(p.shapes.findIndex((s) => s.id === shape.id) + 1, 0, copy);
    });
    this.store.select({ partId: part.id, shapeId: copy.id });
  }

  private duplicatePart() {
    const part = this.store.part;
    if (!part) return;
    const copy: Part = { ...JSON.parse(JSON.stringify(part)), id: uid('p'), name: part.name + '_Copy', slot: 'custom' };
    copy.shapes.forEach((s) => (s.id = uid('s')));
    this.store.update((c) => c.parts.push(copy));
    this.store.select({ partId: copy.id, shapeId: null });
  }

  private deleteSelection() {
    const part = this.store.part, shape = this.store.shape;
    if (!part) return;
    if (shape) this.store.update((c) => { const p = c.parts.find((x) => x.id === part.id)!; p.shapes = p.shapes.filter((s) => s.id !== shape.id); });
    else this.store.update((c) => (c.parts = c.parts.filter((p) => p.id !== part.id)));
  }

  private saveAsMine(part: Part) {
    this.modal('Save as my part',
      h('p', {}, 'Saved parts show up with a star in their slot, so you can put them on any car.'),
      h('div', { class: 'kv' }, h('label', {}, 'Name'), h('input', { id: 'mpname', type: 'text', value: part.name })),
      h('div', { class: 'btns' }, h('button', { class: 'tb primary', onclick: () => {
        const name = ($('#mpname') as HTMLInputElement).value || part.name;
        const list = loadMyParts();
        list.push({ name, slot: part.slot === 'wheel' ? 'custom' : part.slot, shapes: JSON.parse(JSON.stringify(part.shapes)) });
        saveMyParts(list);
        this.closeModal();
        this.renderLeft();
        this.toast(`Saved ${name}`);
      } }, 'Save')),
    );
  }

  // ---------- stats / Roblox check ----------

  private scheduleStats() {
    clearTimeout(this.statsTimer);
    this.statsTimer = window.setTimeout(() => this.renderStats(), 60);
  }

  private renderStats() {
    const car = this.store.car;
    const parts = visibleParts(car);
    const total = parts.reduce((a, p) => a + p.tris, 0);
    const meshes = parts.reduce((a, p) => a + p.meshes.length, 0);
    const pct = Math.min(100, (total / (CAR_TRI_TARGET * 2)) * 100);
    const level = total > CAR_TRI_TARGET * 2 ? 'bad' : total > CAR_TRI_TARGET ? 'mid' : 'good';
    const issues = robloxCheck(car, parts);
    const sel = this.store.part ? buildPart(this.store.part) : null;
    $('#stats').replaceChildren(...([
      h('h3', {}, 'Triangles'),
      h('div', { class: 'big' }, String(total), h('small', {}, ` / ${CAR_TRI_TARGET} target`)),
      h('div', { class: 'bar ' + level }, h('i', { style: `width:${pct}%` }), h('b', { style: `left:${50}%` })),
      h('div', { class: 'kv' }, h('label', {}, 'Parts'), h('span', {}, `${parts.length} (${meshes} meshes)`)),
      sel ? h('div', { class: 'kv' }, h('label', {}, sel.name), h('span', {}, `${sel.tris} tris`)) : null,
      h('h3', {}, 'Roblox check'),
      h('ul', { class: 'issues' }, ...issues.map((i) => h('li', { class: i.level }, i.text))),
    ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => !!x));
    $('#hint').textContent = `${total} triangles · ${parts.length} parts`;
  }

  // ---------- files ----------

  private newDialog() {
    this.modal('New car', h('p', {}, 'Pick a body to start from. Unsaved changes to the current car are lost.'),
      h('div', { class: 'cards' }, ...BASES.map((b) => this.card(b.name, false, `base:${b.id}`, 'three', () => newCar(b.id).parts, () => {
        this.closeModal();
        const c = newCar(b.id);
        this.store.load(c);
        this.vp.focusSelection();
      }))));
  }

  private async save() {
    const data = new TextEncoder().encode(JSON.stringify(this.store.car, null, 1));
    const where = await saveFile(`${safeName(this.store.car.name)}.lpcar`, data);
    if (where) { this.store.dirty = false; this.toast(`Saved to ${where}`); }
  }

  private async open() {
    const f = await openTextFile();
    if (!f) return;
    try {
      const car = JSON.parse(f.text) as Car;
      if (car.version !== 1 || !Array.isArray(car.parts)) throw new Error('not a car file');
      const fresh = newCar(car.base);
      // Fill in anything older files are missing.
      const merged: Car = { ...fresh, ...car, paint: { ...fresh.paint, ...car.paint }, effects: { ...fresh.effects, ...car.effects }, choices: { ...fresh.choices, ...car.choices } };
      this.store.load(merged);
      this.toast(`Opened ${f.name}`);
    } catch (e) {
      this.toast(`Could not open ${f.name}: ${(e as Error).message}`);
    }
  }

  private exportOpts = { game: true, parts: false, wholeCar: false, settings: true, recipes: false, whitePaint: false, scale: 1, price: 100, level: 1, currency: 'coins' as 'coins' | 'score' };
  private exportSkip = new Set<string>();
  private exportSeen = new Set<string>();

  private exportDialog() {
    const o = this.exportOpts;
    const car = this.store.car;
    const check = (key: keyof typeof o, label: string, help: string) =>
      h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked: !!o[key], onchange: (e: Event) => ((o as Record<string, unknown>)[key] = (e.target as HTMLInputElement).checked) }), h('b', {}, label), h('small', {}, help));
    const issues = robloxCheck(car, visibleParts(car));
    const game = customParts(car, car.parts.filter((p) => !p.hidden));
    // Stock template parts start unticked so they don't fill the shop; everything else starts ticked.
    for (const r of game) if (!this.exportSeen.has(r.part.id)) { this.exportSeen.add(r.part.id); if (r.part.variant === 'stock') this.exportSkip.add(r.part.id); }
    const num = (label: string, value: number, set: (v: number) => void, help = '') =>
      h('div', { class: 'kv' }, h('label', {}, label), h('input', { type: 'number', step: 1, min: 0, value, onchange: (e: Event) => set(Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0))) }), h('small', {}, help));
    const gameRows = game.map((r) => {
      const ok = !!r.data;
      const key = r.part.id;
      return h('label', { class: 'opt gamepart' + (ok ? '' : ' off') },
        h('input', { type: 'checkbox', disabled: !ok, checked: ok && !this.exportSkip.has(key), onchange: (e: Event) => ((e.target as HTMLInputElement).checked ? this.exportSkip.delete(key) : this.exportSkip.add(key)) }),
        h('b', {}, ok ? `${r.data!.name}` : r.part.name, h('small', {}, ok ? `  ${GAME_CAT_NAMES[r.data!.cat]} · ${r.data!.p.length} block${r.data!.p.length === 1 ? '' : 's'} · ${r.id}` : '')),
        r.notes.length ? h('small', {}, r.notes.join(' ')) : null);
    });
    this.modal('Export for Roblox',
      h('ul', { class: 'issues' }, ...issues.map((i) => h('li', { class: i.level }, i.text))),
      h('div', { class: 'sub' }, 'For your game'),
      check('game', 'Game parts (recommended)', '_CustomParts.lua: paste it into the Studio command bar. Each ticked part joins ReplicatedStorage.CustomParts and shows up in the Customs shop, fitted to every car.'),
      h('div', { class: 'gameparts' }, ...gameRows),
      h('div', { class: 'row3' },
        num('Price', o.price, (v) => (o.price = v)),
        h('div', { class: 'kv' }, h('label', {}, 'Currency'), h('select', { onchange: (e: Event) => (o.currency = (e.target as HTMLSelectElement).value as 'coins' | 'score') },
          ...(['coins', 'score'] as const).map((c) => h('option', { value: c, selected: o.currency === c }, c)))),
        num('Level', o.level, (v) => (o.level = Math.max(1, v)))),
      check('settings', 'Car settings', '_Settings.rbxmx and .json: rim, exhaust, colours, aura, underglow, boost and the effect attachments.'),
      h('div', { class: 'sub' }, 'Mesh files (optional)'),
      check('parts', 'One .fbx per part', 'Hood_Vented.fbx, WheelFL.fbx… Each keeps its mount point as pivot.'),
      check('wholeCar', 'Whole car .fbx', 'Every part in one file, grouped by part.'),
      check('recipes', 'WorkshopRecipe shape lists', '_Recipes.json: each part as adds/cuts of Blocks, Wedges and Cylinders in car space.'),
      check('whitePaint', 'White paint meshes', 'Write paint meshes white so you colour them in Roblox.'),
      h('div', { class: 'kv' }, h('label', {}, 'Scale'), h('input', { type: 'number', step: 0.1, value: o.scale, onchange: (e: Event) => (o.scale = Number((e.target as HTMLInputElement).value) || 1) }), h('small', {}, '1 = 1 stud')),
      h('div', { class: 'btns' }, h('button', { class: 'tb primary', onclick: async () => {
        const choice: ExportChoice = {
          game: o.game, skip: [...this.exportSkip], shop: { price: o.price, currency: o.currency, level: Math.max(1, o.level) },
          parts: o.parts, wholeCar: o.wholeCar, settings: o.settings, recipes: o.recipes,
        };
        const files = exportFiles(car, choice, { scale: o.scale, whitePaint: o.whitePaint });
        if (!files.length) return this.toast('Nothing selected to export');
        this.closeModal();
        const where = await saveFiles(safeName(car.name), files);
        if (where) this.toast(`Exported ${files.length} files to ${where}`);
      } }, 'Export')),
    );
  }

  private async exportPart(part: Part) {
    const o = this.exportOpts;
    const game = !!customPart(this.store.car, part).data;
    const files = exportFiles(this.store.car, { game, shop: { price: o.price, currency: o.currency, level: Math.max(1, o.level) }, parts: !game, wholeCar: false, settings: false, recipes: false },
      { scale: o.scale, whitePaint: o.whitePaint }, part);
    if (!files.length) return this.toast('Nothing to export in this part');
    const where = files.length === 1 ? await saveFile(files[0].name, files[0].data) : await saveFiles(safeName(part.name), files);
    if (where) this.toast(game ? `Exported ${files[0].name}: paste it into the Studio command bar` : `Exported ${files[0].name}`);
  }

  // ---------- modal / toast ----------

  private modal(title: string, ...kids: Node[]) {
    const m = $('#modal');
    m.replaceChildren(h('div', { class: 'dialog' }, h('div', { class: 'dhead' }, h('h2', {}, title), h('button', { class: 'x', onclick: () => this.closeModal() }, '×')), ...kids));
    m.classList.add('show');
    m.onclick = (e) => e.target === m && this.closeModal();
  }
  private closeModal() {
    $('#modal').classList.remove('show');
  }
  toast(msg: string) {
    const t = h('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- keyboard ----------

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); this.store.undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); this.store.redo(); return; }
      if (ctrl && k === 's') { e.preventDefault(); this.save(); return; }
      if (ctrl && k === 'o') { e.preventDefault(); this.open(); return; }
      if (ctrl && k === 'e') { e.preventDefault(); this.exportDialog(); return; }
      if (ctrl && k === 'd') { e.preventDefault(); this.store.shape ? this.duplicateShape() : this.duplicatePart(); return; }
      if (ctrl && k === 'c' && this.store.shape) { this.clipboard = JSON.parse(JSON.stringify(this.store.shape)); return; }
      if (ctrl && k === 'v' && this.clipboard && this.store.part) {
        const s = { ...JSON.parse(JSON.stringify(this.clipboard)), id: uid('s') } as Shape;
        const pid = this.store.part.id;
        this.store.update((c) => c.parts.find((p) => p.id === pid)!.shapes.push(s));
        this.store.select({ partId: pid, shapeId: s.id });
        return;
      }
      if (ctrl) return;
      if (k === 'g') this.setGizmo('translate');
      else if (k === 'r') this.setGizmo('rotate');
      else if (k === 's' && this.store.shape) this.setGizmo('scale');
      else if (k === 'delete' || k === 'x' || k === 'backspace') this.deleteSelection();
      else if (k === 'escape') this.store.select({ partId: null, shapeId: null });
      else if (k === 'f') this.vp.focusSelection();
      else if (k === 'm' && this.store.shape) this.toggleShape('mirror');
      else if (k === 'n' && this.store.shape) this.toggleShape('hole');
      else if (k === 'h' && this.store.part) { const id = this.store.part.id; this.store.update((c) => { const p = c.parts.find((x) => x.id === id)!; p.hidden = !p.hidden; }); }
      else if (k === '1') this.vp.setView(e.shiftKey ? 'back' : 'front');
      else if (k === '3') this.vp.setView('side');
      else if (k === '7') this.vp.setView('top');
      else if (k === '5' || k === '0') this.vp.setView('persp');
      else return;
      this.renderTopState();
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.store.dirty) e.preventDefault();
    });
  }

  private toggleShape(key: 'mirror' | 'hole') {
    const part = this.store.part, shape = this.store.shape;
    if (!part || !shape) return;
    this.store.update((c) => { const s = c.parts.find((p) => p.id === part.id)!.shapes.find((x) => x.id === shape.id)!; s[key] = !s[key]; });
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function shapeIcon(t: ShapeType): string {
  return { box: '■', wedge: '◢', cornerWedge: '◣', chamferBox: '⬣', taperBox: '⏢', cylinder: '⬤', halfCylinder: '◓', cone: '▲', sphere: '●', tire: '◎' }[t];
}
