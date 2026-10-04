import { partShapes } from '../core/resolve';
import { clone, type Car, type Part } from '../core/types';

// "My parts": parts the user saved to reuse on any car. Kept in the app's local storage, and can be
// exported / imported as a .lppart file to share.

const KEY = 'lpcb.library.v2';

export interface SavedPart {
  id: string;
  name: string;
  savedAt: number;
  part: Part;
}

export function loadLibrary(): SavedPart[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function store(list: SavedPart[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full: nothing else to do */
  }
}

export function saveToLibrary(car: Car, part: Part) {
  const p: Part = { ...clone(part), shapes: clone(partShapes(car, part)) };
  delete p.link;
  delete p.wheel;
  // colours that point at a slot are kept as slots, so the part takes the new car's paint
  const list = loadLibrary();
  list.unshift({ id: `${Date.now()}`, name: part.name, savedAt: Date.now(), part: p });
  store(list);
}

export function removeFromLibrary(id: string) {
  store(loadLibrary().filter((x) => x.id !== id));
}

export function addSaved(entry: SavedPart) {
  const list = loadLibrary();
  list.unshift(entry);
  store(list);
}
