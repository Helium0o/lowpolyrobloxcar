import { cloneCar, type Car } from './model';
import type { Selection } from './viewport';

export type Change = 'car' | 'paint' | 'effects' | 'sel';

/** App state with undo/redo. Every change is a snapshot of the car (cars are small). */
export class Store {
  car: Car;
  sel: Selection = { partId: null, shapeId: null };
  dirty = false;
  private past: string[] = [];
  private future: string[] = [];
  private lastKey = '';
  private lastTime = 0;
  private listeners: ((c: Change) => void)[] = [];

  constructor(car: Car) {
    this.car = car;
  }

  on(fn: (c: Change) => void) {
    this.listeners.push(fn);
  }

  private emit(c: Change) {
    for (const l of this.listeners) l(c);
  }

  /**
   * Applies a change. `coalesce` merges rapid repeats of the same edit (dragging a colour
   * picker or slider) into one undo step.
   */
  update(fn: (car: Car) => void, kind: Change = 'car', coalesce?: string) {
    const now = performance.now();
    const merge = coalesce && coalesce === this.lastKey && now - this.lastTime < 1500;
    if (!merge) {
      this.past.push(JSON.stringify(this.car));
      if (this.past.length > 150) this.past.shift();
    }
    this.lastKey = coalesce ?? '';
    this.lastTime = now;
    this.future = [];
    fn(this.car);
    this.dirty = true;
    this.fixSelection();
    this.emit(kind);
  }

  select(sel: Selection) {
    this.sel = { ...sel };
    this.emit('sel');
  }

  load(car: Car) {
    this.car = car;
    this.past = [];
    this.future = [];
    this.sel = { partId: null, shapeId: null };
    this.dirty = false;
    this.emit('car');
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(JSON.stringify(this.car));
    this.car = JSON.parse(prev);
    this.lastKey = '';
    this.fixSelection();
    this.emit('car');
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(JSON.stringify(this.car));
    this.car = JSON.parse(next);
    this.lastKey = '';
    this.fixSelection();
    this.emit('car');
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  snapshot(): Car {
    return cloneCar(this.car);
  }

  private fixSelection() {
    const part = this.car.parts.find((p) => p.id === this.sel.partId);
    if (!part) this.sel = { partId: null, shapeId: null };
    else if (this.sel.shapeId && !part.shapes.some((s) => s.id === this.sel.shapeId)) this.sel = { partId: part.id, shapeId: null };
  }

  get part() {
    return this.car.parts.find((p) => p.id === this.sel.partId) ?? null;
  }
  get shape() {
    return this.part?.shapes.find((s) => s.id === this.sel.shapeId) ?? null;
  }
}
