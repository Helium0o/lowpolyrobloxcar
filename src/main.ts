import * as THREE from 'three';
import './style.css';
import { Actions, isEditable } from './app/actions';
import { saveToLibrary } from './app/library';
import { Store } from './app/store';
import { regenerateAll } from './core/gen';
import { piecesBox, resolvePart } from './core/resolve';
import { buildTemplate, TEMPLATES } from './core/templates';
import { clone, safeName, type Car, type Part } from './core/types';
import { importRbxm } from './io/importCar';
import { openFile, saveFile } from './io/files';
import { primitiveGeometry, triCount } from './render/geometry';
import { Viewport, type GizmoMode, type Hit, type ViewName } from './render/viewport';
import { exportDialog, shortcutsDialog, startScreen } from './ui/dialogs';
import { btn, h, icon, menu, toast } from './ui/dom';
import { Library } from './ui/library';
import { Outliner } from './ui/outliner';
import { Properties } from './ui/properties';

// Wires the window together: top bar, parts tree / add tab on the left, the 3D view with its
// toolbar in the middle, properties on the right, and the keyboard.

const $ = (id: string) => document.getElementById(id)!;

// ---------- the car ----------

const restored = Store.restore();
const firstCar: Car = restored ? clone(restored.car) : buildTemplate(TEMPLATES[0]);
regenerateAll(firstCar);
const store = new Store(firstCar);

// ---------- view ----------

let xray = false;
let showCuts = true;
let grid = true;
let preview: Car | null = null;

const viewport = new Viewport($('canvas-host'), {
  pick: (hit, e) => pick(hit, e.shiftKey || e.ctrlKey || e.metaKey),
  dblpick: (hit) => {
    if (!hit) { store.select({ focus: null, shapes: [] }); return; }
    store.select({ focus: hit.partId, parts: [], shapes: hit.shapeId ? [`${hit.partId}/${hit.shapeId}`] : [] });
  },
  dragStart: () => {
    dragPivot = viewport.selectionPivot();
    if (!actions.beginDrag(dragPivot)) dragOk = false;
    else dragOk = true;
  },
  drag: (delta, scale) => { if (dragOk) actions.drag(delta, scale, viewport.mode, dragPivot); },
  dragEnd: () => {
    if (dragOk) actions.endDrag();
    else { store.emit('car'); }
    dragOk = false;
  },
  contextMenu: (hit, e) => contextMenu(hit, e),
});
let dragPivot: THREE.Matrix4 | null = null;
let dragOk = false;

const actions = new Actions(store, { toast, viewTarget: () => viewport.controls.target.clone() });

function pick(hit: Hit | null, add: boolean) {
  const sel = store.sel;
  if (!hit) {
    if (sel.focus) store.select({ shapes: [] });
    else store.select({ parts: [], shapes: [] });
    return;
  }
  if (sel.focus && hit.partId === sel.focus && hit.shapeId) {
    const key = `${hit.partId}/${hit.shapeId}`;
    const shapes = add ? (sel.shapes.includes(key) ? sel.shapes.filter((k) => k !== key) : [...sel.shapes, key]) : [key];
    store.select({ shapes, parts: [] });
    return;
  }
  const id = hit.partId;
  const parts = add ? (sel.parts.includes(id) ? sel.parts.filter((k) => k !== id) : [...sel.parts, id]) : [id];
  store.select({ focus: null, parts, shapes: [] });
}

function focusPart(id: string | null) {
  store.select({ focus: id, parts: id ? [] : store.sel.parts, shapes: [] });
  if (id) frameSelection(id);
}

function frameSelection(onlyPart?: string) {
  const car = store.car;
  const box = new THREE.Box3();
  const ids = onlyPart ? [onlyPart] : store.sel.shapes.length ? [...new Set(store.sel.shapes.map((k) => k.split('/')[0]))] : store.sel.parts;
  for (const id of ids) {
    const p = store.part(id);
    if (!p) continue;
    let pieces = resolvePart(car, p);
    if (!onlyPart && store.sel.shapes.length) pieces = pieces.filter((x) => store.sel.shapes.includes(`${id}/${x.shape.id}`));
    box.union(piecesBox(pieces));
  }
  viewport.frame(box.isEmpty() ? undefined : box);
}

function refreshView() {
  const sel = store.sel;
  viewport.setCar(preview ?? store.car, { focus: sel.focus, selectedParts: new Set(sel.parts), selectedShapes: new Set(sel.shapes), xray, showCuts });
}

// ---------- panels ----------

const leftTabs = { parts: $('tab-parts'), add: $('tab-add') };
const outliner = new Outliner($('outliner'), store, actions, focusPart);
const library = new Library($('library'), store, actions);
const props = new Properties($('props'), store, actions, {
  refsChanged: () => viewport.setRefs(store.car.refs ?? []),
  previewPreset: (part, params) => {
    if (!part || !params) { preview = null; refreshView(); return; }
    const c = clone(store.car);
    const p = c.parts.find((x) => x.id === part.id);
    if (!p?.gen) return;
    p.gen.params = { ...params };
    regenerateAll(c);
    preview = c;
    refreshView();
  },
  drop: () => actions.drop((from, ex) => viewport.castDown(from, ex)),
});

let tab: 'parts' | 'add' = 'parts';
function setTab(t: 'parts' | 'add') {
  tab = t;
  leftTabs.parts.classList.toggle('on', t === 'parts');
  leftTabs.add.classList.toggle('on', t === 'add');
  $('outliner').hidden = t !== 'parts';
  $('library').hidden = t !== 'add';
  if (t === 'add') library.render();
}
leftTabs.parts.onclick = () => setTab('parts');
leftTabs.add.onclick = () => setTab('add');

// ---------- top bar ----------

const undoBtn = btn('', () => doUndo(), { icon: 'undo', class: 'icon', title: 'Undo (Ctrl+Z)' });
const redoBtn = btn('', () => doRedo(), { icon: 'redo', class: 'icon', title: 'Redo (Ctrl+Y)' });
const carName = h('span', { class: 'car-name' });
$('top').append(
  h('div', { class: 'brand' }, icon('car'), h('b', {}, 'Low Poly Car Builder')),
  btn('New', () => newCar(), { icon: 'plus', title: 'Start a new car' }),
  btn('Open', () => void openAny(), { icon: 'folder', title: 'Open a .lpcar project or a Roblox .rbxm car' }),
  btn('Save', () => void saveProject(), { icon: 'save', title: 'Save the project (Ctrl+S)' }),
  h('span', { class: 'sep' }),
  undoBtn, redoBtn,
  h('span', { class: 'sep' }),
  carName,
  h('span', { class: 'grow' }),
  btn('Export', () => exportDialog(store), { icon: 'export', class: 'primary', title: 'Export for Roblox (Ctrl+E)' }),
  btn('', () => shortcutsDialog(), { icon: 'help', class: 'icon', title: 'Shortcuts and help' }),
);

function doUndo() {
  const l = store.undo();
  if (l) toast(`Undid: ${l}`, 1500);
}
function doRedo() {
  const l = store.redo();
  if (l) toast(`Redid: ${l}`, 1500);
}
function newCar() {
  startScreen(store, { onOpenFile: () => void openAny() });
}

async function openAny() {
  const f = await openFile('.lpcar,.json,.rbxm');
  if (f) loadBytes(f.name, f.bytes);
}

function loadBytes(name: string, bytes: Uint8Array) {
  try {
    if (/\.rbxm$/i.test(name)) {
      const { car, notes } = importRbxm(bytes, name);
      store.load(car, `Open ${name}`);
      toast(notes[0] ?? `Opened ${car.name}. Every piece can be edited.`, 5000);
    } else {
      const car = JSON.parse(new TextDecoder().decode(bytes)) as Car;
      if (car?.version !== 2 || !Array.isArray(car.parts)) throw new Error('this is not a Low Poly Car Builder project');
      store.load(car, `Open ${name}`);
      toast(`Opened ${car.name}.`);
    }
    viewport.setRefs(store.car.refs ?? []);
    viewport.frame();
  } catch (e) {
    toast(`Could not open ${name}: ${(e as Error).message}`, 6000);
  }
}

async function saveProject() {
  const where = await saveFile(`${safeName(store.car.name)}.lpcar`, new TextEncoder().encode(JSON.stringify(store.car)));
  if (where) { store.dirty = false; toast(`Saved to ${where}.`); }
}

// ---------- view toolbar ----------

const modeBtns = new Map<GizmoMode, HTMLButtonElement>();
const modes: [GizmoMode, string, string][] = [['select', 'select', 'Select (Q)'], ['translate', 'move', 'Move (W)'], ['rotate', 'rotate', 'Turn (E)'], ['scale', 'scale', 'Size (R)']];
for (const [m, ic, title] of modes) modeBtns.set(m, btn('', () => setMode(m), { icon: ic, class: 'icon', title }));
function setMode(m: GizmoMode) {
  viewport.setMode(m);
  for (const [k, b] of modeBtns) b.classList.toggle('on', k === m);
}
const spaceBtn = btn('Local', () => {
  viewport.space = viewport.space === 'local' ? 'world' : 'local';
  spaceBtn.querySelector('span')!.textContent = viewport.space === 'local' ? 'Local' : 'World';
  viewport.placeGizmo();
}, { class: 'small', title: 'Move along the shape\'s own axes or the car\'s axes' });
const snapBtn = btn('', () => toggleSnap(), { icon: 'grid', class: 'icon on', title: 'Snap (G)' });
const snapStep = h('select', { class: 'small', title: 'Snap step' },
  ['0.05', '0.1', '0.25', '0.5', '1'].map((v) => h('option', { value: v, selected: v === '0.1' }, `${v} stud`)));
snapStep.onchange = () => { viewport.snap.move = Number(snapStep.value); viewport.applySnap(); };
function toggleSnap() {
  viewport.snap.on = !viewport.snap.on;
  snapBtn.classList.toggle('on', viewport.snap.on);
  viewport.applySnap();
  toast(viewport.snap.on ? 'Snap on' : 'Snap off', 1000);
}
const viewSel = h('select', { class: 'small', title: 'View (1 front, 3 side, 7 top, 5 3D)' },
  ([['persp', '3D'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left side'], ['right', 'Right side'], ['top', 'Top'], ['bottom', 'Bottom']] as [ViewName, string][]).map(([v, l]) => h('option', { value: v }, l)));
viewSel.onchange = () => setView(viewSel.value as ViewName);
function setView(v: ViewName) {
  viewport.setView(v);
  viewSel.value = v;
}
const xrayBtn = btn('', () => { xray = !xray; xrayBtn.classList.toggle('on', xray); refreshView(); }, { icon: 'xray', class: 'icon', title: 'See-through (X)' });
const cutsBtn = btn('', () => { showCuts = !showCuts; cutsBtn.classList.toggle('on', showCuts); refreshView(); }, { icon: 'cut', class: 'icon on', title: 'Show cut shapes while editing a part' });
const gridBtn = btn('', () => { grid = !grid; gridBtn.classList.toggle('on', grid); viewport.setGrid(grid); }, { icon: 'measure', class: 'icon on', title: 'Floor grid' });
$('tools').append(
  h('div', { class: 'tool-group' }, [...modeBtns.values()]),
  h('div', { class: 'tool-group' }, spaceBtn, snapBtn, snapStep),
  h('div', { class: 'tool-group' }, viewSel, btn('', () => frameSelection(), { icon: 'frame', class: 'icon', title: 'Look at the selection (F)' }), xrayBtn, cutsBtn, gridBtn),
);
setMode('translate');

// breadcrumb over the view while editing one part
function crumb() {
  const f = store.part(store.sel.focus);
  const el = $('crumb');
  if (!f) { el.hidden = true; return; }
  el.hidden = false;
  el.replaceChildren(
    btn(store.car.name, () => focusPart(null), { class: 'small', title: 'Back to the whole car (Esc)' }),
    h('span', {}, '›'),
    h('b', {}, f.name),
    h('span', { class: 'hint' }, isEditable(f) ? 'Click a shape to change it. Add shapes from the Add tab.' : 'Made with sliders: shapes show here, change them on the right.'),
  );
}

// ---------- status bar ----------

function status() {
  const car = preview ?? store.car;
  let tris = 0, shapes = 0;
  for (const p of car.parts) {
    if (p.hidden) continue;
    for (const piece of resolvePart(car, p)) { if (piece.cut) continue; shapes++; tris += triCount(primitiveGeometry(piece.kind, piece.size)); }
  }
  const sel = store.sel;
  const what = sel.shapes.length ? `${sel.shapes.length} shape${sel.shapes.length > 1 ? 's' : ''} selected` : sel.parts.length ? `${sel.parts.length} part${sel.parts.length > 1 ? 's' : ''} selected` : 'Nothing selected';
  $('status').replaceChildren(
    h('span', {}, what),
    h('span', {}, `${car.parts.length} parts`),
    h('span', { title: 'Roblox parts the game will build (before unions)' }, `${shapes} shapes`),
    h('span', { title: 'Roughly what Roblox draws' }, `~${tris.toLocaleString()} triangles`),
    h('span', { title: 'Car size in studs (1 stud = 0.28 m)' }, `${car.params.length.toFixed(1)} × ${car.params.width.toFixed(1)} studs`),
    h('span', { class: 'grow' }),
    h('span', { class: 'hint' }, store.canUndo ? `Undo: ${store.undoLabel}` : ''),
  );
}

// ---------- keeping everything up to date ----------

let statusTimer = 0;
store.on((why) => {
  if (why !== 'live' && preview) preview = null;
  refreshView();
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(status, why === 'live' ? 200 : 0);
  if (why === 'live') return;
  outliner.render();
  props.render();
  if (tab === 'add') library.render();
  crumb();
  undoBtn.disabled = !store.canUndo;
  redoBtn.disabled = !store.canRedo;
  undoBtn.title = store.canUndo ? `Undo ${store.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
  redoBtn.title = store.canRedo ? `Redo ${store.redoLabel} (Ctrl+Y)` : 'Nothing to redo';
  carName.textContent = store.car.name;
  document.title = `${store.car.name} - Low Poly Car Builder`;
});

// ---------- context menu ----------

function contextMenu(hit: Hit | null, e: MouseEvent) {
  const sel = store.sel;
  if (hit) {
    if (sel.focus === hit.partId && hit.shapeId) {
      const key = `${hit.partId}/${hit.shapeId}`;
      if (!sel.shapes.includes(key)) store.select({ shapes: [key], parts: [] });
    } else if (!sel.parts.includes(hit.partId)) store.select({ focus: null, parts: [hit.partId], shapes: [] });
  }
  if (store.sel.shapes.length) {
    const editable = store.selectedShapes().every((x) => isEditable(x.part));
    menu([
      { label: 'Duplicate', key: 'Ctrl+D', run: () => actions.duplicateShapes(), disabled: !editable },
      { label: 'Copy', key: 'Ctrl+C', run: () => actions.copy() },
      { label: 'Paste', key: 'Ctrl+V', run: () => actions.paste(), disabled: !actions.clipboard },
      { label: 'Mirror to the other side', key: 'M', run: () => actions.mirrorShapes(true), disabled: !editable },
      { label: 'Mirror as separate copies', run: () => actions.mirrorShapes(false), disabled: !editable },
      { label: 'Split copies into shapes', run: () => actions.bakeShapes(), disabled: !editable },
      { label: 'Make a new part from these', run: () => actions.groupShapes(), disabled: !editable },
      { label: 'Drop onto the car', run: () => actions.drop((f, x) => viewport.castDown(f, x)), disabled: !editable },
      { label: 'Look at it', key: 'F', run: () => frameSelection() },
      '-',
      { label: 'Delete', key: 'Del', run: () => actions.deleteSelection(), disabled: !editable },
    ], e.clientX, e.clientY);
    return;
  }
  const parts = store.selectedParts();
  if (parts.length) {
    const ids = parts.map((p) => p.id);
    const one: Part | undefined = parts.length === 1 ? parts[0] : undefined;
    menu([
      { label: 'Edit shapes', key: 'Dbl-click', run: () => focusPart(ids[0]), disabled: !one },
      { label: 'Duplicate', key: 'Ctrl+D', run: () => actions.duplicateParts(ids) },
      { label: 'Linked copy (changes together)', run: () => actions.duplicateParts(ids, true) },
      { label: 'Mirror copy on the other side', run: () => actions.mirrorParts(ids) },
      { label: 'Copy', key: 'Ctrl+C', run: () => actions.copy() },
      { label: 'Paste', key: 'Ctrl+V', run: () => actions.paste(), disabled: !actions.clipboard },
      { label: 'Save to My parts', run: () => { saveToLibrary(store.car, one!); toast(`Saved ${one!.name} to My parts.`); }, disabled: !one },
      '-',
      { label: 'Hide', key: 'H', run: () => actions.setPartFlag(ids, 'hidden', true) },
      { label: 'Hide everything else', run: () => actions.isolate(ids) },
      { label: 'Show everything', key: 'Alt+H', run: () => actions.showAll() },
      { label: parts.every((p) => p.locked) ? 'Unlock' : 'Lock', run: () => actions.setPartFlag(ids, 'locked', !parts.every((p) => p.locked)) },
      { label: parts.every((p) => p.noExport) ? 'Include in export' : 'Leave out of export', run: () => actions.setPartFlag(ids, 'noExport', !parts.every((p) => p.noExport)) },
      '-',
      { label: 'Delete', key: 'Del', run: () => actions.deleteSelection() },
    ], e.clientX, e.clientY);
    return;
  }
  menu([
    { label: 'Paste', key: 'Ctrl+V', run: () => actions.paste(), disabled: !actions.clipboard },
    { label: 'Show everything', key: 'Alt+H', run: () => actions.showAll() },
    { label: 'Look at the whole car', key: 'F', run: () => viewport.frame() },
  ], e.clientX, e.clientY);
}

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, [contenteditable]') && e.key !== 'Escape') return;
  if (document.getElementById('modal')!.classList.contains('open')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const sel = store.sel;
  const done = () => e.preventDefault();
  if (ctrl) {
    if (k === 'z' && !e.shiftKey) { doUndo(); return done(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { doRedo(); return done(); }
    if (k === 's') { void saveProject(); return done(); }
    if (k === 'e') { exportDialog(store); return done(); }
    if (k === 'o') { void openAny(); return done(); }
    if (k === 'c') { actions.copy(); return done(); }
    if (k === 'v') { actions.paste(); return done(); }
    if (k === 'd') { if (sel.shapes.length) actions.duplicateShapes(); else if (sel.parts.length) actions.duplicateParts(sel.parts); return done(); }
    if (k === 'a') { if (sel.focus) store.select({ shapes: (store.part(sel.focus)?.shapes ?? []).map((s) => `${sel.focus}/${s.id}`) }); else store.select({ parts: store.car.parts.filter((p) => !p.hidden).map((p) => p.id) }); return done(); }
    if (k === '1') { setView('back'); return done(); }
    if (k === '3') { setView('left'); return done(); }
    if (k === '7') { setView('bottom'); return done(); }
    return;
  }
  if (e.altKey && k === 'h') { actions.showAll(); return done(); }
  switch (k) {
    case 'escape':
      if (sel.shapes.length) store.select({ shapes: [] });
      else if (sel.focus) focusPart(null);
      else store.select({ parts: [] });
      return done();
    case 'delete': case 'backspace': actions.deleteSelection(); return done();
    case 'q': setMode('select'); return;
    case 'w': setMode('translate'); return;
    case 'e': setMode('rotate'); return;
    case 'r': setMode('scale'); return;
    case 'g': toggleSnap(); return;
    case 'x': xrayBtn.click(); return;
    case 'f': if (sel.parts.length || sel.shapes.length) frameSelection(); else viewport.frame(); return;
    case 'h': if (sel.parts.length) actions.setPartFlag(sel.parts, 'hidden', true); else if (sel.shapes.length) actions.patchShapes('Hide shapes', (s) => { s.hidden = true; }); return;
    case 'm': if (sel.shapes.length) { const on = !store.selectedShapes().every((x) => x.shape.mirror); actions.patchShapes(on ? 'Mirror on' : 'Mirror off', (s) => { s.mirror = on; }); } return;
    case '1': setView('front'); return;
    case '3': setView('right'); return;
    case '7': setView('top'); return;
    case '5': setView('persp'); return;
    case 'tab': setTab(tab === 'parts' ? 'add' : 'parts'); return done();
  }
});

// ---------- files dropped on the window ----------

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (/\.(png|jpe?g|webp)$/i.test(f.name)) { toast('Add reference pictures from Car settings (click empty space, then Reference images).'); return; }
  loadBytes(f.name, new Uint8Array(await f.arrayBuffer()));
});

window.addEventListener('beforeunload', () => store.saveNow());
document.addEventListener('lpcb-frame', () => { viewport.setRefs(store.car.refs ?? []); viewport.frame(); });

// ---------- start ----------

setTab('parts');
store.emit('car');
viewport.setRefs(store.car.refs ?? []);
viewport.frame();
startScreen(store, { onOpenFile: () => void openAny(), restore: restored, first: true });
