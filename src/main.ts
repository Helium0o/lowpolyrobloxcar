import { Store } from './store';
import { newCar } from './templates';
import { UI } from './ui';
import { Viewport } from './viewport';

const store = new Store(newCar('sedan'));
const vp = new Viewport(document.getElementById('canvas-host')!, {
  select: (sel) => store.select(sel),
  commitShape: (partId, shapeId, pos, rot, size) =>
    store.update((c) => {
      const s = c.parts.find((p) => p.id === partId)?.shapes.find((x) => x.id === shapeId);
      if (s) Object.assign(s, { pos, rot, size });
    }),
  commitPart: (partId, pivot) =>
    store.update((c) => {
      const p = c.parts.find((x) => x.id === partId);
      if (p) p.pivot = pivot;
    }),
  live: () => {},
});
new UI(store, vp);
document.addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
});
