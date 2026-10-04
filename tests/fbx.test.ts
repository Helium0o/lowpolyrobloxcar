import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as THREE from 'three';
import { writeFbx, type FbxNode } from '../src/fbx';
import { shapeGeometry } from '../src/shapes';

function cubeNode(name: string, t: [number, number, number], size = 2): FbxNode {
  const g = shapeGeometry({ id: 'c', type: 'box', pos: [0, 0, 0], rot: [0, 0, 0], size: [size, size, size], role: 'paint' });
  const positions = new Float32Array(g.getAttribute('position').array);
  const triColors = new Float32Array((positions.length / 9) * 3).fill(0.5);
  return { name, translation: t, mesh: { name, positions, triColors, material: { name: name + '_Mat', color: [size / 4, 0, 0], opacity: 1 } } };
}

const scene: FbxNode[] = [
  { name: 'Hood', translation: [0, 3, -5], children: [cubeNode('Hood', [0, 0, 0]), cubeNode('Hood_Paint', [0, 0, 0], 3)] },
  cubeNode('Body', [0, 1, 0], 1),
];

describe('fbx', () => {
  const bytes = writeFbx(scene);

  it('loads in three.js FBXLoader with names, hierarchy and positions', () => {
    const group = new FBXLoader().parse(bytes.buffer as ArrayBuffer, '');
    const hood = group.getObjectByName('Hood_Paint') as THREE.Mesh;
    expect(hood).toBeTruthy();
    expect(hood.parent?.name).toBe('Hood');
    hood.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(hood.matrixWorld);
    expect(p.toArray()).toEqual([0, 3, -5]);
    expect((hood.geometry as THREE.BufferGeometry).getAttribute('position').count).toBe(36);
    expect((hood.geometry as THREE.BufferGeometry).getAttribute('color')).toBeTruthy();
    expect(group.getObjectByName('Body')).toBeTruthy();
  });

  it('is accepted by assimp when available', () => {
    mkdirSync('tests/out', { recursive: true });
    writeFileSync('tests/out/test.fbx', bytes);
    let out = '';
    try {
      out = execFileSync('assimp', ['info', 'tests/out/test.fbx'], { encoding: 'utf8' });
    } catch (e: any) {
      if (e.code === 'ENOENT') return; // assimp not installed
      throw new Error(String(e.stdout) + String(e.stderr));
    }
    expect(out).toMatch(/Meshes:\s+3/);
    expect(out).toMatch(/Faces:\s+36/);
    expect(out).toMatch(/Hood_Paint \(mesh/);
  });
});
