import type { Store } from '../app/store';
import { blankCar, buildTemplate, TEMPLATES } from '../core/templates';
import type { Car } from '../core/types';
import { buildExport, type ExportOptions } from '../export';
import { exportableParts, gameCatOf } from '../export/customparts';
import { importRbxm } from '../io/importCar';
import { saveFiles } from '../io/files';
import { carThumbnail } from '../render/thumb';
import { btn, checkField, h, modal, numberField, selectField, toast } from './dom';

// Start screen (pick a car), export dialog and the shortcuts card.

const GAME_CARS = import.meta.glob('../templates/cars/*.rbxm', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export async function loadGameCar(url: string, name: string): Promise<{ car: Car; notes: string[] }> {
  const res = await fetch(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return importRbxm(bytes, name);
}

const thumbs = new Map<string, string>();
function thumbLater(img: HTMLImageElement, key: string, make: () => Promise<Car> | Car) {
  if (thumbs.has(key)) { img.src = thumbs.get(key)!; return; }
  const run = async () => {
    try {
      const car = await make();
      const url = carThumbnail(car);
      thumbs.set(key, url);
      img.src = url;
    } catch { /* leave the placeholder */ }
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void run());
  else setTimeout(run, 50);
}

export function startScreen(store: Store, opts: { onOpenFile(): void; restore?: { at: number; car: Car } | null; first?: boolean }) {
  const pick = (car: Car, label: string, notes: string[] = []) => {
    store.load(car, label);
    m.close();
    toast(notes[0] ?? `${car.name} is ready. Click a part to change it, or open the Add tab.`, 5000);
    document.dispatchEvent(new CustomEvent('lpcb-frame'));
  };
  const card = (title: string, blurb: string, key: string, make: () => Promise<Car> | Car, onPick: () => void) => {
    const img = h('img', { alt: '', class: 'thumb' });
    thumbLater(img, key, make);
    return h('button', { class: 'car-card', onclick: onPick }, img, h('b', {}, title), h('span', {}, blurb));
  };
  const game = Object.entries(GAME_CARS).sort(([a], [b]) => a.localeCompare(b)).map(([path, url]) => {
    const file = path.split('/').pop()!;
    const label = file.replace('.rbxm', '').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
    return card(label, 'From your game, every piece editable', file, async () => (await loadGameCar(url, file)).car, async () => {
      try {
        const { car, notes } = await loadGameCar(url, file);
        pick(car, `Open ${label}`, notes);
      } catch (e) {
        toast(`Could not open ${label}: ${(e as Error).message}`);
      }
    });
  });
  const starters = TEMPLATES.map((t) => card(t.name, t.blurb, `tpl:${t.id}`, () => buildTemplate(t), () => pick(buildTemplate(t), `New ${t.name}`)));
  const body = h('div', { class: 'start' },
    h('div', { class: 'start-actions' },
      opts.restore ? btn(`Carry on with ${opts.restore.car.name} (autosaved ${timeAgo(opts.restore.at)})`, () => pick(opts.restore!.car, 'Restore autosave'), { icon: 'undo', class: 'primary' }) : null,
      btn('Open a file (.lpcar or Roblox .rbxm)', () => { m.close(); opts.onOpenFile(); }, { icon: 'folder' }),
      btn('Empty car (just wheels)', () => pick(blankCar(), 'New empty car'), { icon: 'plus' }),
    ),
    h('h3', {}, 'Start from a car in your game'),
    h('div', { class: 'car-grid' }, game),
    h('h3', {}, 'Or a starter shape (every part has sliders)'),
    h('div', { class: 'car-grid' }, starters),
  );
  const m = modal(opts.first ? 'Low Poly Car Builder' : 'New car', body, { wide: true });
}

function timeAgo(at: number): string {
  const s = (Date.now() - at) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const EXPORT_KEY = 'lpcb.export.v2';

export function exportDialog(store: Store) {
  const car = store.car;
  const parts = exportableParts(car);
  let o: ExportOptions = { car: true, drivable: false, shopParts: [], shop: { price: 120, currency: 'coins', level: 1 }, fbxCar: true, fbxParts: false, settings: true, project: true };
  try { o = { ...o, ...JSON.parse(localStorage.getItem(EXPORT_KEY) ?? '{}'), shopParts: [] }; } catch { /* defaults */ }
  // body-kit parts are ticked for the shop by default when they are generated or custom
  o.shopParts = parts.filter((p) => p.gen || p.slot !== 'wheel' || true).filter((p) => !['custom'].includes(p.slot) && gameCatOf(p)).filter((p) => p.gen || /Kit_|Custom/.test(p.name)).map((p) => p.id);
  const shopList = h('div', { class: 'shop-list' }, parts.length ? parts.map((p) => checkField(`${p.name} (${gameCatOf(p)})`, o.shopParts.includes(p.id), (v) => { o.shopParts = v ? [...o.shopParts, p.id] : o.shopParts.filter((x) => x !== p.id); })) : h('p', { class: 'hint' }, 'No parts in shop slots yet. Body kit, extras, lights, rims and exhaust tips can go to the shop.'));
  const notes = h('div', { class: 'notes' });
  const body = h('div', { class: 'export' },
    h('section', {},
      h('h3', {}, 'Whole car for Roblox Studio'),
      checkField('Build script for the whole car (.lua)', o.car, (v) => { o.car = v; }),
      checkField('Make it drivable with my game\'s CarKit', o.drivable, (v) => { o.drivable = v; }, 'Off: a plain model (no physics). On: uses ServerStorage.CarKit and CarBodyKit in your place to add the chassis, wheels and seat.'),
      h('p', { class: 'hint' }, 'Paste the script into the Studio command bar and press Enter. It builds the car with real parts and Unions. Off = a plain model with nothing moving; your game adds the driving.'),
    ),
    h('section', {},
      h('h3', {}, 'Parts for the game\'s shop (CustomParts)'),
      shopList,
      h('div', { class: 'row3' },
        numberField('Price', o.shop.price, { min: 0, max: 1e6, step: 10, digits: 0, done: (v) => { o.shop.price = v; } }),
        selectField('Currency', o.shop.currency, [['coins', 'Coins'], ['score', 'Score']], (v) => { o.shop.currency = v as 'coins' | 'score'; }),
        numberField('Level', o.shop.level, { min: 0, max: 100, step: 1, digits: 0, done: (v) => { o.shop.level = v; } }),
      ),
      h('p', { class: 'hint' }, 'Each part fits every car in the game: it is saved in its slot\'s frame with this car\'s measurements, the way your ShopCatalog reads custom parts.'),
    ),
    h('section', {},
      h('h3', {}, 'Other files'),
      checkField('Whole car as .fbx', o.fbxCar, (v) => { o.fbxCar = v; }),
      checkField('Every part as its own .fbx', o.fbxParts, (v) => { o.fbxParts = v; }),
      checkField('Settings (colours, aura, underglow, boost) as .json', o.settings, (v) => { o.settings = v; }),
      checkField('Project file (.lpcar) to open again later', o.project, (v) => { o.project = v; }),
    ),
    notes,
  );
  const go = async () => {
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify({ ...o, shopParts: [] })); } catch { /* ignore */ }
    const { files, shop } = buildExport(store.car, o);
    const problems = shop.filter((r) => r.notes.length).map((r) => h('li', {}, h('b', {}, `${r.part.name}: `), r.notes.join(' ')));
    notes.replaceChildren(problems.length ? h('div', { class: 'note' }, h('b', {}, 'Notes'), h('ul', {}, problems)) : '');
    if (!files.length) { toast('Nothing ticked to export.'); return; }
    const where = await saveFiles(`${store.car.name.replace(/[^A-Za-z0-9_-]+/g, '_')}_export`, files);
    if (where) toast(`Saved ${files.length} file${files.length > 1 ? 's' : ''} to ${where}.`, 5000);
  };
  modal('Export', body, { wide: true, footer: [btn('Export', () => void go(), { class: 'primary', icon: 'export' })] });
}

export function shortcutsDialog() {
  const rows: [string, string][] = [
    ['Click', 'Select a part (or a shape while editing a part)'], ['Double-click', 'Edit the part\'s shapes'], ['Esc', 'Back out / clear the selection'],
    ['Shift / Ctrl + click', 'Add to the selection'], ['Q / W / E / R', 'Select, Move, Turn, Size tool'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
    ['Ctrl+D', 'Duplicate'], ['Ctrl+C / Ctrl+V', 'Copy / Paste'], ['Delete', 'Delete'], ['M', 'Mirror on / off for shapes'],
    ['H', 'Hide the selection'], ['Alt+H', 'Show everything'], ['F', 'Look at the selection'], ['G', 'Snap to grid on / off'],
    ['1 / 3 / 7 / 5', 'Front / Side / Top / 3D view'], ['Ctrl+1 / Ctrl+3', 'Back / other side'], ['X', 'See-through (x-ray)'], ['Ctrl+S', 'Save the project'], ['Ctrl+E', 'Export'],
    ['Right-drag or middle-drag', 'Pan the view'], ['Left-drag on empty space', 'Turn the view'], ['Scroll', 'Zoom'],
  ];
  modal('Shortcuts', h('table', { class: 'keys' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))));
}
