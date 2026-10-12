import { BufferAttribute, BufferGeometry } from 'three';

import type { HeightfieldMesh } from './terrain.js';

/** Converts pure heightfield data into a Three geometry with normalized UVs. */
export function createThreeHeightfieldGeometry(mesh: HeightfieldMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  const uvs = new Float32Array(mesh.width * mesh.depth * 2);
  for (let z = 0; z < mesh.depth; z += 1) {
    for (let x = 0; x < mesh.width; x += 1) {
      const offset = (z * mesh.width + x) * 2;
      uvs[offset] = x / (mesh.width - 1);
      uvs[offset + 1] = z / (mesh.depth - 1);
    }
  }
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
