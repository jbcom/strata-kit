import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
} from "three";

import type { SurfaceBake } from "./materials.js";
import type { ProceduralMesh } from "./mesh.js";
import type { HeightfieldMesh } from "./terrain.js";

export { snapshotThreeStaticMeshes } from "./threeSnapshot.js";
export type { ThreeStaticMeshSnapshot, SnapshotThreeStaticMeshesOptions } from "./threeSnapshot.js";

type MeshBuffers = Pick<ProceduralMesh, "positions" | "normals" | "indices"> & {
  uvs?: Float32Array;
};

function validateMeshBuffers(mesh: MeshBuffers, allowEmpty = false): number {
  if (
    !(mesh.positions instanceof Float32Array) ||
    mesh.positions.length < 9 ||
    mesh.positions.length % 3 !== 0
  ) {
    throw new Error("Three mesh: positions must contain complete Float32 xyz vertices");
  }
  const vertices = mesh.positions.length / 3;
  if (vertices > 1_000_000) throw new Error("Three mesh: vertex allocation limit exceeded");
  if (!(mesh.normals instanceof Float32Array) || mesh.normals.length !== mesh.positions.length) {
    throw new Error("Three mesh: normal layout must match positions");
  }
  if (
    mesh.uvs !== undefined &&
    (!(mesh.uvs instanceof Float32Array) || mesh.uvs.length !== vertices * 2)
  ) {
    throw new Error("Three mesh: UV layout must match positions");
  }
  if (
    !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
    (!allowEmpty && mesh.indices.length === 0) ||
    mesh.indices.length % 3 !== 0 ||
    mesh.indices.length > 6_000_000
  ) {
    throw new Error("Three mesh: indices must contain bounded complete triangles");
  }
  for (const buffer of [mesh.positions, mesh.normals, mesh.uvs]) {
    if (buffer)
      for (const value of buffer) {
        if (!Number.isFinite(value)) throw new Error("Three mesh: attributes must be finite");
      }
  }
  for (const index of mesh.indices) {
    if (index >= vertices) throw new Error("Three mesh: index is outside the vertex buffer");
  }
  return vertices;
}

function geometryFromBuffers(mesh: MeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  if (mesh.uvs) geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Converts validated neutral mesh data into a caller-owned Three geometry.
 * Attributes view the supplied buffers: keep them immutable while the geometry is used.
 * Dispose the returned geometry when its consumer no longer needs it.
 */
export function createThreeMeshGeometry(mesh: MeshBuffers): BufferGeometry {
  validateMeshBuffers(mesh, true);
  return geometryFromBuffers(mesh);
}

/**
 * Converts a validated heightfield into caller-owned Three geometry with normalized UVs.
 * Position, normal, and index attributes view the input arrays; consumers keep them immutable.
 */
export function createThreeHeightfieldGeometry(mesh: HeightfieldMesh): BufferGeometry {
  const vertices = validateMeshBuffers(mesh);
  if (
    !Number.isInteger(mesh.width) ||
    !Number.isInteger(mesh.depth) ||
    mesh.width < 2 ||
    mesh.depth < 2 ||
    !Number.isSafeInteger(mesh.width * mesh.depth) ||
    mesh.width * mesh.depth !== vertices
  ) {
    throw new Error("Three heightfield: dimensions must match the vertex layout");
  }
  const uvs = new Float32Array(mesh.width * mesh.depth * 2);
  for (let z = 0; z < mesh.depth; z += 1) {
    for (let x = 0; x < mesh.width; x += 1) {
      const offset = (z * mesh.width + x) * 2;
      uvs[offset] = x / (mesh.width - 1);
      uvs[offset + 1] = z / (mesh.depth - 1);
    }
  }
  return geometryFromBuffers({ ...mesh, uvs });
}

/** Owned texture resources from one portable material bake. */
export interface ThreeSurfaceTextures {
  /** RGBA color map in sRGB. */
  map: DataTexture;
  /** Linear grayscale RGBA; Three samples the green channel for roughness. */
  roughnessMap: DataTexture;
  /** Linear single-channel signed-height encoding, remapped to a unit interval. */
  bumpMap: DataTexture;
  /** Optional linear grayscale RGBA; Three samples blue for metalness. */
  metalnessMap?: DataTexture;
  /** Releases these textures once, without touching a caller's material. */
  dispose(): void;
}

/** Explicit conversion between bake row order and conventional Three texture coordinates. */
export interface ThreeSurfaceTextureOptions {
  /** Copy rows vertically inverted for a top-left/v-down bake. Default true. */
  flipY?: boolean;
}

function validateBake(bake: SurfaceBake): number {
  const pixels = bake.width * bake.height;
  if (
    !Number.isSafeInteger(bake.width) ||
    !Number.isSafeInteger(bake.height) ||
    bake.width <= 0 ||
    bake.height <= 0 ||
    !Number.isSafeInteger(pixels) ||
    pixels > 4_194_304
  ) {
    throw new Error("Three surface textures: invalid or oversized bake dimensions");
  }
  for (const [name, data, stride] of [
    ["color", bake.color, 4],
    ["roughness", bake.roughness, 1],
    ["bump", bake.bump, 1],
    ["metalness", bake.metalness, 1],
  ] as const) {
    if (name === "metalness" && data === undefined) continue;
    if (!(data instanceof Uint8Array) || data.length !== pixels * stride) {
      throw new Error(`Three surface textures: ${name} layout must match dimensions`);
    }
  }
  return pixels;
}

function copyTextureBytes(
  data: Uint8Array,
  width: number,
  height: number,
  stride: number,
  flipY: boolean,
  grayscale: boolean,
): Uint8Array {
  const channels = grayscale ? 4 : stride;
  const out = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * stride;
      const target = (y * width + x) * channels;
      if (grayscale) {
        out[target] = data[source];
        out[target + 1] = data[source];
        out[target + 2] = data[source];
        out[target + 3] = 255;
      } else {
        for (let channel = 0; channel < stride; channel += 1)
          out[target + channel] = data[source + channel];
      }
    }
  }
  return out;
}

/**
 * Upload-ready, explicitly owned maps from a validated portable surface bake.
 * Copies all data and converts top-left rows by default. Three's material is caller-owned.
 * Bump bytes encode [-1,1] as [0,1]; use twice the desired signed-height scale for bumpScale.
 */
export function createThreeSurfaceTextures(
  bake: SurfaceBake,
  options: ThreeSurfaceTextureOptions = {},
): ThreeSurfaceTextures {
  validateBake(bake);
  const flipY = options.flipY ?? true;
  if (typeof flipY !== "boolean") throw new Error("Three surface textures: flipY must be boolean");
  const texture = (
    data: Uint8Array,
    stride: number,
    grayscale: boolean,
    color: boolean,
  ): DataTexture => {
    const bytes = copyTextureBytes(data, bake.width, bake.height, stride, flipY, grayscale);
    const out = new DataTexture(bytes, bake.width, bake.height, RGBAFormat);
    out.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    out.minFilter = LinearFilter;
    out.magFilter = LinearFilter;
    out.flipY = false;
    out.needsUpdate = true;
    return out;
  };
  const map = texture(bake.color, 4, false, true);
  const roughnessMap = texture(bake.roughness, 1, true, false);
  const bumpMap = texture(bake.bump, 1, true, false);
  const metalnessMap = bake.metalness ? texture(bake.metalness, 1, true, false) : undefined;
  let disposed = false;
  return {
    map,
    roughnessMap,
    bumpMap,
    ...(metalnessMap ? { metalnessMap } : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      map.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
      metalnessMap?.dispose();
    },
  };
}
