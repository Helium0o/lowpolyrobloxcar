import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { isUnion, partMatrix, piecesBox, resolvePart, type Piece } from '../core/resolve';
import type { Car, Part, RefImage } from '../core/types';
import { piecesKey, unionGeometry } from './csg';
import { primitiveGeometry } from './geometry';

// The 3D view. It only draws when something changes (orbit, edit, resize), asks for the low-power GPU,
// caps the pixel ratio and the frame rate while dragging, so an idle editor uses next to no GPU.
// Each part is cached by its exact shapes; editing one part never rebuilds the others.

export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale';
export type ViewName = 'persp' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface Hit {
  partId: string;
  shapeId?: string;
  point: THREE.Vector3;
  normal?: THREE.Vector3;
}

export interface ViewportEvents {
  pick(hit: Hit | null, e: PointerEvent): void;
  dblpick(hit: Hit | null, e: MouseEvent): void;
  /** Gizmo drag: delta is the change in car space since the drag started (scale is the gizmo's scale). */
  dragStart(): void;
  drag(delta: THREE.Matrix4, scale: THREE.Vector3): void;
  dragEnd(): void;
  contextMenu(hit: Hit | null, e: MouseEvent): void;
}

export interface ViewState {
  focus: string | null;
  selectedParts: Set<string>;
  /** "partId/shapeId" */
  selectedShapes: Set<string>;
  xray: boolean;
  showCuts: boolean;
}

const MAX_DPR = 1.5;
const FRAME_MS = 1000 / 60;

interface PartView {
  key: string;
  group: THREE.Group;
  pieces: Piece[];
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly persp: THREE.PerspectiveCamera;
  readonly ortho: THREE.OrthographicCamera;
  camera: THREE.Camera;
  readonly controls: OrbitControls;
  readonly tc: TransformControls;
  private proxy = new THREE.Object3D();
  private carRoot = new THREE.Group();
  private selRoot = new THREE.Group();
  private refRoot = new THREE.Group();
  private parts = new Map<string, PartView>();
  private mats = new Map<string, THREE.Material>();
  private cutMat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.2, depthWrite: false });
  private edgeMat = new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true, opacity: 0.95 });
  private edgeMat2 = new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true, opacity: 0.35 });
  private pending = false;
  private lastFrame = 0;
  private dragStartM = new THREE.Matrix4();
  private dragging = false;
  private down: { x: number; y: number; t: number } | null = null;
  private grid: THREE.GridHelper;
  car: Car | null = null;
  state: ViewState = { focus: null, selectedParts: new Set(), selectedShapes: new Set(), xray: false, showCuts: true };
  view: ViewName = 'persp';
  mode: GizmoMode = 'translate';
  snap = { move: 0.1, angle: 15, on: true };
  space: 'local' | 'world' = 'local';
  onRender?: () => void;

  constructor(private host: HTMLElement, private ev: ViewportEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setClearColor(0xeceef2);
    host.appendChild(this.renderer.domElement);

    this.persp = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
    this.persp.position.set(-17, 9, -19);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 500);
    this.camera = this.persp;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9a, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-6, 14, -9);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(8, 4, 10);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(80, 80, 0xb8bcc6, 0xd4d7de);
    (this.grid.material as THREE.Material).depthWrite = false;
    this.scene.add(this.grid);
    const axisZ = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.005, -40), new THREE.Vector3(0, 0.005, 40)]), new THREE.LineBasicMaterial({ color: 0x8fa6d8 }));
    this.scene.add(axisZ);
    this.scene.add(this.shadowBlob());
    this.scene.add(this.refRoot, this.carRoot, this.selRoot, this.proxy);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.requestRender());

    this.tc = new TransformControls(this.camera, this.renderer.domElement);
    this.tc.setSize(0.8);
    this.tc.addEventListener('change', () => this.requestRender());
    this.tc.addEventListener('dragging-changed', (e) => {
      const on = (e as unknown as { value: boolean }).value;
      this.controls.enabled = !on;
      if (on) {
        this.dragging = true;
        this.proxy.updateMatrix();
        this.dragStartM.copy(this.proxy.matrix);
        this.ev.dragStart();
      } else {
        this.dragging = false;
        this.ev.dragEnd();
      }
    });
    this.tc.addEventListener('objectChange', () => {
      if (!this.dragging) return;
      this.proxy.updateMatrix();
      const noScale = new THREE.Matrix4().compose(this.proxy.position, this.proxy.quaternion, new THREE.Vector3(1, 1, 1));
      const start = this.dragStartM.clone();
      const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
      start.decompose(sp, sq, ss);
      const startNoScale = new THREE.Matrix4().compose(sp, sq, new THREE.Vector3(1, 1, 1));
      const delta = noScale.multiply(startNoScale.invert());
      this.ev.drag(delta, this.proxy.scale.clone());
    });
    this.scene.add(this.tc.getHelper());
    this.applySnap();

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || this.dragging || (this.tc as unknown as { dragging: boolean }).dragging) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || e.button !== 0) return;
      this.ev.pick(this.hitTest(e.clientX, e.clientY), e);
    });
    el.addEventListener('dblclick', (e) => this.ev.dblpick(this.hitTest(e.clientX, e.clientY), e));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.ev.contextMenu(this.hitTest(e.clientX, e.clientY), e);
    });
    new ResizeObserver(() => this.resize()).observe(host);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.requestRender());
    this.resize();
  }

  // ---------- frame loop ----------

  requestRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.pending = false;
    if (now - this.lastFrame < FRAME_MS - 1) { this.requestRender(); return; }
    this.lastFrame = now;
    this.renderer.render(this.scene, this.camera);
    this.onRender?.();
  };
  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
    this.requestRender();
  }
  private updateOrtho() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const half = 11;
    this.ortho.left = (-half * w) / h;
    this.ortho.right = (half * w) / h;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }
  private shadowBlob(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(30,30,40,0.32)');
    grad.addColorStop(1, 'rgba(30,30,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 21), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    return m;
  }

  // ---------- materials ----------

  private material(p: Piece, xray: boolean): THREE.Material {
    const t = p.transparency;
    const key = `${p.color}|${p.material}|${t.toFixed(2)}|${xray}`;
    let m = this.mats.get(key);
    if (m) return m;
    const color = new THREE.Color(p.color);
    if (p.material === 'Neon') {
      m = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.15) });
    } else if (p.material === 'Metal' || p.material === 'DiamondPlate' || p.material === 'Foil') {
      m = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x9aa0aa, flatShading: true });
    } else if (p.material === 'Glass') {
      m = new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0xffffff, flatShading: true, transparent: true, opacity: Math.max(0.35, 1 - t * 0.9), depthWrite: false });
    } else {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    }
    if (t > 0.01 && p.material !== 'Glass') { m.transparent = true; m.opacity = Math.max(0.12, 1 - t); m.depthWrite = t < 0.5; }
    if (xray) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.depthWrite = false; }
    this.mats.set(key, m);
    return m;
  }

  // ---------- car ----------

  setCar(car: Car, state: ViewState) {
    this.car = car;
    this.state = state;
    const seen = new Set<string>();
    for (const part of car.parts) {
      seen.add(part.id);
      const pieces = part.hidden ? [] : resolvePart(car, part);
      const focused = state.focus === part.id;
      const key = `${piecesKey(pieces)}#${focused}#${!!state.focus}#${isUnion(car, part)}#${pieces.map((p) => p.color + p.material + p.transparency).join()}#${state.xray}#${state.showCuts}`;
      const old = this.parts.get(part.id);
      if (old && old.key === key) { old.pieces = pieces; continue; }
      if (old) this.carRoot.remove(old.group);
      const group = this.buildPart(car, part, pieces, focused, state);
      this.carRoot.add(group);
      this.parts.set(part.id, { key, group, pieces });
    }
    for (const [id, v] of this.parts) if (!seen.has(id)) { this.carRoot.remove(v.group); this.parts.delete(id); }
    this.updateSelection();
    this.requestRender();
  }

  private buildPart(car: Car, part: Part, pieces: Piece[], focused: boolean, state: ViewState): THREE.Group {
    const g = new THREE.Group();
    g.userData.partId = part.id;
    const union = isUnion(car, part);
    const dim = !!state.focus && !focused;
    if (union && !focused) {
      const geo = unionGeometry(pieces);
      const first = pieces.find((p) => !p.cut);
      if (geo && first) {
        const mesh = new THREE.Mesh(geo, this.material(first, state.xray || dim));
        mesh.userData = { partId: part.id };
        g.add(mesh);
      }
      return g;
    }
    for (const p of pieces) {
      if (p.cut) {
        if (!focused || !state.showCuts) continue;
        const mesh = new THREE.Mesh(primitiveGeometry(p.kind, p.size), this.cutMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(p.m);
        mesh.userData = { partId: part.id, shapeId: p.shape.id, cut: true };
        g.add(mesh);
        continue;
      }
      const mesh = new THREE.Mesh(primitiveGeometry(p.kind, p.size), this.material(p, state.xray || dim));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(p.m);
      mesh.userData = { partId: part.id, shapeId: p.shape.id };
      g.add(mesh);
    }
    return g;
  }

  /** Selection outlines and the gizmo. */
  updateSelection() {
    this.selRoot.clear();
    const car = this.car;
    if (!car) return;
    const st = this.state;
    const addEdges = (p: Piece, mat: THREE.LineBasicMaterial) => {
      const e = new THREE.LineSegments(edgesOf(p), mat);
      e.matrixAutoUpdate = false;
      e.matrix.copy(p.m);
      e.renderOrder = 10;
      this.selRoot.add(e);
    };
    if (st.focus) {
      const v = this.parts.get(st.focus);
      if (v) {
        const box = piecesBox(v.pieces, true);
        if (!box.isEmpty()) {
          const h = new THREE.Box3Helper(box.expandByScalar(0.05), 0x3aa0ff);
          (h.material as THREE.LineBasicMaterial).depthTest = false;
          h.renderOrder = 9;
          this.selRoot.add(h);
        }
      }
    }
    for (const id of st.selectedParts) {
      const v = this.parts.get(id);
      const part = car.parts.find((p) => p.id === id);
      if (!v || !part) continue;
      if (isUnion(car, part) && st.focus !== id) {
        const mesh = v.group.children[0] as THREE.Mesh | undefined;
        if (mesh?.geometry) {
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), this.edgeMat);
          e.renderOrder = 10;
          this.selRoot.add(e);
        }
      } else for (const p of v.pieces) if (!p.cut) addEdges(p, p.copy || p.mirrored ? this.edgeMat2 : this.edgeMat);
    }
    for (const key of st.selectedShapes) {
      const [pid, sid] = key.split('/');
      const v = this.parts.get(pid);
      if (!v) continue;
      for (const p of v.pieces) if (p.shape.id === sid) addEdges(p, p.copy || p.mirrored ? this.edgeMat2 : this.edgeMat);
    }
    this.placeGizmo();
    this.requestRender();
  }

  /** Pivot of the current selection, or null when nothing can be moved. */
  selectionPivot(): THREE.Matrix4 | null {
    const car = this.car;
    if (!car) return null;
    const st = this.state;
    if (st.selectedShapes.size === 1) {
      const [key] = st.selectedShapes;
      const [pid, sid] = key.split('/');
      const p = this.parts.get(pid)?.pieces.find((x) => x.shape.id === sid && x.copy === 0 && !x.mirrored);
      if (p) return this.space === 'local' ? p.m.clone() : new THREE.Matrix4().setPosition(new THREE.Vector3().setFromMatrixPosition(p.m));
    }
    if (st.selectedParts.size === 1 && !st.selectedShapes.size) {
      const [id] = st.selectedParts;
      const part = car.parts.find((p) => p.id === id);
      if (!part || part.wheel) return null;
      const m = partMatrix(car, part);
      // put the gizmo at the middle of the part, keeping the part's rotation
      const box = piecesBox(this.parts.get(id)?.pieces ?? [], false);
      if (!box.isEmpty()) m.setPosition(box.getCenter(new THREE.Vector3()));
      return this.space === 'local' ? m : new THREE.Matrix4().setPosition(new THREE.Vector3().setFromMatrixPosition(m));
    }
    const pieces: Piece[] = [];
    for (const key of st.selectedShapes) {
      const [pid, sid] = key.split('/');
      pieces.push(...(this.parts.get(pid)?.pieces.filter((x) => x.shape.id === sid && x.copy === 0 && !x.mirrored) ?? []));
    }
    for (const id of st.selectedParts) {
      const part = car.parts.find((p) => p.id === id);
      if (part?.wheel) continue;
      pieces.push(...(this.parts.get(id)?.pieces ?? []));
    }
    if (!pieces.length) return null;
    const box = piecesBox(pieces, true);
    return new THREE.Matrix4().setPosition(box.getCenter(new THREE.Vector3()));
  }

  placeGizmo() {
    if (this.dragging) return;
    const m = this.mode === 'select' ? null : this.selectionPivot();
    if (!m) { this.tc.detach(); return; }
    m.decompose(this.proxy.position, this.proxy.quaternion, this.proxy.scale);
    this.proxy.scale.set(1, 1, 1);
    this.proxy.updateMatrix();
    if (this.tc.object !== this.proxy) this.tc.attach(this.proxy);
    this.tc.setMode(this.mode === 'select' ? 'translate' : this.mode);
    this.tc.setSpace(this.mode === 'scale' ? 'local' : this.space);
    this.requestRender();
  }

  setMode(mode: GizmoMode) {
    this.mode = mode;
    this.placeGizmo();
  }

  applySnap() {
    this.tc.setTranslationSnap(this.snap.on && this.snap.move > 0 ? this.snap.move : null);
    this.tc.setRotationSnap(this.snap.on && this.snap.angle > 0 ? THREE.MathUtils.degToRad(this.snap.angle) : null);
    this.tc.setScaleSnap(this.snap.on ? 0.05 : null);
  }

  // ---------- picking ----------

  hitTest(clientX: number, clientY: number): Hit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.carRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.partId) meshes.push(o); });
    // in focus mode, cut shapes can be clicked too (they draw through the body)
    for (const o of meshes) o.updateMatrixWorld();
    const hits = ray.intersectObjects(meshes, false);
    const focus = this.state.focus;
    const pick = hits.find((h) => !h.object.userData.cut || h.object.userData.partId === focus) ?? null;
    if (!pick) return null;
    const n = pick.face?.normal?.clone().transformDirection(pick.object.matrixWorld);
    return { partId: pick.object.userData.partId, shapeId: pick.object.userData.shapeId, point: pick.point, normal: n };
  }

  /** Car-space ray hit against everything except the given parts (for "drop onto surface"). */
  castDown(from: THREE.Vector3, exclude: Set<string>): number | null {
    const ray = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0));
    const meshes: THREE.Object3D[] = [];
    this.carRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.partId && !exclude.has(o.userData.partId) && !o.userData.cut) meshes.push(o); });
    for (const o of meshes) o.updateMatrixWorld();
    const h = ray.intersectObjects(meshes, false)[0];
    return h ? h.point.y : null;
  }

  // ---------- views ----------

  setView(v: ViewName) {
    this.view = v;
    const t = this.controls.target.clone();
    if (v === 'persp') {
      this.camera = this.persp;
      if (this.persp.position.distanceTo(t) < 1) this.persp.position.set(-17, 9, -19);
    } else {
      this.camera = this.ortho;
      const d = 60;
      const dir: Record<Exclude<ViewName, 'persp'>, [number, number, number]> = {
        front: [0, 0, -1], back: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
      };
      const [x, y, z] = dir[v];
      this.ortho.position.set(t.x + x * d, t.y + y * d, t.z + z * d);
      this.ortho.up.set(0, 1, 0);
      if (v === 'top') this.ortho.up.set(0, 0, -1);
      if (v === 'bottom') this.ortho.up.set(0, 0, 1);
      this.ortho.lookAt(t);
    }
    this.controls.object = this.camera;
    this.controls.enableRotate = v === 'persp';
    this.tc.camera = this.camera;
    this.controls.update();
    this.updateRefs();
    this.requestRender();
  }

  /** Point the camera at the car or the selection. */
  frame(box?: THREE.Box3) {
    const car = this.car;
    if (!box) {
      box = new THREE.Box3();
      for (const v of this.parts.values()) box.union(piecesBox(v.pieces));
    }
    if (box.isEmpty() && car) box.set(new THREE.Vector3(-3, 0, -8), new THREE.Vector3(3, 5, 8));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(1.5, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(-0.6, 0.35, -0.7).normalize();
    this.controls.target.copy(c);
    if (this.camera === this.persp) {
      this.persp.position.copy(c).addScaledVector(dir, r / Math.sin(THREE.MathUtils.degToRad(this.persp.fov / 2)) * 0.9);
    } else {
      this.ortho.position.copy(c).addScaledVector(dir, 60);
      this.ortho.zoom = Math.max(0.2, Math.min(8, 10 / r));
      this.ortho.updateProjectionMatrix();
    }
    this.controls.update();
    this.requestRender();
  }

  setGrid(on: boolean) {
    this.grid.visible = on;
    this.requestRender();
  }

  // ---------- reference images ----------

  private refTextures = new Map<string, THREE.Texture>();
  private refs: RefImage[] = [];

  setRefs(refs: RefImage[]) {
    this.refs = refs;
    this.updateRefs();
  }
  private updateRefs() {
    this.refRoot.clear();
    const car = this.car;
    for (const r of this.refs) {
      if (!r.visible) continue;
      // side images show in the left / right views, the others in their own view (and faintly in 3D)
      const viewMatch = this.view === r.view || (r.view === 'side' && (this.view === 'left' || this.view === 'right')) || this.view === 'persp';
      if (!viewMatch) continue;
      let tex = this.refTextures.get(r.id);
      if (!tex) {
        const img = new Image();
        tex = new THREE.Texture(img);
        img.onload = () => { tex!.needsUpdate = true; this.updateRefs(); };
        img.src = r.dataUrl;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.refTextures.set(r.id, tex);
      }
      const img = tex.image as HTMLImageElement;
      if (!img.width) continue;
      const w = r.width, h = (r.width * img.height) / img.width;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: this.view === 'persp' ? r.opacity * 0.4 : r.opacity, depthWrite: false, side: THREE.DoubleSide }));
      const far = (car?.params.width ?? 6) / 2 + 6;
      const [ox, oy] = r.offset;
      switch (r.view) {
        case 'side': mesh.position.set(this.view === 'left' ? far : -far, h / 2 + oy, ox); mesh.rotation.y = Math.PI / 2; if (this.view === 'left') mesh.rotation.y = -Math.PI / 2; mesh.scale.x = this.view === 'left' ? -1 : 1; break;
        case 'front': mesh.position.set(ox, h / 2 + oy, 15); mesh.rotation.y = Math.PI; break;
        case 'back': mesh.position.set(ox, h / 2 + oy, -15); break;
        case 'top': mesh.position.set(ox, -0.05, oy); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.PI; break;
      }
      mesh.renderOrder = -1;
      this.refRoot.add(mesh);
    }
    this.requestRender();
  }

  /** PNG of the current view (for thumbnails). */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

const edgeCache = new Map<string, THREE.EdgesGeometry>();
function edgesOf(p: Piece): THREE.EdgesGeometry {
  const key = `${p.kind}:${p.size.join(',')}`;
  let e = edgeCache.get(key);
  if (!e) {
    e = new THREE.EdgesGeometry(primitiveGeometry(p.kind, p.size), 25);
    edgeCache.set(key, e);
    if (edgeCache.size > 2000) edgeCache.delete(edgeCache.keys().next().value as string);
  }
  return e;
}
