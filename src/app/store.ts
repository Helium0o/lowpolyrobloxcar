import { regenerateAll } from '../core/gen';
import { clone, type Car, type Part, type Shape } from '../core/types';

// The one place the car is changed. Every edit goes through change() (one undo step) or
// begin() / live() / commit() for drags and sliders (many live updates, one undo step at the end).
// Generated parts are rebuilt after every edit, so anything that follows the body or the car's sizes
// stays in place.

export interface Selection {
  /** Part being edited shape by shape (double-click a part), or null. */
  focus: string | null;
  parts: string[];
  /** "partId/shapeId" */
  shapes: string[];
}

export type Listener = (why: 'car' | 'selection' | 'live') => void;

const AUTOSAVE_KEY = 'lpcb.autosave.v2';
const MAX_UNDO = 150;

export class Store {
  car: Car;
  sel: Selection = { focus: null, parts: [], shapes: [] };
  private undoStack: { label: string; car: string }[] = [];
  private redoStack: { label: string; car: string }[] = [];
  private listeners = new Set<Listener>();
  private pending: { label: string; before: string } | null = null;
  private saveTimer = 0;
  dirty = false;

  constructor(car: Car) {
    this.car = car;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(why: 'car' | 'selection' | 'live') {
    for (const l of this.listeners) l(why);
  }

  /** One undoable edit. */
  change(label: string, fn: (car: Car) => void) {
    if (this.pending) this.commit();
    const before = JSON.stringify(this.car);
    fn(this.car);
    regenerateAll(this.car);
    this.push(label, before);
    this.cleanSelection();
    this.emit('car');
  }

  /** Start a drag or slider edit. */
  begin(label: string) {
    if (this.pending) this.commit();
    this.pending = { label, before: JSON.stringify(this.car) };
  }
  /** Apply a live update during a drag (no undo step yet). */
  live(fn: (car: Car) => void, regen = true) {
    if (!this.pending) this.begin('Edit');
    fn(this.car);
    if (regen) regenerateAll(this.car);
    this.emit('live');
  }
  commit() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (JSON.stringify(this.car) !== p.before) this.push(p.label, p.before);
    this.emit('car');
  }
  cancel() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.car = JSON.parse(p.before);
    this.emit('car');
  }

  private push(label: string, before: string) {
    this.undoStack.push({ label, car: before });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.scheduleSave();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack[this.undoStack.length - 1]?.label; }
  get redoLabel() { return this.redoStack[this.redoStack.length - 1]?.label; }
  history() { return this.undoStack.map((u) => u.label); }

  undo() {
    if (this.pending) this.commit();
    const u = this.undoStack.pop();
    if (!u) return;
    this.redoStack.push({ label: u.label, car: JSON.stringify(this.car) });
    this.car = JSON.parse(u.car);
    this.cleanSelection();
    this.scheduleSave();
    this.emit('car');
    return u.label;
  }
  redo() {
    const r = this.redoStack.pop();
    if (!r) return;
    this.undoStack.push({ label: r.label, car: JSON.stringify(this.car) });
    this.car = JSON.parse(r.car);
    this.cleanSelection();
    this.scheduleSave();
    this.emit('car');
    return r.label;
  }

  /** Replace the whole car (new / open / import). Undo can bring the old one back. */
  load(car: Car, label = 'Open car') {
    if (this.pending) this.commit();
    const before = JSON.stringify(this.car);
    this.car = car;
    regenerateAll(this.car);
    this.push(label, before);
    this.sel = { focus: null, parts: [], shapes: [] };
    this.emit('car');
    this.emit('selection');
  }

  // ---------- selection ----------

  select(sel: Partial<Selection>) {
    this.sel = { ...this.sel, ...sel };
    this.cleanSelection();
    this.emit('selection');
  }
  private cleanSelection() {
    const ids = new Set(this.car.parts.map((p) => p.id));
    if (this.sel.focus && !ids.has(this.sel.focus)) this.sel.focus = null;
    this.sel.parts = this.sel.parts.filter((id) => ids.has(id));
    this.sel.shapes = this.sel.shapes.filter((k) => !!this.shapeByKey(k));
  }

  part(id: string | null | undefined): Part | undefined {
    return id ? this.car.parts.find((p) => p.id === id) : undefined;
  }
  shapeByKey(key: string): { part: Part; shape: Shape } | undefined {
    const [pid, sid] = key.split('/');
    const part = this.part(pid);
    const shape = part?.shapes.find((s) => s.id === sid);
    return part && shape ? { part, shape } : undefined;
  }
  selectedParts(): Part[] {
    return this.sel.parts.map((id) => this.part(id)).filter((p): p is Part => !!p);
  }
  selectedShapes(): { part: Part; shape: Shape }[] {
    return this.sel.shapes.map((k) => this.shapeByKey(k)).filter((x): x is { part: Part; shape: Shape } => !!x);
  }

  // ---------- autosave ----------

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 800);
  }
  saveNow() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ at: Date.now(), car: this.car }));
    } catch {
      /* storage full or blocked: autosave is a convenience only */
    }
  }
  static restore(): { at: number; car: Car } | null {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v?.car?.version === 2 ? v : null;
    } catch {
      return null;
    }
  }
}

export const cloneCar = (c: Car) => clone(c);
