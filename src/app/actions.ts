import * as THREE from 'three';
import { fromPosRot, MIRROR_X, toPosRot } from '../core/cf';
import { generator, makeGenPart, regenerate } from '../core/gen';
import { mirrorPlacement, partMatrix, partShapes, piecesBox, repeatMatrices, resolvePart, shapeMatrix } from '../core/resolve';
import { clone, newPart, newShape, uid, type Car, type Kind, type Params, type Part, type Shape, type SlotId, type V3 } from '../core/types';
import type { Store } from './store';

// Editing operations. Each one is a single undo step with a plain-language label.

const SINGLE_SLOTS = new Set<string>(['body', 'glass', 'roof', 'frontBumper', 'rearBumper', 'sideSkirts', 'spoiler', 'hood', 'headlights', 'taillights', 'exhaust', 'interior', 'liners', 'details']);

export function shapeCarMatrix(car: Car, part: Part, s: Shape): THREE.Matrix4 {
  return partMatrix(car, part).multiply(shapeMatrix(s));
}
export function setShapeCarMatrix(car: Car, part: Part, s: Shape, m: THREE.Matrix4) {
  const local = partMatrix(car, part).invert().multiply(m);
  const { pos, rot } = toPosRot(local);
  s.pos = pos;
  s.rot = rot;
}

function freshIds(shapes: Shape[]): Shape[] {
  return shapes.map((s) => ({ ...clone(s), id: uid() }));
}

/** Parts that are generated can't have their shapes edited by hand until they are converted. */
export function isEditable(part: Part | undefined): boolean {
  return !!part && !part.gen && !part.link;
}

export class Actions {
  clipboard: { kind: 'shapes'; shapes: { shape: Shape; m: number[] }[] } | { kind: 'parts'; parts: Part[] } | null = null;
  constructor(private store: Store, private hooks: { toast(msg: string): void; viewTarget(): THREE.Vector3 }) {}

  private get car() { return this.store.car; }

  // ---------- adding ----------

  /** Adds a primitive to the part being edited (or a new custom part) and selects it. */
  addShape(kind: Kind, cut = false) {
    const st = this.store;
    let part = st.part(st.sel.focus) ?? (st.sel.parts.length === 1 ? st.part(st.sel.parts[0]) : undefined);
    if (part && !isEditable(part)) part = undefined;
    const at = this.hooks.viewTarget();
    let created: Part | null = null;
    const s = newShape(kind, { color: cut ? '#000000' : '@paint' });
    if (cut) { s.cut = true; s.name = 'Cut'; }
    st.change(`Add ${cut ? 'cut ' : ''}${kind}`, (car) => {
      if (!part) {
        created = newPart('custom', `Custom${car.parts.filter((p) => p.slot === 'custom').length + 1}`);
        car.parts.push(created);
        part = created;
      }
      const target = part!;
      // place it in front of the camera target, sitting on whatever is under it
      const m = new THREE.Matrix4().makeTranslation(at.x, Math.max(at.y, s.size[1] / 2), at.z);
      setShapeCarMatrix(car, target, s, m);
      target.shapes.push(s);
    });
    st.select({ focus: part!.id, parts: [], shapes: [`${part!.id}/${s.id}`] });
    if (created) this.hooks.toast('Started a new custom part for your shape.');
  }

  /** Adds a generated part (or replaces the one already in that slot). */
  addGenerated(type: string, preset?: Params, presetName?: string) {
    const g = generator(type);
    if (!g) return;
    let picked: Part | null = null;
    if (type === 'wheel') return this.setWheels(preset ?? {}, presetName);
    this.store.change(presetName ? `${g.label}: ${presetName}` : `Add ${g.label.toLowerCase()}`, (car) => {
      const existing = SINGLE_SLOTS.has(type) ? car.parts.find((p) => p.gen?.type === type) : undefined;
      if (existing && existing.gen) {
        existing.gen.params = { ...g.defaults(car), ...(preset ?? {}) };
        regenerate(car, existing);
        picked = existing;
      } else {
        const p = makeGenPart(car, type, preset);
        car.parts.push(p);
        picked = p;
      }
    });
    if (picked) this.store.select({ focus: null, parts: [(picked as Part).id], shapes: [] });
  }

  /** Applies a wheel design to all four wheels (the front and rear sources; the others are linked). */
  setWheels(preset: Params, name?: string) {
    this.store.change(name ? `Wheels: ${name}` : 'Change wheels', (car) => {
      const wheels = car.parts.filter((p) => p.wheel);
      const src: Record<string, Part> = {};
      for (const pos of ['FL', 'RL'] as const) {
        let p = wheels.find((w) => w.wheel === pos);
        if (!p) { p = newPart('wheel', `Wheel${pos}`, { wheel: pos }); car.parts.push(p); }
        const g = generator('wheel')!;
        const keep = p.gen?.params ?? {};
        p.gen = { type: 'wheel', params: { ...g.defaults(car), ...keep, ...preset, rear: pos === 'RL' ? 'rear' : 'front' } };
        delete p.link;
        regenerate(car, p);
        src[pos] = p;
      }
      for (const pos of ['FR', 'RR'] as const) {
        let p = wheels.find((w) => w.wheel === pos);
        if (!p) { p = newPart('wheel', `Wheel${pos}`, { wheel: pos }); car.parts.push(p); }
        p.link = src[pos === 'FR' ? 'FL' : 'RL'].id;
        p.shapes = [];
        delete p.gen;
      }
    });
  }

  applyPreset(part: Part, preset: Params, name: string) {
    if (part.gen?.type === 'wheel') return this.setWheels(preset, name);
    this.store.change(`${part.name}: ${name}`, (car) => {
      const p = car.parts.find((x) => x.id === part.id);
      const g = p?.gen && generator(p.gen.type);
      if (!p?.gen || !g) return;
      p.gen.params = { ...g.defaults(car), ...preset };
    });
  }

  addPartFromLibrary(saved: Part) {
    const p: Part = { ...clone(saved), id: uid('p') };
    p.shapes = freshIds(p.shapes);
    delete p.link;
    delete p.wheel;
    this.store.change(`Add ${p.name}`, (car) => { car.parts.push(p); });
    this.store.select({ focus: null, parts: [p.id], shapes: [] });
  }

  // ---------- generated parts ----------

  convertToShapes(part: Part) {
    this.store.change(`Make ${part.name} editable`, (car) => {
      const p = car.parts.find((x) => x.id === part.id);
      if (!p) return;
      if (p.link) { this.unlinkIn(car, p); return; }
      p.shapes = freshIds(p.shapes);
      delete p.gen;
    });
    this.hooks.toast(`${part.name} is now plain shapes. Double-click it to edit them one by one.`);
  }

  private unlinkIn(car: Car, p: Part) {
    p.shapes = freshIds(partShapes(car, p));
    delete p.link;
  }

  makeUnique(part: Part) {
    this.store.change(`Unlink ${part.name}`, (car) => {
      const p = car.parts.find((x) => x.id === part.id);
      if (p) this.unlinkIn(car, p);
    });
  }

  // ---------- part operations ----------

  duplicateParts(ids: string[], linked = false) {
    const made: string[] = [];
    this.store.change(linked ? 'Linked copy' : 'Duplicate', (car) => {
      for (const id of ids) {
        const src = car.parts.find((p) => p.id === id);
        if (!src || src.wheel) continue;
        const p: Part = { ...clone(src), id: uid('p'), name: nextName(car, src.name) };
        if (linked) { p.link = src.link ?? src.id; p.shapes = []; delete p.gen; }
        else p.shapes = p.gen ? p.shapes : freshIds(p.shapes);
        p.pos = [p.pos[0], p.pos[1], p.pos[2] + 0.5];
        car.parts.push(p);
        made.push(p.id);
      }
    });
    this.store.select({ focus: null, parts: made, shapes: [] });
  }

  /** A separate copy on the other side of the car. */
  mirrorParts(ids: string[]) {
    const made: string[] = [];
    this.store.change('Mirror copy', (car) => {
      for (const id of ids) {
        const src = car.parts.find((p) => p.id === id);
        if (!src || src.wheel) continue;
        const p: Part = { ...clone(src), id: uid('p'), name: nextName(car, src.name), pos: [0, 0, 0], rot: [0, 0, 0] };
        delete p.gen;
        delete p.link;
        p.shapes = [];
        for (const s of partShapes(car, src)) {
          for (const lm of repeatMatrices({ ...s, repeat: undefined })) {
            const m = partMatrix(car, src).multiply(lm);
            const mp = mirrorPlacement(s.kind, m, s.size);
            const ns: Shape = { ...clone(s), id: uid(), size: mp.size };
            if (s.repeat) ns.repeat = mirrorRepeat(s.repeat);
            setShapeCarMatrix(car, p, ns, mp.m);
            p.shapes.push(ns);
          }
        }
        car.parts.push(p);
        made.push(p.id);
      }
    });
    this.store.select({ focus: null, parts: made, shapes: [] });
  }

  deleteSelection() {
    const st = this.store;
    if (st.sel.shapes.length) {
      const keys = new Set(st.sel.shapes);
      const gen = st.selectedShapes().some((x) => !isEditable(x.part));
      if (gen) { this.hooks.toast('These shapes belong to a part made with sliders. Use "Edit shapes by hand" on the part first, or hide them.'); return; }
      st.change(`Delete ${keys.size} shape${keys.size > 1 ? 's' : ''}`, (car) => {
        for (const p of car.parts) p.shapes = p.shapes.filter((s) => !keys.has(`${p.id}/${s.id}`));
      });
      st.select({ shapes: [] });
      return;
    }
    if (st.sel.parts.length) {
      const ids = new Set(st.sel.parts);
      const n = ids.size;
      st.change(`Delete ${n} part${n > 1 ? 's' : ''}`, (car) => {
        // linked copies of a deleted part keep its look
        for (const p of car.parts) if (p.link && ids.has(p.link) && !ids.has(p.id)) this.unlinkIn(car, p);
        car.parts = car.parts.filter((p) => !ids.has(p.id));
      });
      st.select({ parts: [], focus: null });
    }
  }

  setPartFlag(ids: string[], flag: 'hidden' | 'locked' | 'noExport', value: boolean) {
    const label = { hidden: value ? 'Hide' : 'Show', locked: value ? 'Lock' : 'Unlock', noExport: value ? 'Leave out of export' : 'Include in export' }[flag];
    this.store.change(label, (car) => {
      for (const p of car.parts) if (ids.includes(p.id)) { if (value) p[flag] = true; else delete p[flag]; }
    });
  }

  isolate(ids: string[]) {
    this.store.change('Hide the rest', (car) => {
      for (const p of car.parts) { if (ids.includes(p.id)) delete p.hidden; else p.hidden = true; }
    });
  }
  showAll() {
    this.store.change('Show everything', (car) => {
      for (const p of car.parts) { delete p.hidden; for (const s of p.shapes) delete s.hidden; }
    });
  }

  // ---------- shape operations ----------

  private editableShapes(): { part: Part; shape: Shape }[] | null {
    const list = this.store.selectedShapes();
    if (list.some((x) => !isEditable(x.part))) {
      this.hooks.toast('These shapes come from sliders. Click "Edit shapes by hand" on the part to change them one by one.');
      return null;
    }
    return list;
  }

  duplicateShapes() {
    const list = this.editableShapes();
    if (!list?.length) return;
    const keys: string[] = [];
    this.store.change('Duplicate shapes', (car) => {
      for (const { part, shape } of list) {
        const p = car.parts.find((x) => x.id === part.id)!;
        const s: Shape = { ...clone(shape), id: uid() };
        s.pos = [s.pos[0], s.pos[1], s.pos[2] + Math.max(0.1, Math.min(1, shape.size[2]))];
        p.shapes.push(s);
        keys.push(`${p.id}/${s.id}`);
      }
    });
    this.store.select({ shapes: keys });
  }

  mirrorShapes(linked: boolean) {
    const list = this.editableShapes();
    if (!list?.length) return;
    if (linked) {
      const on = !list.every((x) => x.shape.mirror);
      this.store.change(on ? 'Mirror on' : 'Mirror off', (car) => {
        for (const { part, shape } of list) {
          const s = car.parts.find((p) => p.id === part.id)?.shapes.find((x) => x.id === shape.id);
          if (s) { if (on) s.mirror = true; else delete s.mirror; }
        }
      });
      return;
    }
    const keys: string[] = [];
    this.store.change('Mirror copy', (car) => {
      for (const { part, shape } of list) {
        const p = car.parts.find((x) => x.id === part.id)!;
        const m = shapeCarMatrix(car, p, shape);
        const mp = mirrorPlacement(shape.kind, m, shape.size);
        const s: Shape = { ...clone(shape), id: uid(), size: mp.size };
        delete s.mirror;
        if (s.repeat) s.repeat = mirrorRepeat(s.repeat);
        setShapeCarMatrix(car, p, s, mp.m);
        p.shapes.push(s);
        keys.push(`${p.id}/${s.id}`);
      }
    });
    this.store.select({ shapes: keys });
  }

  /** Turns repeats and mirror copies into separate shapes. */
  bakeShapes() {
    const list = this.editableShapes();
    if (!list?.length) return;
    this.store.change('Split copies into shapes', (car) => {
      for (const { part, shape } of list) {
        const p = car.parts.find((x) => x.id === part.id)!;
        const idx = p.shapes.findIndex((s) => s.id === shape.id);
        const out: Shape[] = [];
        for (const lm of repeatMatrices(shape)) {
          const { pos, rot } = toPosRot(lm);
          const s: Shape = { ...clone(shape), id: uid(), pos, rot };
          delete s.repeat;
          delete s.mirror;
          out.push(s);
          if (shape.mirror) {
            const m = partMatrix(car, p).multiply(lm);
            const mp = mirrorPlacement(shape.kind, m, shape.size);
            const t: Shape = { ...clone(s), id: uid(), size: mp.size };
            setShapeCarMatrix(car, p, t, mp.m);
            out.push(t);
          }
        }
        out[0].id = shape.id;
        p.shapes.splice(idx, 1, ...out);
      }
    });
  }

  /** Moves the selected shapes into a new part of their own. */
  groupShapes(slot: SlotId = 'custom', name?: string) {
    const list = this.editableShapes();
    if (!list?.length) return;
    let made: Part | null = null;
    this.store.change('Make a new part from shapes', (car) => {
      const p = newPart(slot, name ?? nextName(car, 'Custom1'));
      for (const { part, shape } of list) {
        const src = car.parts.find((x) => x.id === part.id)!;
        const m = shapeCarMatrix(car, src, shape);
        src.shapes = src.shapes.filter((s) => s.id !== shape.id);
        const s = clone(shape);
        setShapeCarMatrix(car, p, s, m);
        p.shapes.push(s);
      }
      car.parts.push(p);
      made = p;
    });
    if (made) this.store.select({ focus: null, parts: [(made as Part).id], shapes: [] });
  }

  moveShapesTo(targetId: string) {
    const list = this.editableShapes();
    if (!list?.length) return;
    const target = this.store.part(targetId);
    if (!isEditable(target)) { this.hooks.toast('That part is made with sliders, so shapes can\'t be moved into it.'); return; }
    this.store.change(`Move shapes to ${target!.name}`, (car) => {
      const t = car.parts.find((p) => p.id === targetId)!;
      for (const { part, shape } of list) {
        const src = car.parts.find((x) => x.id === part.id)!;
        if (src === t) continue;
        const m = shapeCarMatrix(car, src, shape);
        src.shapes = src.shapes.filter((s) => s.id !== shape.id);
        const s = clone(shape);
        setShapeCarMatrix(car, t, s, m);
        t.shapes.push(s);
      }
    });
    this.store.select({ focus: targetId, shapes: list.map((x) => `${targetId}/${x.shape.id}`) });
  }

  patchShapes(label: string, patch: (s: Shape) => void) {
    const list = this.editableShapes();
    if (!list?.length) return;
    this.store.change(label, (car) => {
      for (const { part, shape } of list) {
        const s = car.parts.find((p) => p.id === part.id)?.shapes.find((x) => x.id === shape.id);
        if (s) patch(s);
      }
    });
  }

  /** Line up shapes or parts on one axis: min, centre or max of the whole selection. */
  align(axis: 0 | 1 | 2, where: 'min' | 'mid' | 'max') {
    const car = this.car;
    const shapes = this.editableShapes() ?? [];
    const parts = this.store.selectedParts().filter((p) => !p.wheel);
    const boxOf = (pieces: ReturnType<typeof resolvePart>) => piecesBox(pieces.filter((x) => x.copy === 0 && !x.mirrored));
    const items = [
      ...shapes.map((x) => ({ box: boxOf(resolvePart(car, { ...x.part, shapes: [x.shape], link: undefined })), apply: (d: number, c: Car) => { const s = c.parts.find((p) => p.id === x.part.id)!.shapes.find((y) => y.id === x.shape.id)!; const m = shapeCarMatrix(c, x.part, s); m.elements[12 + axis] += d; setShapeCarMatrix(c, x.part, s, m); } })),
      ...parts.map((p) => ({ box: boxOf(resolvePart(car, p)), apply: (d: number, c: Car) => { const q = c.parts.find((y) => y.id === p.id)!; q.pos[axis] += d; } })),
    ].filter((i) => !i.box.isEmpty());
    if (items.length < 2) { this.hooks.toast('Select two or more things to line up.'); return; }
    const all = new THREE.Box3();
    for (const i of items) all.union(i.box);
    const get = (b: THREE.Box3) => (where === 'min' ? b.min : where === 'max' ? b.max : b.getCenter(new THREE.Vector3())).getComponent(axis);
    const goal = get(all);
    this.store.change(`Align ${'XYZ'[axis]}`, (c) => { for (const i of items) i.apply(goal - get(i.box), c); });
  }

  /** Drops the selection straight down until it rests on the car or the ground. */
  drop(castDown: (from: THREE.Vector3, exclude: Set<string>) => number | null) {
    const car = this.car;
    const shapes = this.editableShapes() ?? [];
    const parts = this.store.selectedParts().filter((p) => !p.wheel && !p.gen);
    if (!shapes.length && !parts.length) { this.hooks.toast('Select shapes or a hand-made part to drop.'); return; }
    const exclude = new Set([...shapes.map((x) => x.part.id), ...parts.map((p) => p.id)]);
    this.store.change('Drop onto surface', (c) => {
      for (const x of shapes) {
        const box = piecesBox(resolvePart(car, { ...x.part, shapes: [x.shape], link: undefined }).filter((p) => p.copy === 0 && !p.mirrored));
        const c0 = box.getCenter(new THREE.Vector3());
        const y = castDown(new THREE.Vector3(c0.x, box.min.y - 0.001, c0.z), exclude) ?? 0;
        const s = c.parts.find((p) => p.id === x.part.id)!.shapes.find((y2) => y2.id === x.shape.id)!;
        const m = shapeCarMatrix(c, x.part, s);
        m.elements[13] += y - box.min.y;
        setShapeCarMatrix(c, x.part, s, m);
      }
      for (const p of parts) {
        const box = piecesBox(resolvePart(car, p));
        const c0 = box.getCenter(new THREE.Vector3());
        const y = castDown(new THREE.Vector3(c0.x, box.min.y - 0.001, c0.z), exclude) ?? 0;
        c.parts.find((q) => q.id === p.id)!.pos[1] += y - box.min.y;
      }
    });
  }

  // ---------- clipboard ----------

  copy() {
    const st = this.store;
    if (st.sel.shapes.length) {
      this.clipboard = { kind: 'shapes', shapes: st.selectedShapes().map(({ part, shape }) => ({ shape: clone(shape), m: shapeCarMatrix(this.car, part, shape).toArray() })) };
      this.hooks.toast(`Copied ${st.sel.shapes.length} shape${st.sel.shapes.length > 1 ? 's' : ''}.`);
    } else if (st.sel.parts.length) {
      this.clipboard = { kind: 'parts', parts: st.selectedParts().map((p) => ({ ...clone(p), shapes: clone(partShapes(this.car, p)), link: undefined })) };
      this.hooks.toast(`Copied ${st.sel.parts.length} part${st.sel.parts.length > 1 ? 's' : ''}.`);
    }
  }

  paste() {
    const cb = this.clipboard;
    if (!cb) return;
    const st = this.store;
    if (cb.kind === 'parts') {
      const ids: string[] = [];
      st.change('Paste', (car) => {
        for (const src of cb.parts) {
          const p: Part = { ...clone(src), id: uid('p'), name: nextName(car, src.name) };
          delete p.wheel;
          p.shapes = freshIds(p.shapes);
          car.parts.push(p);
          ids.push(p.id);
        }
      });
      st.select({ focus: null, parts: ids, shapes: [] });
      return;
    }
    let target = st.part(st.sel.focus);
    if (!isEditable(target)) target = undefined;
    const keys: string[] = [];
    st.change('Paste shapes', (car) => {
      let t = target && car.parts.find((p) => p.id === target!.id);
      if (!t) { t = newPart('custom', nextName(car, 'Custom1')); car.parts.push(t); }
      for (const e of cb.shapes) {
        const s: Shape = { ...clone(e.shape), id: uid() };
        setShapeCarMatrix(car, t, s, new THREE.Matrix4().fromArray(e.m));
        t.shapes.push(s);
        keys.push(`${t.id}/${s.id}`);
      }
      target = t;
    });
    st.select({ focus: target!.id, parts: [], shapes: keys });
  }

  // ---------- gizmo drags ----------

  private dragStart: { car: Car; shapes: { pid: string; sid: string; m: THREE.Matrix4; size: V3 }[]; parts: { id: string; m: THREE.Matrix4; shapes?: Shape[] }[]; centre: THREE.Vector3 } | null = null;

  beginDrag(pivot: THREE.Matrix4 | null): boolean {
    const st = this.store;
    const car = this.car;
    const shapes = st.selectedShapes();
    if (shapes.some((x) => !isEditable(x.part) || x.shape.locked)) {
      this.hooks.toast('Those shapes are made by sliders (or locked). Move the whole part instead, or make it editable.');
      return false;
    }
    const parts = st.selectedParts().filter((p) => !p.wheel && !p.locked);
    if (st.selectedParts().some((p) => p.wheel)) this.hooks.toast('Wheels sit on the axles. Change the wheelbase and track in Car settings to move them.');
    st.begin(shapes.length ? 'Move shapes' : 'Move part');
    this.dragStart = {
      car,
      shapes: shapes.map(({ part, shape }) => ({ pid: part.id, sid: shape.id, m: shapeCarMatrix(car, part, shape), size: [...shape.size] as V3 })),
      parts: parts.map((p) => ({ id: p.id, m: partMatrix(car, p), shapes: p.gen ? undefined : clone(p.shapes) })),
      centre: pivot ? new THREE.Vector3().setFromMatrixPosition(pivot) : new THREE.Vector3(),
    };
    return true;
  }

  drag(delta: THREE.Matrix4, scale: THREE.Vector3, mode: string, pivot: THREE.Matrix4 | null) {
    const d = this.dragStart;
    if (!d) return;
    this.store.live((car) => {
      if (mode === 'scale') {
        const single = d.shapes.length === 1 && !d.parts.length;
        for (const e of d.shapes) {
          const part = car.parts.find((p) => p.id === e.pid)!;
          const s = part.shapes.find((x) => x.id === e.sid)!;
          if (single) {
            s.size = e.size.map((v, i) => round(Math.max(0.05, v * Math.abs(scale.getComponent(i))))) as V3;
          } else {
            const k = uniform(scale);
            s.size = e.size.map((v) => round(Math.max(0.05, v * k))) as V3;
            const m = e.m.clone();
            const pos = new THREE.Vector3().setFromMatrixPosition(m).sub(d.centre).multiplyScalar(k).add(d.centre);
            m.setPosition(pos);
            setShapeCarMatrix(car, part, s, m);
          }
        }
        for (const e of d.parts) {
          if (!e.shapes) continue; // generated parts are sized with their sliders
          const p = car.parts.find((x) => x.id === e.id)!;
          const k = uniform(scale);
          const local = pivot ? partMatrix(car, p).invert().multiply(pivot) : new THREE.Matrix4();
          const c = new THREE.Vector3().setFromMatrixPosition(local);
          p.shapes = e.shapes.map((s0) => {
            const s = clone(s0);
            s.size = s0.size.map((v) => round(Math.max(0.05, v * k))) as V3;
            s.pos = s0.pos.map((v, i) => round(c.getComponent(i) + (v - c.getComponent(i)) * k)) as V3;
            if (s.repeat) s.repeat = { ...s.repeat, offset: s.repeat.offset.map((v) => round(v * k)) as V3 };
            return s;
          });
        }
        return;
      }
      for (const e of d.shapes) {
        const part = car.parts.find((p) => p.id === e.pid)!;
        const s = part.shapes.find((x) => x.id === e.sid)!;
        setShapeCarMatrix(car, part, s, delta.clone().multiply(e.m));
      }
      for (const e of d.parts) {
        const p = car.parts.find((x) => x.id === e.id)!;
        const { pos, rot } = toPosRot(delta.clone().multiply(e.m));
        p.pos = pos;
        p.rot = rot;
      }
    });
  }

  endDrag() {
    this.dragStart = null;
    this.store.commit();
  }
}

function uniform(v: THREE.Vector3): number {
  // the axis the user dragged is the one that moved furthest from 1
  const c = [v.x, v.y, v.z].map(Math.abs);
  let best = 1;
  for (const x of c) if (Math.abs(x - 1) > Math.abs(best - 1)) best = x;
  return best;
}
const round = (v: number) => Math.round(v * 1000) / 1000;

function mirrorRepeat(r: NonNullable<Shape['repeat']>): NonNullable<Shape['repeat']> {
  return { count: r.count, offset: [-r.offset[0], r.offset[1], r.offset[2]], rotate: [r.rotate[0], -r.rotate[1], -r.rotate[2]] };
}

export function nextName(car: Car, base: string): string {
  const names = new Set(car.parts.map((p) => p.name));
  if (!names.has(base)) return base;
  const stem = base.replace(/\d+$/, '');
  for (let i = 2; i < 999; i++) if (!names.has(`${stem}${i}`)) return `${stem}${i}`;
  return `${stem}_${uid()}`;
}

export { fromPosRot, MIRROR_X };
