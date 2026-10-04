import type { Actions } from '../app/actions';
import type { Store } from '../app/store';
import { isUnion, partShapes } from '../core/resolve';
import { SLOT_INFO, type Part } from '../core/types';
import { h, icon } from './dom';

// The parts tree: Car > groups (Body, Body kit, Lights ...) > parts > shapes.
// Click to select, shift / ctrl click to add, double-click a part to edit its shapes,
// eye and lock buttons on every row.

const GROUP_ORDER = ['Body', 'Body kit', 'Extras', 'Lights', 'Wheels', 'Exhaust', 'Other'];

export class Outliner {
  private open = new Set<string>();
  private filter = '';
  private last: string | null = null;

  constructor(private root: HTMLElement, private store: Store, private actions: Actions, private onFocusPart: (id: string | null) => void) {}

  render() {
    const st = this.store;
    const car = st.car;
    const sel = st.sel;
    const selParts = new Set(sel.parts), selShapes = new Set(sel.shapes);
    if (sel.focus) this.open.add(sel.focus);
    for (const k of sel.shapes) this.open.add(k.split('/')[0]);
    const scrollTop = this.root.querySelector('.tree')?.scrollTop ?? 0;
    const search = h('input', { class: 'search', type: 'search', placeholder: 'Find a part or shape', value: this.filter });
    search.addEventListener('input', () => { this.filter = search.value.toLowerCase(); this.render(); const s = this.root.querySelector<HTMLInputElement>('.search'); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    const tree = h('div', { class: 'tree' });
    const groups = new Map<string, Part[]>();
    for (const p of car.parts) {
      const g = SLOT_INFO[p.slot]?.group ?? 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    }
    const f = this.filter;
    for (const g of GROUP_ORDER) {
      const parts = groups.get(g);
      if (!parts?.length) continue;
      const rows: HTMLElement[] = [];
      for (const p of parts) {
        const shapes = partShapes(car, p);
        const shapeMatch = f ? shapes.filter((s) => s.name.toLowerCase().includes(f)) : [];
        if (f && !p.name.toLowerCase().includes(f) && !shapeMatch.length) continue;
        const open = this.open.has(p.id) || (f && shapeMatch.length > 0);
        const badges: Node[] = [];
        if (p.gen) badges.push(h('span', { class: 'badge gen', title: 'Made with sliders' }, icon('sliders')));
        if (p.link) badges.push(h('span', { class: 'badge', title: `Linked copy of ${st.part(p.link)?.name ?? '?'}` }, icon('link')));
        if (isUnion(car, p)) badges.push(h('span', { class: 'badge union', title: 'Exports as one Roblox Union' }, 'U'));
        if (p.noExport) badges.push(h('span', { class: 'badge off', title: 'Left out of exports' }, 'off'));
        const row = h('div', {
          class: `row part ${selParts.has(p.id) ? 'sel' : ''} ${sel.focus === p.id ? 'focus' : ''} ${p.hidden ? 'hidden' : ''}`,
          onclick: (e: MouseEvent) => this.clickPart(p, e),
          ondblclick: () => this.onFocusPart(p.id),
          title: SLOT_INFO[p.slot]?.label,
        },
          h('button', { class: `twisty ${open ? 'open' : ''}`, onclick: (e: MouseEvent) => { e.stopPropagation(); if (this.open.has(p.id)) this.open.delete(p.id); else this.open.add(p.id); this.render(); } }, shapes.length ? icon('chevron') : null),
          h('span', { class: 'name' }, p.name),
          h('span', { class: 'meta' }, String(shapes.length)),
          badges,
          h('button', { class: 'tog', title: p.hidden ? 'Show' : 'Hide', onclick: (e: MouseEvent) => { e.stopPropagation(); this.actions.setPartFlag([p.id], 'hidden', !p.hidden); } }, icon(p.hidden ? 'eyeOff' : 'eye')),
          h('button', { class: `tog ${p.locked ? 'on' : ''}`, title: p.locked ? 'Unlock' : 'Lock (stops clicks selecting it)', onclick: (e: MouseEvent) => { e.stopPropagation(); this.actions.setPartFlag([p.id], 'locked', !p.locked); } }, icon(p.locked ? 'lock' : 'unlock')),
        );
        rows.push(row);
        if (open) {
          const list = f && !p.name.toLowerCase().includes(f) ? shapeMatch : shapes;
          for (const s of list) {
            const key = `${p.id}/${s.id}`;
            const sb: Node[] = [];
            if (s.mirror) sb.push(h('span', { class: 'badge', title: 'Mirrored to the other side' }, icon('mirror')));
            if (s.repeat && s.repeat.count > 1) sb.push(h('span', { class: 'badge', title: 'Repeated' }, `×${s.repeat.count}`));
            if (s.cut) sb.push(h('span', { class: 'badge cut', title: 'Cuts the other shapes' }, icon('cut')));
            rows.push(h('div', {
              class: `row shape ${selShapes.has(key) ? 'sel' : ''} ${s.hidden ? 'hidden' : ''}`,
              onclick: (e: MouseEvent) => this.clickShape(p, s.id, e),
              ondblclick: () => this.onFocusPart(p.id),
            },
              h('span', { class: 'kind', style: s.cut ? '' : `color:${s.color.startsWith('@') ? 'inherit' : s.color}` }, icon(s.kind)),
              h('span', { class: 'name' }, s.name),
              sb,
              p.link || p.gen ? null : h('button', { class: 'tog', title: s.hidden ? 'Show' : 'Hide', onclick: (e: MouseEvent) => { e.stopPropagation(); this.store.change(s.hidden ? 'Show shape' : 'Hide shape', (c) => { const x = c.parts.find((q) => q.id === p.id)?.shapes.find((q) => q.id === s.id); if (x) x.hidden = !x.hidden || undefined; }); } }, icon(s.hidden ? 'eyeOff' : 'eye')),
            ));
          }
        }
      }
      if (!rows.length) continue;
      tree.appendChild(h('div', { class: 'group' }, h('div', { class: 'group-head' }, g), rows));
    }
    if (!car.parts.length) tree.appendChild(h('p', { class: 'empty' }, 'No parts yet. Open the Add tab to put shapes or ready-made parts on the car.'));
    this.root.replaceChildren(search, tree);
    tree.scrollTop = scrollTop;
  }

  private clickPart(p: Part, e: MouseEvent) {
    const st = this.store;
    if (e.shiftKey && this.last) {
      // range select through the visible order
      const ids = st.car.parts.map((x) => x.id);
      const a = ids.indexOf(this.last), b = ids.indexOf(p.id);
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      st.select({ parts: [...new Set([...st.sel.parts, ...range])], shapes: [] });
      return;
    }
    this.last = p.id;
    if (e.ctrlKey || e.metaKey) {
      const has = st.sel.parts.includes(p.id);
      st.select({ parts: has ? st.sel.parts.filter((x) => x !== p.id) : [...st.sel.parts, p.id], shapes: [] });
      return;
    }
    st.select({ parts: [p.id], shapes: [], focus: st.sel.focus === p.id ? p.id : null });
  }

  private clickShape(p: Part, sid: string, e: MouseEvent) {
    const st = this.store;
    const key = `${p.id}/${sid}`;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const has = st.sel.shapes.includes(key);
      st.select({ focus: p.id, parts: [], shapes: has ? st.sel.shapes.filter((x) => x !== key) : [...st.sel.shapes, key] });
      return;
    }
    st.select({ focus: p.id, parts: [], shapes: [key] });
  }
}
