import { BufferAttribute, BufferGeometry } from 'three';

import type { HeightfieldMesh } from './terrain.js';

/** Converts pure heightfield data to Three.js only when the consumer opts in. */
export function createThreeHeightfieldGeometry(mesh: HeightfieldMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
