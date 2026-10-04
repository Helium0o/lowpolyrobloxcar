import type { Actions } from '../app/actions';
import { isEditable } from '../app/actions';
import { saveToLibrary } from '../app/library';
import type { Store } from '../app/store';
import { generator, type ParamDef } from '../core/gen';
import { profileFromSliders } from '../core/gen/body';
import { isUnion, partShapes } from '../core/resolve';
import { COLOR_SLOT_LABELS, COLOR_SLOTS, KIND_LABELS, KINDS, SLOT_INFO, SLOTS, uid, type Car, type ColorSlot, type Kind, type Params, type Part, type RefImage, type Shape, type V3 } from '../core/types';
import { btn, checkField, colorInput, h, numberField, section, selectField, textField, toast, vecField } from './dom';
import { profileEditor } from './profile';

// The right-hand panel. What it shows follows the selection:
// nothing -> car settings, a part -> its sliders and transform, shapes -> their exact numbers.

export const MATERIAL_NAMES = ['SmoothPlastic', 'Plastic', 'Neon', 'Glass', 'Metal', 'DiamondPlate', 'Foil', 'Fabric', 'Wood', 'Concrete', 'Brick', 'Marble', 'Granite', 'Slate', 'Ice', 'ForceField'];

export const GAME_ROLES: [string, string][] = [
  ['', 'Automatic'], ['paint', 'Car paint'], ['black', 'Black'], ['gloss', 'Gloss black'], ['carbon', 'Carbon'], ['mesh', 'Mesh grille'],
  ['chrome', 'Chrome'], ['housing', 'Lamp housing'], ['head', 'Headlight (glows)'], ['fog', 'Fog light'], ['amber', 'Indicator'],
  ['lens', 'Clear lens'], ['smoke', 'Smoked lens'], ['tail', 'Taillight (glows)'], ['taildark', 'Dark taillight'], ['reverse', 'Reverse light'],
  ['reflector', 'Reflector'], ['outlet', 'Exhaust outlet (flames)'], ['pink', 'Pink'], ['mint', 'Mint'], ['lav', 'Lavender'], ['sky', 'Sky'],
  ['yellow', 'Yellow'], ['red', 'Red'], ['face', 'Rim face'], ['lip', 'Rim lip / tip lip'], ['barrel', 'Rim barrel'], ['body', 'Tip body'], ['soot', 'Tip soot'],
  ['custom', 'Exact colour'],
];

export class Properties {
  constructor(private root: HTMLElement, private store: Store, private actions: Actions, private hooks: { refsChanged(): void; previewPreset(part: Part | null, params: Params | null): void; drop(): void }) {}

  render() {
    const st = this.store;
    const scroll = this.root.scrollTop;
    let body: HTMLElement[];
    if (st.sel.shapes.length) body = this.shapePanel(st.selectedShapes());
    else if (st.sel.parts.length === 1) body = this.partPanel(st.selectedParts()[0]);
    else if (st.sel.parts.length > 1) body = this.multiPartPanel(st.selectedParts());
    else body = this.carPanel(st.car);
    this.root.replaceChildren(...body);
    this.root.scrollTop = scroll;
  }

  // ---------- car ----------

  private carPanel(car: Car): HTMLElement[] {
    const st = this.store;
    const P = car.params;
    const numP = (key: keyof Car['params'], label: string, min: number, max: number, step = 0.05) =>
      numberField(label, P[key], {
        min, max, step, slider: true,
        start: () => st.begin(`Car ${label.toLowerCase()}`),
        live: (v) => st.live((c) => { c.params[key] = v; }),
        done: (v) => { st.live((c) => { c.params[key] = v; }); st.commit(); },
      });
    const colours = h('div', { class: 'swatches' }, COLOR_SLOTS.map((k: ColorSlot) =>
      h('label', { class: 'swatch' }, colorInput(car.colors[k], (v) => { st.begin('Colour'); st.live((c) => { c.colors[k] = v; }, false); }, (v) => { st.live((c) => { c.colors[k] = v; }, false); st.commit(); }), h('span', {}, COLOR_SLOT_LABELS[k])),
    ));
    const g = car.game;
    const setG = (k: keyof Car['game'], v: string | number) => st.change('Game settings', (c) => { (c.game as unknown as Record<string, string | number>)[k] = v; });
    return [
      h('div', { class: 'panel-title' }, h('h3', {}, 'Car'), h('span', { class: 'sub' }, 'Nothing selected. Click a part to change it.')),
      section('Name', [textField('Car name', car.name, (v) => st.change('Rename car', (c) => { c.name = v; c.game.carName = v; }))], { key: 'carname' }),
      section('Size', [
        numP('length', 'Length', 10, 24), numP('width', 'Width', 4, 9), numP('floor', 'Ride height', 0.1, 1.5, 0.01),
        numP('belt', 'Window line', 1.5, 5), numP('roof', 'Roof height', 2.5, 7),
        h('p', { class: 'hint' }, 'Everything made with sliders follows these sizes. Your game\'s cars are about 6 to 7.4 wide and 14.5 to 18 long.'),
      ], { key: 'size' }),
      section('Wheels', [
        numP('wheelbase', 'Wheelbase', 5, 14), numP('axleOffset', 'Front axle position', -8, -1),
        numP('trackF', 'Front track (half)', 1.5, 4, 0.01), numP('trackR', 'Rear track (half)', 1.5, 4, 0.01),
        numP('wheelRadius', 'Wheel radius', 0.6, 2, 0.01), numP('wheelWidthF', 'Front tyre width', 0.4, 2, 0.01), numP('wheelWidthR', 'Rear tyre width', 0.4, 2, 0.01),
      ], { key: 'wheels' }),
      section('Colours', [colours, h('p', { class: 'hint' }, 'Shapes set to a colour slot follow it. "Paint" exports as the game\'s paint role, so players can repaint those shapes.')], { key: 'colours' }),
      section('Game settings', [
        selectField('Drivetrain', g.drivetrain, [['RWD', 'Rear wheel drive'], ['FWD', 'Front wheel drive'], ['AWD', 'All wheel drive']], (v) => setG('drivetrain', v)),
        numberField('Mass (kg)', g.massKg, { min: 400, max: 5000, step: 10, done: (v) => setG('massKg', v) }),
        textField('Handling profile', g.handling, (v) => setG('handling', v)),
        selectField('Stock rim style', g.rimStyle, ['star5', 'mono6', 'octane8', 'twin7', 'split5', 'needle', 'yspoke', 'fuchs', 'rallye', 'turbine', 'twist', 'aero', 'deepdish', 'centrelock', 'mesh'].map((x) => [x, x]), (v) => setG('rimStyle', v)),
        selectField('Rim finish', g.rimFinish, ['chrome', 'silver', 'gunmetal', 'black', 'gold', 'bronze', 'magnesium', 'pink', 'mint', 'lavender', 'white', 'orange'].map((x) => [x, x]), (v) => setG('rimFinish', v)),
        selectField('Exhaust layout', g.exhaustLayout, ['single', 'dual', 'dualSide', 'quad', 'centerDual', 'centerQuad', 'sideExit'].map((x) => [x, x]), (v) => setG('exhaustLayout', v)),
        selectField('Exhaust tip', g.exhaustShape, ['round', 'doublewall', 'bigbore', 'oval', 'square', 'trapezoid'].map((x) => [x, x]), (v) => setG('exhaustShape', v)),
        selectField('Exhaust finish', g.exhaustFinish, ['steel', 'chrome', 'titanium', 'black', 'carbon', 'gold', 'pink', 'mint', 'lavender', 'blue'].map((x) => [x, x]), (v) => setG('exhaustFinish', v)),
        textField('Underglow (hex or empty)', g.underglow, (v) => setG('underglow', v)),
        textField('Boost trail (hex, two hex or rainbow)', g.boostTrail, (v) => setG('boostTrail', v)),
        textField('Aura id', g.aura, (v) => setG('aura', v)),
        textField('Headlight colour (hex)', g.headlightColor, (v) => setG('headlightColor', v)),
        textField('Window tint (hex)', g.windowTint, (v) => setG('windowTint', v)),
        h('p', { class: 'hint' }, 'Only used when you export a drivable car or the settings file. The game does all the driving itself.'),
      ], { open: false, key: 'game' }),
      section('Reference images', this.refsPanel(car), { open: false, key: 'refs' }),
    ];
  }

  private refsPanel(car: Car): HTMLElement[] {
    const st = this.store;
    const refs = car.refs ?? [];
    const add = (view: RefImage['view']) => {
      const input = h('input', { type: 'file', accept: 'image/*' });
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          st.change('Add reference image', (c) => {
            c.refs = [...(c.refs ?? []), { id: uid('r'), view, dataUrl: String(r.result), width: view === 'side' || view === 'top' ? c.params.length + 1 : c.params.width + 1, offset: [0, 0], opacity: 0.6, visible: true }];
          });
          this.hooks.refsChanged();
          toast(`Added. Switch to the ${view} view to line it up.`);
        };
        r.readAsDataURL(f);
      };
      input.click();
    };
    const rows = refs.map((r) => {
      const set = (fn: (x: RefImage) => void) => { st.change('Reference image', (c) => { const x = c.refs?.find((y) => y.id === r.id); if (x) fn(x); }); this.hooks.refsChanged(); };
      return h('div', { class: 'ref' },
        h('div', { class: 'ref-head' }, h('img', { src: r.dataUrl }), h('b', {}, r.view), btn('', () => set((x) => { x.visible = !x.visible; }), { icon: r.visible ? 'eye' : 'eyeOff', class: 'icon', title: 'Show / hide' }), btn('', () => { st.change('Remove reference image', (c) => { c.refs = c.refs?.filter((y) => y.id !== r.id); }); this.hooks.refsChanged(); }, { icon: 'trash', class: 'icon', title: 'Remove' })),
        numberField('Width (studs)', r.width, { min: 1, max: 60, step: 0.1, done: (v) => set((x) => { x.width = v; }) }),
        numberField('Move along', r.offset[0], { step: 0.05, done: (v) => set((x) => { x.offset[0] = v; }) }),
        numberField('Move up', r.offset[1], { step: 0.05, done: (v) => set((x) => { x.offset[1] = v; }) }),
        numberField('Opacity', r.opacity, { min: 0.05, max: 1, step: 0.05, slider: true, done: (v) => set((x) => { x.opacity = v; }) }),
      );
    });
    return [
      h('p', { class: 'hint' }, 'Put a photo or drawing behind the car to copy its shape. Tip: set its width so the wheels line up with yours.'),
      h('div', { class: 'row-btns' }, (['side', 'front', 'back', 'top'] as const).map((v) => btn(`Add ${v}`, () => add(v), { icon: 'image' }))),
      ...rows,
    ];
  }

  // ---------- part ----------

  private partPanel(part: Part): HTMLElement[] {
    const st = this.store;
    const car = st.car;
    const out: HTMLElement[] = [];
    const g = part.gen && generator(part.gen.type);
    const src = part.link ? st.part(part.link) : undefined;
    out.push(h('div', { class: 'panel-title' },
      h('h3', {}, part.name),
      h('span', { class: 'sub' }, `${SLOT_INFO[part.slot]?.label ?? part.slot}${g ? ' · made with sliders' : ''}${src ? ` · linked to ${src.name}` : ''}`),
    ));
    out.push(h('div', { class: 'row-btns' },
      btn('Edit shapes', () => this.store.select({ focus: part.id, parts: [], shapes: [] }), { icon: 'select', title: 'Double-click the part does this too' }),
      btn('Duplicate', () => this.actions.duplicateParts([part.id]), { icon: 'copy' }),
      btn('Mirror copy', () => this.actions.mirrorParts([part.id]), { icon: 'mirror', title: 'A separate copy on the other side of the car' }),
      btn('Linked copy', () => this.actions.duplicateParts([part.id], true), { icon: 'link', title: 'A copy that always matches this part' }),
      btn('Save to My parts', () => { saveToLibrary(car, part); toast(`Saved ${part.name} to My parts (Add tab).`); }, { icon: 'star' }),
      btn('Delete', () => this.actions.deleteSelection(), { icon: 'trash', class: 'danger' }),
    ));
    if (src) out.push(h('div', { class: 'note' }, `This is a linked copy of ${src.name}: it always looks the same. `, btn('Make it separate', () => this.actions.makeUnique(part), { class: 'small' }), btn(`Select ${src.name}`, () => st.select({ parts: [src.id], shapes: [] }), { class: 'small' })));

    if (g && part.gen) {
      const params = { ...g.defaults(car), ...part.gen.params };
      if (g.presets?.length) {
        out.push(section('Designs', [h('div', { class: 'chips' }, g.presets.map((pr) => {
          const b = btn(pr.name, () => { this.hooks.previewPreset(null, null); this.actions.applyPreset(part, pr.params, pr.name); }, { class: 'chip' });
          b.addEventListener('mouseenter', () => this.hooks.previewPreset(part, { ...g.defaults(car), ...pr.params }));
          b.addEventListener('mouseleave', () => this.hooks.previewPreset(null, null));
          return b;
        })), h('p', { class: 'hint' }, 'Hover to preview, click to use. Then fine-tune with the sliders below.')], { key: 'designs' }));
      }
      out.push(section(g.label, this.paramFields(part, g.defs, params), { key: 'params' }));
      out.push(h('div', { class: 'note' }, 'Made with sliders. To move single shapes by hand, ', btn('Edit shapes by hand', () => this.actions.convertToShapes(part), { class: 'small', icon: 'split' }), ' (the sliders go away; Undo brings them back).'));
    }

    const fields: HTMLElement[] = [textField('Name', part.name, (v) => st.change('Rename part', (c) => { const p = c.parts.find((x) => x.id === part.id); if (p) p.name = v.trim() || p.name; }))];
    fields.push(selectField('Slot', part.slot, SLOTS.map((s) => [s, `${SLOT_INFO[s].group}: ${SLOT_INFO[s].label}`]), (v) => st.change('Change slot', (c) => { const p = c.parts.find((x) => x.id === part.id); if (p) p.slot = v as Part['slot']; })));
    if (!part.wheel) {
      const live = (fn: (p: Part) => void) => st.live((c) => { const p = c.parts.find((x) => x.id === part.id); if (p) fn(p); });
      fields.push(vecField('Move', part.pos, { step: 0.05, start: () => st.begin('Move part'), live: (v) => live((p) => { p.pos = v; }), done: (v) => { live((p) => { p.pos = v; }); st.commit(); } }));
      fields.push(vecField('Turn (degrees)', part.rot, { step: 1, start: () => st.begin('Turn part'), live: (v) => live((p) => { p.rot = v; }), done: (v) => { live((p) => { p.rot = v; }); st.commit(); } }));
    } else fields.push(h('p', { class: 'hint' }, 'Wheels sit on the axles: set the wheelbase, track and size in Car settings (click empty space).'));
    const shapes = partShapes(car, part);
    fields.push(checkField('Export as one Union', isUnion(car, part), (v) => st.change(v ? 'Union on' : 'Union off', (c) => { const p = c.parts.find((x) => x.id === part.id); if (p) { if (v) p.union = true; else delete p.union; } }), 'Roblox merges the shapes into one UnionOperation. Always on when the part has cut shapes.'));
    fields.push(checkField('Leave out of exports', !!part.noExport, (v) => this.actions.setPartFlag([part.id], 'noExport', v)));
    fields.push(h('p', { class: 'hint' }, `${shapes.length} shapes${shapes.some((s) => s.cut) ? `, ${shapes.filter((s) => s.cut).length} of them cut` : ''}.`));
    out.push(section('Part', fields, { key: 'part' }));
    return out;
  }

  private paramFields(part: Part, defs: ParamDef[], params: Params): HTMLElement[] {
    const st = this.store;
    const car = st.car;
    const setLive = (key: string, v: Params[string]) => st.live((c) => { const p = c.parts.find((x) => x.id === part.id); if (p?.gen) p.gen.params[key] = v; });
    const out: HTMLElement[] = [];
    for (const d of defs) {
      if (d.when && !d.when(params)) continue;
      const v = params[d.key];
      if (d.type === 'number') {
        out.push(numberField(d.label, typeof v === 'number' ? v : 0, {
          min: d.min, max: d.max, step: d.step, slider: true,
          start: () => st.begin(`${part.name}: ${d.label.toLowerCase()}`),
          live: (x) => setLive(d.key, x),
          done: (x) => { setLive(d.key, x); st.commit(); },
        }));
      } else if (d.type === 'select') {
        out.push(selectField(d.label, String(v ?? ''), d.options ?? [], (x) => st.change(`${part.name}: ${d.label.toLowerCase()}`, (c) => {
          const p = c.parts.find((y) => y.id === part.id);
          if (!p?.gen) return;
          p.gen.params[d.key] = x;
          if (d.key === 'mode' && x === 'points' && !Array.isArray(p.gen.params.profile)) p.gen.params.profile = profileFromSliders(c);
        })));
      } else if (d.type === 'bool') {
        out.push(checkField(d.label, !!v, (x) => st.change(`${part.name}: ${d.label.toLowerCase()}`, (c) => { const p = c.parts.find((y) => y.id === part.id); if (p?.gen) p.gen.params[d.key] = x; })));
      } else if (d.type === 'profile') {
        const pts = Array.isArray(v) ? (v as number[][]) : profileFromSliders(car);
        out.push(profileEditor(car, pts, {
          start: () => st.begin('Shape the side'),
          live: (p) => setLive(d.key, p),
          done: (p) => { setLive(d.key, p); st.commit(); },
        }));
      }
      if (d.hint) out.push(h('p', { class: 'hint' }, d.hint));
    }
    return out;
  }

  private multiPartPanel(parts: Part[]): HTMLElement[] {
    const ids = parts.map((p) => p.id);
    return [
      h('div', { class: 'panel-title' }, h('h3', {}, `${parts.length} parts`), h('span', { class: 'sub' }, parts.map((p) => p.name).join(', '))),
      h('div', { class: 'row-btns' },
        btn('Duplicate', () => this.actions.duplicateParts(ids), { icon: 'copy' }),
        btn('Mirror copy', () => this.actions.mirrorParts(ids), { icon: 'mirror' }),
        btn('Hide', () => this.actions.setPartFlag(ids, 'hidden', true), { icon: 'eyeOff' }),
        btn('Hide the rest', () => this.actions.isolate(ids), { icon: 'eye' }),
        btn('Delete', () => this.actions.deleteSelection(), { icon: 'trash', class: 'danger' }),
      ),
      section('Line up', this.alignButtons(), { key: 'align' }),
    ];
  }

  private alignButtons(): HTMLElement[] {
    const a = this.actions;
    const axes = ['X (across)', 'Y (up)', 'Z (along)'];
    return axes.map((label, i) => h('div', { class: 'align-row' }, h('span', {}, label),
      btn(i === 1 ? 'Bottom' : i === 0 ? 'Left' : 'Front', () => a.align(i as 0 | 1 | 2, 'min'), { class: 'small' }),
      btn('Middle', () => a.align(i as 0 | 1 | 2, 'mid'), { class: 'small' }),
      btn(i === 1 ? 'Top' : i === 0 ? 'Right' : 'Back', () => a.align(i as 0 | 1 | 2, 'max'), { class: 'small' }),
    ));
  }

  // ---------- shapes ----------

  private shapePanel(list: { part: Part; shape: Shape }[]): HTMLElement[] {
    const st = this.store;
    const a = this.actions;
    const editable = list.every((x) => isEditable(x.part));
    const s0 = list[0].shape;
    const many = list.length > 1;
    const out: HTMLElement[] = [];
    out.push(h('div', { class: 'panel-title' }, h('h3', {}, many ? `${list.length} shapes` : s0.name), h('span', { class: 'sub' }, `${many ? 'several' : KIND_LABELS[s0.kind]} in ${list[0].part.name}`)));
    if (!editable) {
      const part = list[0].part;
      out.push(h('div', { class: 'note' }, part.link ? 'This shape belongs to a linked copy. ' : 'This shape is made by the part\'s sliders. ',
        btn(part.link ? 'Make it separate' : 'Edit shapes by hand', () => part.link ? a.makeUnique(part) : a.convertToShapes(part), { class: 'small', icon: 'split' }),
        btn('Back to the part', () => st.select({ parts: [part.link ?? part.id], shapes: [], focus: null }), { class: 'small' })));
      out.push(h('pre', { class: 'readonly' }, `Size ${s0.size.join(' × ')}\nPosition ${s0.pos.join(', ')}\nTurn ${s0.rot.join(', ')}`));
      return out;
    }
    out.push(h('div', { class: 'row-btns' },
      btn('Duplicate', () => a.duplicateShapes(), { icon: 'copy', title: 'Ctrl+D' }),
      btn(list.every((x) => x.shape.mirror) ? 'Mirror: on' : 'Mirror: off', () => a.mirrorShapes(true), { icon: 'mirror', title: 'Linked copy on the other side (M)', class: list.every((x) => x.shape.mirror) ? 'on' : '' }),
      btn('Mirror copy', () => a.mirrorShapes(false), { icon: 'mirror', title: 'A separate copy on the other side' }),
      btn(list.every((x) => x.shape.cut) ? 'Cut: on' : 'Cut: off', () => { const on = !list.every((x) => x.shape.cut); a.patchShapes(on ? 'Make cut' : 'Make solid', (s) => { if (on) { s.cut = true; } else delete s.cut; }); }, { icon: 'cut', title: 'Cut shapes carve away the rest of the part (Roblox Negate)', class: list.every((x) => x.shape.cut) ? 'on' : '' }),
      btn('Drop down', () => this.hooks.drop(), { icon: 'drop', title: 'Move down until it sits on the car' }),
      btn('New part', () => a.groupShapes(), { icon: 'group', title: 'Move these shapes into a new part of their own' }),
      btn('Delete', () => a.deleteSelection(), { icon: 'trash', class: 'danger' }),
    ));
    if (list.some((x) => (x.shape.repeat?.count ?? 1) > 1 || x.shape.mirror)) out.push(h('div', { class: 'row-btns' }, btn('Split copies into shapes', () => a.bakeShapes(), { icon: 'split', class: 'small', title: 'Turn the mirror and repeat copies into real shapes you can move one by one' })));

    const live = (fn: (s: Shape) => void) => st.live((c) => { for (const { part, shape } of list) { const s = c.parts.find((p) => p.id === part.id)?.shapes.find((x) => x.id === shape.id); if (s) fn(s); } });
    const vec = (label: string, key: 'size' | 'pos' | 'rot', step: number, min?: number) => vecField(label, s0[key], {
      step, min,
      start: () => st.begin(`Shape ${label.toLowerCase()}`),
      live: (v) => live((s) => { s[key] = v; }),
      done: (v) => { live((s) => { s[key] = v; }); st.commit(); },
    });
    const kindSel = selectField('Shape', s0.kind, KINDS.map((k: Kind) => [k, KIND_LABELS[k]]), (v) => a.patchShapes('Change shape', (s) => { s.kind = v as Kind; }));
    const geo: HTMLElement[] = [
      textField('Name', many ? '' : s0.name, (v) => v.trim() && a.patchShapes('Rename', (s) => { s.name = v.trim(); })),
      kindSel,
    ];
    if (!many) {
      geo.push(vec('Size', 'size', 0.05, 0.05), vec('Position', 'pos', 0.05), vec('Turn (degrees)', 'rot', 5));
      if (s0.kind === 'cylinder') geo.push(h('p', { class: 'hint' }, 'Cylinders run along X like in Roblox. The diameter is the smaller of Y and Z.'));
      if (s0.kind === 'ball') geo.push(h('p', { class: 'hint' }, 'A Roblox ball uses the smallest of its three sizes.'));
    }
    out.push(section('Shape', geo, { key: 'shape' }));

    // look
    const colourSel = selectField('Colour', s0.color.startsWith('@') ? s0.color : 'custom', [...COLOR_SLOTS.map((k): [string, string] => [`@${k}`, `Slot: ${COLOR_SLOT_LABELS[k]}`]), ['custom', 'Exact colour']], (v) => {
      if (v !== 'custom') a.patchShapes('Colour', (s) => { s.color = v; });
      else a.patchShapes('Colour', (s) => { if (s.color.startsWith('@')) s.color = st.car.colors[s.color.slice(1) as ColorSlot]; });
    });
    const look: HTMLElement[] = [colourSel];
    if (!s0.color.startsWith('@')) look.push(h('div', { class: 'field' }, h('label', {}, 'Exact colour'), colorInput(s0.color, (v) => { st.begin('Colour'); live((s) => { s.color = v; }); }, (v) => { live((s) => { s.color = v; }); st.commit(); })));
    look.push(selectField('Material', s0.material, MATERIAL_NAMES.map((m) => [m, m]), (v) => a.patchShapes('Material', (s) => { s.material = v; })));
    look.push(numberField('Transparency', s0.transparency ?? 0, { min: 0, max: 1, step: 0.05, slider: true, start: () => st.begin('Transparency'), live: (v) => live((s) => { s.transparency = v || undefined; }), done: (v) => { live((s) => { s.transparency = v || undefined; }); st.commit(); } }));
    look.push(numberField('Reflectance', s0.reflectance ?? 0, { min: 0, max: 1, step: 0.05, slider: true, start: () => st.begin('Reflectance'), live: (v) => live((s) => { s.reflectance = v || undefined; }), done: (v) => { live((s) => { s.reflectance = v || undefined; }); st.commit(); } }));
    look.push(selectField('Game role', s0.role ?? '', GAME_ROLES, (v) => a.patchShapes('Game role', (s) => { if (v) s.role = v; else delete s.role; })));
    look.push(h('p', { class: 'hint' }, 'Game role is how this shape looks in your game\'s shop parts. Automatic works it out from the colour, material and name (a Neon "Headlight" glows).'));
    out.push(section('Look', look, { key: 'look' }));

    // repeat
    const r = s0.repeat ?? { count: 1, offset: [0, 0, 0] as V3, rotate: [0, 0, 0] as V3 };
    const setR = (fn: (x: NonNullable<Shape['repeat']>) => void, final: boolean) => {
      const f = (s: Shape) => { const x = s.repeat ? { ...s.repeat, offset: [...s.repeat.offset] as V3, rotate: [...s.repeat.rotate] as V3 } : { count: 1, offset: [0, 0, 0] as V3, rotate: [0, 0, 0] as V3 }; fn(x); s.repeat = x.count > 1 ? x : undefined; };
      live(f);
      if (final) st.commit();
    };
    out.push(section('Repeat', [
      numberField('Copies', r.count, { min: 1, max: 64, step: 1, digits: 0, slider: true, start: () => st.begin('Repeat'), live: (v) => setR((x) => { x.count = Math.round(v); }, false), done: (v) => setR((x) => { x.count = Math.round(v); }, true) }),
      vecField('Step', r.offset, { step: 0.05, start: () => st.begin('Repeat step'), live: (v) => setR((x) => { x.offset = v; }, false), done: (v) => setR((x) => { x.offset = v; }, true) }),
      vecField('Turn each (degrees)', r.rotate, { step: 5, start: () => st.begin('Repeat turn'), live: (v) => setR((x) => { x.rotate = v; }, false), done: (v) => setR((x) => { x.rotate = v; }, true) }),
      h('div', { class: 'row-btns' },
        btn('Ring of 5', () => { st.begin('Radial repeat'); setR((x) => { x.count = 5; x.offset = [0, 0, 0]; x.rotate = [72, 0, 0]; }, true); }, { class: 'small', title: 'Five copies round the X axis (rim spokes)' }),
        btn('Ring of 8', () => { st.begin('Radial repeat'); setR((x) => { x.count = 8; x.offset = [0, 0, 0]; x.rotate = [45, 0, 0]; }, true); }, { class: 'small' }),
        btn('Row of 4', () => { st.begin('Repeat in a row'); setR((x) => { x.count = 4; x.offset = [Math.max(0.1, s0.size[0] * 1.5), 0, 0]; x.rotate = [0, 0, 0]; }, true); }, { class: 'small', title: 'Grille slats, vents' }),
      ),
      h('p', { class: 'hint' }, 'Copies turn round the part\'s origin. For a rim, the origin is the wheel centre.'),
    ], { open: !!s0.repeat, key: 'repeat' }));
    if (many) out.push(section('Line up', this.alignButtons(), { key: 'align' }));
    return out;
  }
}

export type { RefImage };
