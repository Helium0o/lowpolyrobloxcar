import * as THREE from 'three';
import { buildPart, builtBounds } from './build';
import { ROLES, type Car, type Part, type Role } from './model';

// Small preview pictures for the template cards. One hidden renderer draws them in the
// background a few at a time, then shuts down so it holds no GPU memory while idle.

type Job = { key: string; parts: () => Part[]; view: 'front' | 'rear' | 'side' | 'three'; done: (url: string) => void };

const W = 128, H = 92;
const cache = new Map<string, string>();

export class Thumbs {
  private renderer: THREE.WebGLRenderer | null = null;
  private queue: Job[] = [];
  private running = false;
  private idleTimer = 0;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 200);
  private mats = new Map<Role, THREE.MeshLambertMaterial>();
  private colorsKey = '';

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8494, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.4);
    d.position.set(-5, 10, -7);
    this.scene.add(d);
    for (const r of ROLES) this.mats.set(r, new THREE.MeshLambertMaterial({ flatShading: true, transparent: r === 'glass', opacity: r === 'glass' ? 0.75 : 1 }));
  }

  setColors(car: Car) {
    const key = JSON.stringify(car.paint);
    if (key === this.colorsKey) return;
    this.colorsKey = key;
    cache.clear();
    for (const r of ROLES) {
      const m = this.mats.get(r)!;
      m.color.set(car.paint[r]);
      if (r === 'light' || r === 'tail' || r === 'glow') m.emissive.set(car.paint[r]).multiplyScalar(0.5);
    }
  }

  request(key: string, view: Job['view'], parts: () => Part[], done: (url: string) => void) {
    const hit = cache.get(key);
    if (hit) return done(hit);
    this.queue.push({ key, view, parts, done });
    if (!this.running) {
      this.running = true;
      setTimeout(() => this.pump(), 30);
    }
  }

  clearQueue() {
    this.queue = [];
  }

  private pump() {
    clearTimeout(this.idleTimer);
    const start = performance.now();
    while (this.queue.length && performance.now() - start < 24) {
      const job = this.queue.shift()!;
      const hit = cache.get(job.key);
      if (hit) { job.done(hit); continue; }
      const url = this.draw(job);
      cache.set(job.key, url);
      job.done(url);
    }
    if (this.queue.length) setTimeout(() => this.pump(), 16);
    else {
      this.running = false;
      this.idleTimer = window.setTimeout(() => this.shutdown(), 4000);
    }
  }

  private draw(job: Job): string {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true, alpha: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(W, H, false);
    }
    const group = new THREE.Group();
    const box = new THREE.Box3();
    for (const p of job.parts()) {
      const bp = buildPart(p);
      box.union(builtBounds(bp));
      for (const m of bp.meshes) {
        const by = new Map<number, number[]>();
        for (let t = 0; t < m.tris; t++) {
          let a = by.get(m.roles[t]);
          if (!a) by.set(m.roles[t], (a = []));
          for (let k = 0; k < 9; k++) a.push(m.positions[t * 9 + k]);
        }
        for (const [ri, arr] of by) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
          g.computeVertexNormals();
          const mesh = new THREE.Mesh(g, this.mats.get(ROLES[ri]));
          mesh.position.set(...p.pivot);
          group.add(mesh);
        }
      }
    }
    this.scene.add(group);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = { front: [-0.55, 0.45, -1], rear: [-0.55, 0.45, 1], side: [1, 0.12, -0.15], three: [-0.9, 0.55, -1] }[job.view];
    const v = new THREE.Vector3(...dir).normalize();
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2)) * 0.82;
    this.cam.position.copy(c).addScaledVector(v, dist);
    this.cam.lookAt(c);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(group);
    group.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    return url;
  }

  private shutdown() {
    if (!this.renderer) return;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
  }
}
