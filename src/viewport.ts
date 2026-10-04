import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildPart, builtBounds, partHasHoles } from './build';
import { ROLES, type Car, type Part, type Role, type Shape, type Vec3 } from './model';
import { hasMirrorCopy, mirrorMatrix, shapeGeometry } from './shapes';
import { baseSpec, exhaustOutlets, makeCtx } from './templates';

// The 3D view. It only draws a frame when something changed (orbit, edit, resize),
// asks the browser for the low-power GPU, caps the pixel ratio and caps frames at 60 per
// second while dragging, so an idle editor uses almost no GPU.

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ViewName = 'persp' | 'front' | 'back' | 'side' | 'top';

export interface Selection {
  partId: string | null;
  shapeId: string | null;
}

export interface ViewportEvents {
  select(sel: Selection): void;
  commitShape(partId: string, shapeId: string, pos: Vec3, rot: Vec3, size: Vec3): void;
  commitPart(partId: string, pivot: Vec3): void;
  live(): void;
}

const MAX_DPR = 1.5;
const FRAME_MS = 1000 / 60;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera;
  private controls: OrbitControls;
  private tc: TransformControls;
  private carRoot = new THREE.Group();
  private fxRoot = new THREE.Group();
  private materials = new Map<Role, THREE.MeshLambertMaterial>();
  private holeMat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.22, depthWrite: false });
  private edgeMat = new THREE.LineBasicMaterial({ color: 0xffc400 });
  private partGroups = new Map<string, THREE.Group>();
  private shapeMeshes = new Map<string, { mesh: THREE.Mesh; mirror?: THREE.Mesh; part: Part; shape: Shape }>();
  private pickables: THREE.Object3D[] = [];
  private outline: THREE.Object3D | null = null;
  private pending = false;
  private lastFrame = 0;
  private car: Car | null = null;
  private sel: Selection = { partId: null, shapeId: null };
  private showHoles = false;
  private dragStart: THREE.Matrix4 | null = null;
  view: ViewName = 'persp';
  snap = { on: true, move: 0.25, angle: 15 };

  constructor(private host: HTMLElement, private ev: ViewportEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setClearColor(0xf2eef4);
    host.appendChild(this.renderer.domElement);

    this.persp = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    this.persp.position.set(-17, 9, -19);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 500);
    this.camera = this.persp;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8494, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, 14, -9);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(8, 4, 10);
    this.scene.add(fill);

    const grid = new THREE.GridHelper(80, 80, 0xd9b9cc, 0xe6d6df);
    (grid.material as THREE.Material).depthWrite = false;
    this.scene.add(grid);
    this.scene.add(this.blobShadow());
    this.scene.add(this.carRoot, this.fxRoot);

    for (const r of ROLES) {
      const m = new THREE.MeshLambertMaterial({ flatShading: true });
      if (r === 'glass') { m.transparent = true; }
      this.materials.set(r, m);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = false; // damping would keep rendering after the mouse stops
    this.controls.addEventListener('change', () => this.requestRender());

    this.tc = new TransformControls(this.camera, this.renderer.domElement);
    this.tc.setSize(0.85);
    this.tc.addEventListener('change', () => this.requestRender());
    this.tc.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      this.controls.enabled = !dragging;
      const obj = this.tc.object;
      if (dragging) {
        obj?.updateMatrix();
        this.dragStart = obj ? obj.matrix.clone() : null;
      } else if (obj) {
        obj.updateMatrix();
        if (!this.dragStart || !this.dragStart.equals(obj.matrix)) this.commitDrag();
      }
    });
    this.tc.addEventListener('objectChange', () => {
      this.syncMirror();
      this.ev.live();
    });
    this.scene.add(this.tc.getHelper());
    this.applySnap();

    this.bindPicking();
    new ResizeObserver(() => this.resize()).observe(host);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.requestRender());
    this.resize();
  }

  // ---------- rendering ----------

  requestRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.pending = false;
    if (now - this.lastFrame < FRAME_MS - 1) {
      this.requestRender();
      return;
    }
    this.lastFrame = now;
    this.renderer.render(this.scene, this.camera);
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
    const half = 12 / this.ortho.zoom;
    this.ortho.left = (-half * w) / h;
    this.ortho.right = (half * w) / h;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  private blobShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(40,20,40,0.35)');
    grad.addColorStop(1, 'rgba(40,20,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 20), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.01;
    return m;
  }

  // ---------- car ----------

  setColors(car: Car) {
    for (const r of ROLES) {
      const m = this.materials.get(r)!;
      m.color.set(car.paint[r]);
      if (r === 'light' || r === 'tail' || r === 'glow') m.emissive.set(car.paint[r]).multiplyScalar(0.55);
      if (r === 'glass') m.opacity = 0.35 + car.glassOpacity * 0.6;
    }
  }

  setCar(car: Car, sel: Selection) {
    this.car = car;
    this.sel = sel;
    this.setColors(car);
    this.tc.detach();
    this.clearGroup(this.carRoot);
    this.partGroups.clear();
    this.shapeMeshes.clear();
    this.pickables = [];

    for (const part of car.parts) {
      const g = new THREE.Group();
      g.position.set(...part.pivot);
      g.visible = !part.hidden;
      g.userData.partId = part.id;
      this.partGroups.set(part.id, g);
      this.carRoot.add(g);
      const cut = partHasHoles(part);
      if (cut) {
        // Show the real cut result, keep the plain shapes around (invisible) for picking.
        const bp = buildPart(part);
        for (const m of bp.meshes) for (const geo of splitByRole(m.positions, m.roles)) {
          const mesh = new THREE.Mesh(geo.geom, this.materials.get(geo.role));
          mesh.userData.display = true;
          g.add(mesh);
        }
      }
      const mm = mirrorMatrix(part.pivot[0]);
      for (const s of part.shapes) {
        if (s.hidden) continue;
        const holeShown = s.hole && (this.showHoles || sel.partId === part.id);
        const mat = s.hole ? this.holeMat : this.materials.get(s.role)!;
        const mesh = new THREE.Mesh(shapeGeometry(s), mat);
        mesh.position.set(...s.pos);
        mesh.rotation.set(...(s.rot.map((d) => THREE.MathUtils.degToRad(d)) as Vec3), 'XYZ');
        mesh.visible = s.hole ? !!holeShown : !cut;
        mesh.userData = { partId: part.id, shapeId: s.id };
        g.add(mesh);
        let mirror: THREE.Mesh | undefined;
        if (hasMirrorCopy(s, part.pivot[0])) {
          mirror = new THREE.Mesh(mesh.geometry, mat);
          mirror.matrixAutoUpdate = false;
          mesh.updateMatrix();
          mirror.matrix.copy(mm).multiply(mesh.matrix);
          mirror.visible = mesh.visible;
          mirror.userData = { partId: part.id, shapeId: s.id, isMirror: true };
          g.add(mirror);
        }
        this.shapeMeshes.set(s.id, { mesh, mirror, part, shape: s });
        if (!part.locked) this.pickables.push(mesh, ...(mirror ? [mirror] : []));
      }
    }
    this.updateEffects(car);
    this.applySelection();
    this.requestRender();
  }

  private clearGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      if ((o as THREE.Mesh).userData?.display) (o as THREE.Mesh).geometry.dispose();
      if (o instanceof THREE.LineSegments) o.geometry.dispose();
    });
    g.clear();
  }

  setShowHoles(v: boolean) {
    this.showHoles = v;
    if (this.car) this.setCar(this.car, this.sel);
  }

  private applySelection() {
    if (this.outline) {
      this.outline.parent?.remove(this.outline);
      (this.outline as THREE.LineSegments).geometry?.dispose();
      this.outline = null;
    }
    const { partId, shapeId } = this.sel;
    if (shapeId) {
      const entry = this.shapeMeshes.get(shapeId);
      if (!entry) return;
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(entry.mesh.geometry, 20), this.edgeMat);
      lines.raycast = () => {};
      entry.mesh.add(lines);
      this.outline = lines;
      if (!entry.part.locked) this.tc.attach(entry.mesh);
    } else if (partId) {
      const g = this.partGroups.get(partId);
      if (!g) return;
      const box = new THREE.BoxHelper(g, 0xffc400);
      box.raycast = () => {};
      this.scene.add(box);
      this.outline = box;
      const part = this.car?.parts.find((p) => p.id === partId);
      if (part && !part.locked) this.tc.attach(g);
    }
  }

  setGizmo(mode: GizmoMode) {
    this.tc.setMode(mode);
    this.requestRender();
  }

  get gizmoMode(): GizmoMode {
    return this.tc.mode as GizmoMode;
  }

  applySnap() {
    this.tc.setTranslationSnap(this.snap.on ? this.snap.move : null);
    this.tc.setRotationSnap(this.snap.on ? THREE.MathUtils.degToRad(this.snap.angle) : null);
    this.tc.setScaleSnap(this.snap.on ? 0.05 : null);
  }

  private syncMirror() {
    const obj = this.tc.object;
    if (!obj?.userData.shapeId) {
      this.outline instanceof THREE.BoxHelper && this.outline.update();
      return;
    }
    const entry = this.shapeMeshes.get(obj.userData.shapeId);
    if (!entry?.mirror) return;
    entry.mesh.updateMatrix();
    entry.mirror.matrix.copy(mirrorMatrix(entry.part.pivot[0])).multiply(entry.mesh.matrix);
  }

  private commitDrag() {
    const obj = this.tc.object;
    if (!obj) return;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    if (obj.userData.shapeId) {
      const entry = this.shapeMeshes.get(obj.userData.shapeId);
      if (!entry) return;
      const s = entry.shape;
      const pos = obj.position.toArray().map(r) as Vec3;
      const rot = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((a) => r(THREE.MathUtils.radToDeg(a))) as Vec3;
      const size = s.size.map((v, i) => r(Math.max(0.02, Math.abs(v * obj.scale.getComponent(i))))) as Vec3;
      this.ev.commitShape(entry.part.id, s.id, pos, rot, size);
    } else if (obj.userData.partId) {
      this.ev.commitPart(obj.userData.partId, obj.position.toArray().map(r) as Vec3);
    }
  }

  // ---------- picking ----------

  private bindPicking() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || this.tc.dragging) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4 || e.button !== 0) return;
      const hit = this.pick(e);
      if (!hit) return this.ev.select({ partId: null, shapeId: null });
      // Click a shape of the selected part to edit it; otherwise pick the whole part first.
      const samePart = this.sel.partId === hit.partId;
      this.ev.select(samePart || e.altKey ? { partId: hit.partId, shapeId: hit.shapeId } : { partId: hit.partId, shapeId: null });
    });
    el.addEventListener('dblclick', (e) => {
      const hit = this.pick(e);
      if (hit) this.ev.select({ partId: hit.partId, shapeId: hit.shapeId });
    });
  }

  private ray = new THREE.Raycaster();
  private pick(e: MouseEvent): { partId: string; shapeId: string } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const visibleParts = this.pickables.filter((o) => o.parent?.visible);
    const hits = this.ray.intersectObjects(visibleParts, false);
    // Prefer solid shapes over hole volumes.
    const hit = hits.find((h) => !this.shapeMeshes.get(h.object.userData.shapeId)?.shape.hole) ?? hits[0];
    return hit ? { partId: hit.object.userData.partId, shapeId: hit.object.userData.shapeId } : null;
  }

  // ---------- camera ----------

  setView(v: ViewName) {
    this.view = v;
    const t = this.controls.target.clone();
    const ortho = v !== 'persp';
    this.camera = ortho ? this.ortho : this.persp;
    this.controls.object = this.camera;
    this.tc.camera = this.camera;
    const d = 60;
    if (v === 'persp') this.persp.position.copy(t).add(new THREE.Vector3(-17, 7, -19));
    if (v === 'front') this.ortho.position.set(t.x, t.y, t.z - d);
    if (v === 'back') this.ortho.position.set(t.x, t.y, t.z + d);
    if (v === 'side') this.ortho.position.set(t.x + d, t.y, t.z);
    if (v === 'top') this.ortho.position.set(t.x, t.y + d, t.z + 0.001);
    this.controls.enableRotate = !ortho;
    this.camera.lookAt(t);
    this.updateOrtho();
    this.controls.update();
    this.requestRender();
  }

  focusSelection() {
    const box = new THREE.Box3();
    const { partId, shapeId } = this.sel;
    if (shapeId) box.setFromObject(this.shapeMeshes.get(shapeId)?.mesh ?? this.carRoot);
    else if (partId) box.setFromObject(this.partGroups.get(partId) ?? this.carRoot);
    else box.setFromObject(this.carRoot);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    this.persp.position.copy(c).add(dir.multiplyScalar(Math.max(4, size * 1.6)));
    this.ortho.zoom = Math.min(8, Math.max(0.3, 18 / Math.max(1, size)));
    this.updateOrtho();
    this.controls.update();
    this.requestRender();
  }

  /** Where a new shape goes: the orbit centre snapped to the grid, resting on the ground. */
  dropPoint(height: number): Vec3 {
    const t = this.controls.target;
    const s = this.snap.on ? this.snap.move : 0.01;
    const q = (v: number) => Math.round(v / s) * s;
    return [q(t.x), Math.max(height / 2, q(t.y)), q(t.z)];
  }

  // ---------- effects preview (static, so it costs nothing while idle) ----------

  updateEffects(car: Car) {
    this.clearFx();
    const c = makeCtx(baseSpec(car.base), car.wheels);
    const e = car.effects;
    if (e.underglow.on) {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(c.W + 1.2, c.L + 1.2),
        new THREE.MeshBasicMaterial({ color: car.paint.glow, transparent: true, opacity: Math.min(0.85, 0.25 + e.underglow.brightness * 0.12), blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.03;
      this.fxRoot.add(glow);
    }
    if (e.headlightBeams) {
      for (const s of [-1, 1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: car.paint.light, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(s * c.W * 0.32, c.mounts.headlights[1], c.frontZ - 3.6);
        this.fxRoot.add(cone);
      }
    }
    if (e.boost.style !== 'none') {
      const ex = c.mounts.exhaust;
      const col = e.boost.style === 'rainbow' ? '#ff4fd8' : e.boost.style === 'smoke' ? '#9a9aa2' : e.boost.color;
      for (const o of exhaustOutlets(c, car.choices.exhaust)) {
        const len = e.boost.style === 'smoke' ? 2.2 : 3;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, len, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        if (o.dir === 'up') flame.position.set(o.p[0] + ex[0], o.p[1] + ex[1] + 0.5 + len / 2, o.p[2] + ex[2]);
        else {
          flame.rotation.x = -Math.PI / 2;
          flame.position.set(o.p[0] + ex[0], o.p[1] + ex[1], o.p[2] + ex[2] + 0.5 + len / 2);
        }
        this.fxRoot.add(flame);
      }
    }
    if (e.aura.style !== 'none') {
      const box = new THREE.Box3();
      for (const p of car.parts) if (!p.hidden) box.union(builtBounds(buildPart(p)));
      if (!box.isEmpty()) {
        box.expandByScalar(0.6);
        const n = 90, pos = new Float32Array(n * 3);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = THREE.MathUtils.lerp(box.min.x, box.max.x, rnd());
          pos[i * 3 + 1] = THREE.MathUtils.lerp(box.min.y + 0.2, box.max.y + 0.8, rnd());
          pos[i * 3 + 2] = THREE.MathUtils.lerp(box.min.z, box.max.z, rnd());
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const size = e.aura.style === 'glow' ? 1.4 : e.aura.style === 'bubbles' ? 0.6 : 0.35;
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: e.aura.color, size, map: sparkleTexture(e.aura.style), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.fxRoot.add(pts);
      }
    }
    this.requestRender();
  }

  private clearFx() {
    this.fxRoot.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.fxRoot.clear();
  }

  /** Renders a snapshot of the current view as a PNG data URL (used for the save file preview). */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

function splitByRole(positions: Float32Array, roles: Uint8Array): { role: Role; geom: THREE.BufferGeometry }[] {
  const by = new Map<number, number[]>();
  for (let t = 0; t < roles.length; t++) {
    let arr = by.get(roles[t]);
    if (!arr) by.set(roles[t], (arr = []));
    for (let k = 0; k < 9; k++) arr.push(positions[t * 9 + k]);
  }
  return [...by].map(([ri, arr]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return { role: ROLES[ri], geom: g };
  });
}

const sparkleCache = new Map<string, THREE.Texture>();
function sparkleTexture(style: string): THREE.Texture {
  let t = sparkleCache.get(style);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.translate(16, 16);
  if (style === 'stars' || style === 'sparkles') {
    g.fillStyle = '#fff';
    g.beginPath();
    const n = style === 'stars' ? 5 : 4;
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? 4 : 15, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  } else if (style === 'bubbles') {
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 12, 0, Math.PI * 2);
    g.stroke();
  } else {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(-16, -16, 32, 32);
  }
  t = new THREE.CanvasTexture(c);
  sparkleCache.set(style, t);
  return t;
}
