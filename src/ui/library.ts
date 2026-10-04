import type { Actions } from '../app/actions';
import { loadLibrary, removeFromLibrary } from '../app/library';
import type { Store } from '../app/store';
import { GENERATORS } from '../core/gen';
import { KIND_LABELS, KINDS, SLOT_INFO } from '../core/types';
import { btn, h, icon, section } from './dom';

// The Add tab: raw Roblox shapes, ready-made parts with their designs, and the user's saved parts.

const ORDER = ['Body', 'Body kit', 'Lights', 'Wheels', 'Exhaust', 'Extras'];

export class Library {
  constructor(private root: HTMLElement, private store: Store, private actions: Actions) {}

  render() {
    const st = this.store;
    const focus = st.part(st.sel.focus);
    const target = focus && !focus.gen && !focus.link ? `into ${focus.name}` : 'as a new part';
    const shapes = section('Shapes', [
      h('div', { class: 'tiles' }, KINDS.map((k) => h('button', { class: 'tile', title: `Add a ${KIND_LABELS[k].toLowerCase()} ${target}`, onclick: () => this.actions.addShape(k) }, icon(k), h('span', {}, KIND_LABELS[k])))),
      h('div', { class: 'tiles' },
        h('button', { class: 'tile cut', title: `Add a cutting block ${target}`, onclick: () => this.actions.addShape('block', true) }, icon('cut'), h('span', {}, 'Cut block')),
        h('button', { class: 'tile cut', title: `Add a cutting cylinder ${target}`, onclick: () => this.actions.addShape('cylinder', true) }, icon('cut'), h('span', {}, 'Cut cylinder')),
        h('button', { class: 'tile cut', title: `Add a cutting wedge ${target}`, onclick: () => this.actions.addShape('wedge', true) }, icon('cut'), h('span', {}, 'Cut wedge')),
      ),
      h('p', { class: 'hint' }, `New shapes go ${target}. Cut shapes carve away the rest of their part, like Negate in Studio.`),
    ], { key: 'lib.shapes' });

    const groups = new Map<string, HTMLElement[]>();
    for (const g of GENERATORS) {
      const grp = SLOT_INFO[g.slot]?.group ?? 'Other';
      const card = h('div', { class: 'gen-card' },
        h('div', { class: 'gen-head' }, h('b', {}, g.label), btn('Add', () => this.actions.addGenerated(g.type), { class: 'small', icon: 'plus', title: g.type === 'wheel' ? 'Put this wheel on all four corners' : `Add ${g.label.toLowerCase()}` })),
        g.presets?.length ? h('div', { class: 'chips' }, g.presets.map((p) => btn(p.name, () => this.actions.addGenerated(g.type, p.params, p.name), { class: 'chip' }))) : null,
      );
      if (!groups.has(grp)) groups.set(grp, []);
      groups.get(grp)!.push(card);
    }
    const parts = ORDER.filter((g) => groups.has(g)).map((g) => section(g, groups.get(g)!, { key: `lib.${g}`, open: g !== 'Body' }));

    const saved = loadLibrary();
    const mine = section('My parts', saved.length
      ? saved.map((s) => h('div', { class: 'gen-card' }, h('div', { class: 'gen-head' }, h('b', {}, s.name), h('span', { class: 'meta' }, SLOT_INFO[s.part.slot]?.label ?? ''),
          btn('Add', () => this.actions.addPartFromLibrary(s.part), { class: 'small', icon: 'plus' }),
          btn('', () => { removeFromLibrary(s.id); this.render(); }, { class: 'icon small', icon: 'trash', title: 'Remove from My parts' }))))
      : [h('p', { class: 'hint' }, 'Select a part and click "Save to My parts" to keep it here for any car. Parts made with sliders resize to fit the next car.')], { key: 'lib.mine' });

    this.root.replaceChildren(h('div', { class: 'lib' }, shapes, ...parts, mine));
  }
}
