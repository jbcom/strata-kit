import {
  type BufferAttribute,
  type InterleavedBufferAttribute,
  Matrix3,
  Matrix4,
  type Mesh,
  type Object3D,
  Vector3,
} from "three";
import type { NeutralIndexedMesh } from "./reskin.js";

/** Caller-owned copies of one static mesh, without materials or scene references. */
export interface ThreeStaticMeshSnapshot extends NeutralIndexedMesh {
  name: string;
  normals: Float32Array;
}

export interface SnapshotThreeStaticMeshesOptions {
  /** Read prepared world coordinates or remove the prepared root transform (default). */
  space?: "root" | "world";
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;
type Flags = Object3D & {
  isMesh?: boolean;
  isSkinnedMesh?: boolean;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
};
interface Part {
  mesh: Mesh;
  position: Attribute;
  normal?: Attribute;
  uv?: Attribute;
  index: BufferAttribute | null;
  vertices: number;
  entries: number;
}

function fail(reason: string): never {
  throw new Error(`Three static snapshot: ${reason}`);
}

function attribute(value: Attribute | undefined, size: number, name: string): Attribute {
  if (
    !value ||
    value.itemSize !== size ||
    !Number.isSafeInteger(value.count) ||
    value.count < 1 ||
    typeof value.getX !== "function" ||
    (size >= 2 && typeof value.getY !== "function") ||
    (size >= 3 && typeof value.getZ !== "function")
  )
    fail(`${name} must contain complete CPU-readable attributes`);
  return value;
}

function preparedMatrix(source: Matrix4): Matrix4 {
  const e = source?.elements;
  if (e?.length !== 16 || !e.every(Number.isFinite)) fail("prepared matrices must be finite");
  if (e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) {
    fail("prepared matrices must be affine");
  }
  return new Matrix4().fromArray(e);
}

function invertible(matrix: Matrix4): number {
  const determinant = matrix.determinant();
  if (!Number.isFinite(determinant) || determinant === 0)
    fail("transform must be finite and invertible");
  return determinant;
}

function normalized(target: Float32Array, offset: number, x: number, y: number, z: number): void {
  if (![x, y, z].every(Number.isFinite)) fail("normal components must be finite");
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (scale === 0) {
    target.set([0, 0, 0], offset);
    return;
  }
  const length = Math.hypot(x / scale, y / scale, z / scale);
  target.set([x / scale / length, y / scale / length, z / scale / length], offset);
}

function triangles(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
  normals: Float32Array,
  generateNormals: boolean,
): void {
  const sums = generateNormals ? new Float64Array(positions.length) : undefined;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const abx = positions[b] - positions[a],
      aby = positions[b + 1] - positions[a + 1],
      abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a],
      acy = positions[c + 1] - positions[a + 1],
      acz = positions[c + 2] - positions[a + 2];
    const x = aby * acz - abz * acy,
      y = abz * acx - abx * acz,
      z = abx * acy - aby * acx;
    const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    if (!(scale > 0) || !Number.isFinite(scale))
      fail("stored triangles must have finite nonzero area");
    if (sums) {
      for (const corner of [a, b, c]) {
        sums[corner] = sums[corner] + x;
        sums[corner + 1] = sums[corner + 1] + y;
        sums[corner + 2] = sums[corner + 2] + z;
      }
    }
  }
  if (sums)
    for (let i = 0; i < sums.length; i += 3) {
      normalized(normals, i, sums[i], sums[i + 1], sums[i + 2]);
    }
}

/**
 * Copies prepared static triangle meshes in deterministic preorder, including a root mesh.
 * The caller updates world matrices first; this operation never updates scene state.
 * Limits apply across the complete hierarchy before output allocation: 100,000 nodes,
 * one million vertices and six million indices. Unsupported rendering partitions and
 * deformation remain explicit errors rather than silently changing their meaning.
 */
export function snapshotThreeStaticMeshes(
  root: Object3D,
  options: SnapshotThreeStaticMeshesOptions = {},
): ThreeStaticMeshSnapshot[] {
  if (root?.isObject3D !== true) fail("root must be an Object3D");
  if (!options || typeof options !== "object") fail("options must be an object");
  const space = options.space ?? "root";
  if (space !== "root" && space !== "world") fail("space must be root or world");
  const rootMatrix = preparedMatrix(root.matrixWorld);
  if (space === "root") {
    invertible(rootMatrix);
    rootMatrix.invert();
    if (!rootMatrix.elements.every(Number.isFinite)) fail("root inverse must be finite");
  }
  const parts: Part[] = [],
    stack: Object3D[] = [root],
    seen = new Set<Object3D>();
  let scheduled = 1,
    verticesTotal = 0,
    entriesTotal = 0;
  while (stack.length) {
    const node = stack.pop() as Flags;
    if (node?.isObject3D !== true || seen.has(node))
      fail("hierarchy must be an Object3D tree");
    seen.add(node);
    if (!Array.isArray(node.children)) fail("hierarchy children must be an array");
    scheduled += node.children.length;
    if (scheduled > 100_000) fail("hierarchy node count exceeds 100000");
    for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i]);
    if (
      node.isSkinnedMesh ||
      node.isInstancedMesh ||
      node.isBatchedMesh ||
      node.isLine ||
      node.isPoints ||
      node.isSprite
    ) {
      fail("only static triangle meshes are supported");
    }
    if (!node.isMesh) continue;
    const mesh = node as Mesh,
      geometry = mesh.geometry;
    if (!geometry?.isBufferGeometry) fail("mesh must have a BufferGeometry");
    if ("isInstancedBufferGeometry" in geometry && geometry.isInstancedBufferGeometry) {
      fail("instanced geometry is unsupported");
    }
    if (geometry.groups.length || Array.isArray(mesh.material))
      fail("material groups are unsupported");
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity)
      fail("partial draw ranges are unsupported");
    if (
      Object.values(geometry.morphAttributes).some((values) => values && values.length > 0) ||
      geometry.getAttribute("skinIndex") ||
      geometry.getAttribute("skinWeight")
    ) {
      fail("deformed geometry is unsupported");
    }
    const position = attribute(geometry.getAttribute("position"), 3, "position");
    if (position.count < 3) fail("position must contain at least three vertices");
    const normal = geometry.getAttribute("normal"),
      uv = geometry.getAttribute("uv");
    if (normal && attribute(normal, 3, "normal").count !== position.count)
      fail("normal layout must match positions");
    if (uv && attribute(uv, 2, "UV").count !== position.count)
      fail("UV layout must match positions");
    const index = geometry.getIndex();
    if (index && (attribute(index, 1, "index").normalized || index.count % 3 !== 0))
      fail("indices must contain complete integer triangles");
    const entries = index?.count ?? position.count;
    if (entries < 3 || entries % 3 !== 0) fail("mesh must contain complete triangles");
    verticesTotal += position.count;
    entriesTotal += entries;
    if (verticesTotal > 1_000_000 || entriesTotal > 6_000_000)
      fail("aggregate geometry allocation limit exceeded");
    parts.push({ mesh, position, normal, uv, index, vertices: position.count, entries });
  }
  return parts.map((part) => {
    const transform = preparedMatrix(part.mesh.matrixWorld);
    if (space === "root") transform.premultiply(rootMatrix);
    if (!transform.elements.every(Number.isFinite)) fail("transformed matrix must be finite");
    const determinant = invertible(transform);
    const normalMatrix = new Matrix3().getNormalMatrix(transform);
    if (!normalMatrix.elements.every(Number.isFinite)) fail("normal transform must be finite");
    const positions = new Float32Array(part.vertices * 3),
      normals = new Float32Array(part.vertices * 3);
    const uvs = part.uv ? new Float32Array(part.vertices * 2) : undefined;
    const indices =
      part.vertices <= 65_536 ? new Uint16Array(part.entries) : new Uint32Array(part.entries);
    const point = new Vector3();
    for (let i = 0; i < part.vertices; i += 1) {
      point.set(part.position.getX(i), part.position.getY(i), part.position.getZ(i));
      if (![point.x, point.y, point.z].every(Number.isFinite))
        fail("position components must be finite");
      point.applyMatrix4(transform);
      positions.set([point.x, point.y, point.z], i * 3);
      if (![positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]].every(Number.isFinite))
        fail("transformed positions must fit finite Float32 values");
      if (part.normal) {
        point
          .set(part.normal.getX(i), part.normal.getY(i), part.normal.getZ(i))
          .applyMatrix3(normalMatrix);
        normalized(normals, i * 3, point.x, point.y, point.z);
      }
      if (part.uv && uvs) {
        uvs.set([part.uv.getX(i), part.uv.getY(i)], i * 2);
        if (![uvs[i * 2], uvs[i * 2 + 1]].every(Number.isFinite))
          fail("UV components must fit finite Float32 values");
      }
    }
    for (let i = 0; i < part.entries; i += 1) {
      const index = part.index ? part.index.getX(i) : i;
      if (!Number.isInteger(index) || index < 0 || index >= part.vertices)
        fail("index must reference a position vertex");
      indices[i] = index;
    }
    if (determinant < 0)
      for (let i = 0; i < indices.length; i += 3) {
        const b = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = b;
      }
    triangles(positions, indices, normals, !part.normal);
    return { name: part.mesh.name, positions, normals, indices, ...(uvs ? { uvs } : {}) };
  });
}
