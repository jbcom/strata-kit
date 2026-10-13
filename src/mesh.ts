/**
 * Renderer-neutral indexed mesh builders.
 *
 * Copyright (c) Jon Bogaty. MIT licensed.
 *
 * This independently authored implementation contains only typed-array geometry math;
 * it has no renderer, asset, paint, anatomy, skinning, or game dependencies.
 */

import type { Vec3 } from "./sdf.js";

export type { Vec3 } from "./sdf.js";

const MAX_VERTICES = 1_000_000;
const MAX_INDICES = 6_000_000;
const MAX_FLOAT32 = 3.4028234663852886e38;
const TAU = Math.PI * 2;

/** Indexed attributes for a renderer-neutral triangle mesh. */
export interface ProceduralMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** A radius-height point on a profile revolved around the Y axis. */
export interface RevolveProfilePoint {
  radius: number;
  height: number;
}

/** Options for a closed, Y-axis revolution mesh. Caps default to `true`. */
export interface RevolvedMeshOptions {
  profile: readonly RevolveProfilePoint[];
  segments: number;
  caps?: boolean;
}

/** Options for a round tube swept through a polyline. Caps default to `true`. */
export interface SweptMeshOptions {
  path: readonly Vec3[];
  radius: number | ((t: number) => number);
  radialSegments: number;
  caps?: boolean;
}

/** Options for an upward-facing rectangular grid. */
export interface SheetMeshOptions {
  width: number;
  height: number;
  columns: number;
  rows: number;
  heightAt?: (u: number, v: number) => number;
}

function requirePositiveInteger(
  operation: string,
  name: string,
  value: number,
  minimum: number,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${operation}: ${name} must be an integer >= ${minimum}`);
  }
}

function requirePositiveFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${operation}: ${name} must be a positive finite number`);
  }
}

function requireNonNegativeFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${operation}: ${name} must be a non-negative finite number`);
  }
}

function requireFloat32(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_FLOAT32) {
    throw new Error(`${operation}: ${name} must fit finite Float32 output`);
  }
}

function requireRepresentablePositiveFloat32(operation: string, name: string, value: number): void {
  requirePositiveFinite(operation, name, value);
  requireFloat32(operation, name, value);
  if (Math.fround(value) === 0) {
    throw new Error(`${operation}: ${name} must survive Float32 quantization`);
  }
}

function checkedCount(operation: string, vertices: number, indices: number): void {
  if (!Number.isSafeInteger(vertices) || vertices < 0 || vertices > MAX_VERTICES) {
    throw new Error(`${operation}: vertex count exceeds ${MAX_VERTICES}`);
  }
  if (!Number.isSafeInteger(indices) || indices < 0 || indices > MAX_INDICES) {
    throw new Error(`${operation}: index count exceeds ${MAX_INDICES}`);
  }
}

function allocateMesh(vertices: number, indices: number): ProceduralMesh {
  checkedCount("create mesh", vertices, indices);
  return {
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    uvs: new Float32Array(vertices * 2),
    indices: vertices <= 65_536 ? new Uint16Array(indices) : new Uint32Array(indices),
  };
}

function requireNonDegenerateStoredTriangles(
  operation: string,
  mesh: ProceduralMesh,
): ProceduralMesh {
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset]! * 3;
    const b = mesh.indices[offset + 1]! * 3;
    const c = mesh.indices[offset + 2]! * 3;
    const abx = mesh.positions[b]! - mesh.positions[a]!;
    const aby = mesh.positions[b + 1]! - mesh.positions[a + 1]!;
    const abz = mesh.positions[b + 2]! - mesh.positions[a + 2]!;
    const acx = mesh.positions[c]! - mesh.positions[a]!;
    const acy = mesh.positions[c + 1]! - mesh.positions[a + 1]!;
    const acz = mesh.positions[c + 2]! - mesh.positions[a + 2]!;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    if (
      !Number.isFinite(crossX) ||
      !Number.isFinite(crossY) ||
      !Number.isFinite(crossZ) ||
      (crossX === 0 && crossY === 0 && crossZ === 0)
    ) {
      throw new Error(
        `${operation}: triangle ${offset / 3} has zero area after Float32 quantization`,
      );
    }
  }
  return mesh;
}

function setPosition(
  output: Float32Array,
  vertex: number,
  x: number,
  y: number,
  z: number,
  operation: string,
): void {
  requireFloat32(operation, `position[${vertex}].x`, x);
  requireFloat32(operation, `position[${vertex}].y`, y);
  requireFloat32(operation, `position[${vertex}].z`, z);
  const offset = vertex * 3;
  output[offset] = x;
  output[offset + 1] = y;
  output[offset + 2] = z;
}

function setNormal(output: Float32Array, vertex: number, x: number, y: number, z: number): void {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error("create mesh: normal magnitude must be finite and non-zero");
  }
  const offset = vertex * 3;
  output[offset] = x / length;
  output[offset + 1] = y / length;
  output[offset + 2] = z / length;
}

function setUv(output: Float32Array, vertex: number, u: number, v: number): void {
  const offset = vertex * 2;
  output[offset] = u;
  output[offset + 1] = v;
}

function requireFinitePoint(operation: string, name: string, point: Vec3): void {
  requireFloat32(operation, `${name}.x`, point.x);
  requireFloat32(operation, `${name}.y`, point.y);
  requireFloat32(operation, `${name}.z`, point.z);
}

function normalized(x: number, y: number, z: number, operation: string): [number, number, number] {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length === 0)
    throw new Error(`${operation}: vector must be non-zero and finite`);
  return [x / length, y / length, z / length];
}

/**
 * Revolves a radius-height profile around the Y axis.
 *
 * The profile must be ordered strictly upward. `segments` is at least 3, the seam is
 * duplicated for UV continuity, and flat caps are emitted by default with independent
 * vertices and normals. A zero-radius endpoint is a tip and has no redundant cap.
 */
export function createRevolvedMesh(options: RevolvedMeshOptions): ProceduralMesh {
  const operation = "createRevolvedMesh";
  const { profile, segments, caps = true } = options;
  if (profile.length < 2) throw new Error(`${operation}: profile must contain at least two points`);
  requirePositiveInteger(operation, "segments", segments, 3);

  const ringSize = segments + 1;
  checkedCount(operation, profile.length * ringSize, 0);
  const segmentSlopes = new Float64Array(profile.length - 1);
  let sideIndices = 0;
  let hasPositiveRadius = false;
  for (let index = 0; index < profile.length; index += 1) {
    const point = profile[index]!;
    requireNonNegativeFinite(operation, `profile[${index}].radius`, point.radius);
    if (point.radius > 0) {
      requireRepresentablePositiveFloat32(operation, `profile[${index}].radius`, point.radius);
      hasPositiveRadius = true;
    }
    requireFloat32(operation, `profile[${index}].height`, point.height);
    if (index > 0 && point.height <= profile[index - 1]!.height) {
      throw new Error(`${operation}: profile heights must be strictly increasing`);
    }
  }
  if (!hasPositiveRadius)
    throw new Error(`${operation}: profile must contain at least one positive radius`);
  for (let index = 0; index < profile.length - 1; index += 1) {
    const lower = profile[index]!;
    const upper = profile[index + 1]!;
    segmentSlopes[index] = (upper.radius - lower.radius) / (upper.height - lower.height);
    if (lower.radius === 0 && upper.radius === 0) {
      throw new Error(`${operation}: profile cannot contain adjacent zero-radius points`);
    }
    sideIndices += (lower.radius === 0 || upper.radius === 0 ? 3 : 6) * segments;
  }

  // A shared normal cannot point outward for both sides of a concave profile cusp.
  // Split only those rings; ordinary profile rows retain their smoothed central normal.
  const splitRows = new Array<boolean>(profile.length).fill(false);
  let splitCount = 0;
  for (let row = 1; row < profile.length - 1; row += 1) {
    if (1 + segmentSlopes[row - 1]! * segmentSlopes[row]! < 0) {
      splitRows[row] = true;
      splitCount += 1;
    }
  }

  const firstCap = caps && profile[0]!.radius > 0;
  const lastCap = caps && profile[profile.length - 1]!.radius > 0;
  const capVertices = (firstCap ? segments + 2 : 0) + (lastCap ? segments + 2 : 0);
  const capIndices = (firstCap ? segments * 3 : 0) + (lastCap ? segments * 3 : 0);
  const baseSideVertices = profile.length * ringSize;
  const sideVertices = baseSideVertices + splitCount * ringSize;
  checkedCount(operation, sideVertices + capVertices, sideIndices + capIndices);
  const mesh = allocateMesh(sideVertices + capVertices, sideIndices + capIndices);

  const incomingRings = new Uint32Array(profile.length);
  const outgoingRings = new Uint32Array(profile.length);
  let splitCursor = baseSideVertices;
  for (let row = 0; row < profile.length; row += 1) {
    const sharedRing = row * ringSize;
    incomingRings[row] = sharedRing;
    outgoingRings[row] = sharedRing;
    if (splitRows[row]) {
      outgoingRings[row] = splitCursor;
      splitCursor += ringSize;
    }
  }

  const addSideRing = (row: number, ring: number, slope: number): void => {
    const point = profile[row]!;
    for (let column = 0; column <= segments; column += 1) {
      const vertex = ring + column;
      const theta = column === segments ? 0 : (column / segments) * TAU;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      setPosition(
        mesh.positions,
        vertex,
        point.radius * cosine,
        point.height,
        point.radius * sine,
        operation,
      );
      setNormal(mesh.normals, vertex, cosine, -slope, sine);
      setUv(mesh.uvs, vertex, column / segments, row / (profile.length - 1));
    }
  };
  for (let row = 0; row < profile.length; row += 1) {
    if (splitRows[row]) {
      addSideRing(row, incomingRings[row]!, segmentSlopes[row - 1]!);
      addSideRing(row, outgoingRings[row]!, segmentSlopes[row]!);
      continue;
    }
    const previous = profile[Math.max(0, row - 1)]!;
    const next = profile[Math.min(profile.length - 1, row + 1)]!;
    addSideRing(
      row,
      incomingRings[row]!,
      (next.radius - previous.radius) / (next.height - previous.height),
    );
  }

  let indexCursor = 0;
  for (let row = 0; row < profile.length - 1; row += 1) {
    const lower = profile[row]!;
    const upper = profile[row + 1]!;
    for (let column = 0; column < segments; column += 1) {
      const lowerCurrent = outgoingRings[row]! + column;
      const lowerNext = lowerCurrent + 1;
      const upperCurrent = incomingRings[row + 1]! + column;
      const upperNext = upperCurrent + 1;
      if (lower.radius !== 0) {
        mesh.indices[indexCursor++] = lowerCurrent;
        mesh.indices[indexCursor++] = upperCurrent;
        mesh.indices[indexCursor++] = lowerNext;
      }
      if (upper.radius !== 0) {
        mesh.indices[indexCursor++] = lowerNext;
        mesh.indices[indexCursor++] = upperCurrent;
        mesh.indices[indexCursor++] = upperNext;
      }
    }
  }

  let vertexCursor = sideVertices;
  const addCap = (row: number, direction: -1 | 1): void => {
    const point = profile[row]!;
    const center = vertexCursor++;
    setPosition(mesh.positions, center, 0, point.height, 0, operation);
    setNormal(mesh.normals, center, 0, direction, 0);
    setUv(mesh.uvs, center, 0.5, 0.5);
    const rim = vertexCursor;
    for (let column = 0; column <= segments; column += 1) {
      const theta = column === segments ? 0 : (column / segments) * TAU;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      setPosition(
        mesh.positions,
        vertexCursor,
        point.radius * cosine,
        point.height,
        point.radius * sine,
        operation,
      );
      setNormal(mesh.normals, vertexCursor, 0, direction, 0);
      setUv(mesh.uvs, vertexCursor, 0.5 + cosine * 0.5, 0.5 + sine * 0.5);
      vertexCursor += 1;
    }
    for (let column = 0; column < segments; column += 1) {
      mesh.indices[indexCursor++] = center;
      if (direction < 0) {
        mesh.indices[indexCursor++] = rim + column;
        mesh.indices[indexCursor++] = rim + column + 1;
      } else {
        mesh.indices[indexCursor++] = rim + column + 1;
        mesh.indices[indexCursor++] = rim + column;
      }
    }
  };
  if (firstCap) addCap(0, -1);
  if (lastCap) addCap(profile.length - 1, 1);
  return requireNonDegenerateStoredTriangles(operation, mesh);
}

/**
 * Sweeps a circular tube along a polyline using arc-length coordinates and parallel transport.
 *
 * Radius callbacks receive arc-length `t` in `[0, 1]`. The tube has at least three radial
 * segments. Consecutive duplicate points and tangent reversals are rejected because neither
 * admits an unambiguous transported frame.
 */
export function createSweptMesh(options: SweptMeshOptions): ProceduralMesh {
  const operation = "createSweptMesh";
  const { path, radius, radialSegments, caps = true } = options;
  if (path.length < 2) throw new Error(`${operation}: path must contain at least two points`);
  requirePositiveInteger(operation, "radialSegments", radialSegments, 3);
  for (let index = 0; index < path.length; index += 1)
    requireFinitePoint(operation, `path[${index}]`, path[index]!);

  const sideVertices = path.length * (radialSegments + 1);
  const capVertices = caps ? 2 * (radialSegments + 2) : 0;
  const sideIndices = (path.length - 1) * radialSegments * 6;
  const capIndices = caps ? radialSegments * 6 : 0;
  checkedCount(operation, sideVertices + capVertices, sideIndices + capIndices);

  const lengthAt = new Float64Array(path.length);
  const segmentTangents = new Float64Array((path.length - 1) * 3);
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index]!;
    const end = path[index + 1]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(length) || length === 0) {
      throw new Error(`${operation}: path contains consecutive identical points`);
    }
    lengthAt[index + 1] = lengthAt[index]! + length;
    const offset = index * 3;
    segmentTangents[offset] = dx / length;
    segmentTangents[offset + 1] = dy / length;
    segmentTangents[offset + 2] = dz / length;
  }
  const totalLength = lengthAt[path.length - 1]!;
  if (!Number.isFinite(totalLength) || totalLength === 0)
    throw new Error(`${operation}: path length must be finite`);

  const tangents = new Float64Array(path.length * 3);
  for (let index = 0; index < path.length; index += 1) {
    const target = index * 3;
    if (index === 0 || index === path.length - 1) {
      const source = (index === 0 ? 0 : index - 1) * 3;
      tangents[target] = segmentTangents[source]!;
      tangents[target + 1] = segmentTangents[source + 1]!;
      tangents[target + 2] = segmentTangents[source + 2]!;
      continue;
    }
    const previous = (index - 1) * 3;
    const next = index * 3;
    const dot =
      segmentTangents[previous]! * segmentTangents[next]! +
      segmentTangents[previous + 1]! * segmentTangents[next + 1]! +
      segmentTangents[previous + 2]! * segmentTangents[next + 2]!;
    if (dot <= -1 + 1e-12)
      throw new Error(`${operation}: path contains reversing consecutive tangents`);
    const tangent = normalized(
      segmentTangents[previous]! + segmentTangents[next]!,
      segmentTangents[previous + 1]! + segmentTangents[next + 1]!,
      segmentTangents[previous + 2]! + segmentTangents[next + 2]!,
      operation,
    );
    tangents[target] = tangent[0];
    tangents[target + 1] = tangent[1];
    tangents[target + 2] = tangent[2];
  }

  const radii = new Float64Array(path.length);
  for (let index = 0; index < path.length; index += 1) {
    const t = lengthAt[index]! / totalLength;
    const value = typeof radius === "function" ? radius(t) : radius;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${operation}: radius(t) must return a positive finite number`);
    }
    requireFloat32(operation, "radius(t)", value);
    if (Math.fround(value) === 0) {
      throw new Error(`${operation}: radius(t) must survive Float32 quantization`);
    }
    radii[index] = value;
  }

  const transportedNormals = new Float64Array(path.length * 3);
  const binormals = new Float64Array(path.length * 3);
  const tx = tangents[0]!;
  const ty = tangents[1]!;
  const tz = tangents[2]!;
  const cardinal =
    Math.abs(tx) <= Math.abs(ty) && Math.abs(tx) <= Math.abs(tz)
      ? [1, 0, 0]
      : Math.abs(ty) <= Math.abs(tz)
        ? [0, 1, 0]
        : [0, 0, 1];
  let frameNormal = normalized(
    cardinal[0]! - tx * cardinal[0]!,
    cardinal[1]! - ty * cardinal[1]!,
    cardinal[2]! - tz * cardinal[2]!,
    operation,
  );
  for (let index = 0; index < path.length; index += 1) {
    const offset = index * 3;
    const currentTangent: [number, number, number] = [
      tangents[offset]!,
      tangents[offset + 1]!,
      tangents[offset + 2]!,
    ];
    if (index > 0) {
      const previous = offset - 3;
      const previousTangent: [number, number, number] = [
        tangents[previous]!,
        tangents[previous + 1]!,
        tangents[previous + 2]!,
      ];
      const axisX = previousTangent[1] * currentTangent[2] - previousTangent[2] * currentTangent[1];
      const axisY = previousTangent[2] * currentTangent[0] - previousTangent[0] * currentTangent[2];
      const axisZ = previousTangent[0] * currentTangent[1] - previousTangent[1] * currentTangent[0];
      const sine = Math.hypot(axisX, axisY, axisZ);
      const cosine = Math.max(
        -1,
        Math.min(
          1,
          previousTangent[0] * currentTangent[0] +
            previousTangent[1] * currentTangent[1] +
            previousTangent[2] * currentTangent[2],
        ),
      );
      if (sine > 1e-12) {
        const unitX = axisX / sine;
        const unitY = axisY / sine;
        const unitZ = axisZ / sine;
        const crossX = unitY * frameNormal[2] - unitZ * frameNormal[1];
        const crossY = unitZ * frameNormal[0] - unitX * frameNormal[2];
        const crossZ = unitX * frameNormal[1] - unitY * frameNormal[0];
        const along = unitX * frameNormal[0] + unitY * frameNormal[1] + unitZ * frameNormal[2];
        frameNormal = [
          frameNormal[0] * cosine + crossX * sine + unitX * along * (1 - cosine),
          frameNormal[1] * cosine + crossY * sine + unitY * along * (1 - cosine),
          frameNormal[2] * cosine + crossZ * sine + unitZ * along * (1 - cosine),
        ];
      }
      const projection =
        frameNormal[0] * currentTangent[0] +
        frameNormal[1] * currentTangent[1] +
        frameNormal[2] * currentTangent[2];
      frameNormal = normalized(
        frameNormal[0] - currentTangent[0] * projection,
        frameNormal[1] - currentTangent[1] * projection,
        frameNormal[2] - currentTangent[2] * projection,
        operation,
      );
    }
    transportedNormals[offset] = frameNormal[0];
    transportedNormals[offset + 1] = frameNormal[1];
    transportedNormals[offset + 2] = frameNormal[2];
    const binormal = normalized(
      currentTangent[1] * frameNormal[2] - currentTangent[2] * frameNormal[1],
      currentTangent[2] * frameNormal[0] - currentTangent[0] * frameNormal[2],
      currentTangent[0] * frameNormal[1] - currentTangent[1] * frameNormal[0],
      operation,
    );
    binormals[offset] = binormal[0];
    binormals[offset + 1] = binormal[1];
    binormals[offset + 2] = binormal[2];
  }

  const mesh = allocateMesh(sideVertices + capVertices, sideIndices + capIndices);
  for (let row = 0; row < path.length; row += 1) {
    const center = path[row]!;
    const offset = row * 3;
    for (let column = 0; column <= radialSegments; column += 1) {
      const vertex = row * (radialSegments + 1) + column;
      const theta = column === radialSegments ? 0 : (column / radialSegments) * TAU;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      setPosition(
        mesh.positions,
        vertex,
        center.x + radii[row]! * (transportedNormals[offset]! * cosine + binormals[offset]! * sine),
        center.y +
          radii[row]! * (transportedNormals[offset + 1]! * cosine + binormals[offset + 1]! * sine),
        center.z +
          radii[row]! * (transportedNormals[offset + 2]! * cosine + binormals[offset + 2]! * sine),
        operation,
      );
      setUv(mesh.uvs, vertex, column / radialSegments, lengthAt[row]! / totalLength);
    }
  }

  for (let row = 0; row < path.length; row += 1) {
    const previousRow = Math.max(0, row - 1);
    const nextRow = Math.min(path.length - 1, row + 1);
    for (let column = 0; column < radialSegments; column += 1) {
      const previousColumn = (column - 1 + radialSegments) % radialSegments;
      const nextColumn = (column + 1) % radialSegments;
      const current = row * (radialSegments + 1) + column;
      const radialBefore = row * (radialSegments + 1) + previousColumn;
      const radialAfter = row * (radialSegments + 1) + nextColumn;
      const longitudinalBefore = previousRow * (radialSegments + 1) + column;
      const longitudinalAfter = nextRow * (radialSegments + 1) + column;
      const radialOffsetBefore = radialBefore * 3;
      const radialOffsetAfter = radialAfter * 3;
      const longitudinalOffsetBefore = longitudinalBefore * 3;
      const longitudinalOffsetAfter = longitudinalAfter * 3;
      const rx = mesh.positions[radialOffsetAfter]! - mesh.positions[radialOffsetBefore]!;
      const ry = mesh.positions[radialOffsetAfter + 1]! - mesh.positions[radialOffsetBefore + 1]!;
      const rz = mesh.positions[radialOffsetAfter + 2]! - mesh.positions[radialOffsetBefore + 2]!;
      const lx =
        mesh.positions[longitudinalOffsetAfter]! - mesh.positions[longitudinalOffsetBefore]!;
      const ly =
        mesh.positions[longitudinalOffsetAfter + 1]! -
        mesh.positions[longitudinalOffsetBefore + 1]!;
      const lz =
        mesh.positions[longitudinalOffsetAfter + 2]! -
        mesh.positions[longitudinalOffsetBefore + 2]!;
      const nx = ry * lz - rz * ly;
      const ny = rz * lx - rx * lz;
      const nz = rx * ly - ry * lx;
      const normalLength = Math.hypot(nx, ny, nz);
      if (normalLength > 1e-12 && Number.isFinite(normalLength)) {
        setNormal(mesh.normals, current, nx, ny, nz);
      } else {
        const frameOffset = row * 3;
        const theta = (column / radialSegments) * TAU;
        setNormal(
          mesh.normals,
          current,
          transportedNormals[frameOffset]! * Math.cos(theta) +
            binormals[frameOffset]! * Math.sin(theta),
          transportedNormals[frameOffset + 1]! * Math.cos(theta) +
            binormals[frameOffset + 1]! * Math.sin(theta),
          transportedNormals[frameOffset + 2]! * Math.cos(theta) +
            binormals[frameOffset + 2]! * Math.sin(theta),
        );
      }
    }
    const first = row * (radialSegments + 1);
    const seam = first + radialSegments;
    mesh.normals.set(mesh.normals.subarray(first * 3, first * 3 + 3), seam * 3);
  }

  let indexCursor = 0;
  for (let row = 0; row < path.length - 1; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const lowerCurrent = row * (radialSegments + 1) + column;
      const lowerNext = lowerCurrent + 1;
      const upperCurrent = lowerCurrent + radialSegments + 1;
      const upperNext = upperCurrent + 1;
      mesh.indices[indexCursor++] = lowerCurrent;
      mesh.indices[indexCursor++] = lowerNext;
      mesh.indices[indexCursor++] = upperCurrent;
      mesh.indices[indexCursor++] = lowerNext;
      mesh.indices[indexCursor++] = upperNext;
      mesh.indices[indexCursor++] = upperCurrent;
    }
  }

  if (caps) {
    const addCap = (row: number, direction: -1 | 1): void => {
      const frameOffset = row * 3;
      const center = vertexCursor;
      const point = path[row]!;
      setPosition(mesh.positions, vertexCursor++, point.x, point.y, point.z, operation);
      setNormal(
        mesh.normals,
        center,
        tangents[frameOffset]! * direction,
        tangents[frameOffset + 1]! * direction,
        tangents[frameOffset + 2]! * direction,
      );
      setUv(mesh.uvs, center, 0.5, 0.5);
      const rim = vertexCursor;
      for (let column = 0; column <= radialSegments; column += 1) {
        const source = row * (radialSegments + 1) + column;
        const sourceOffset = source * 3;
        setPosition(
          mesh.positions,
          vertexCursor,
          mesh.positions[sourceOffset]!,
          mesh.positions[sourceOffset + 1]!,
          mesh.positions[sourceOffset + 2]!,
          operation,
        );
        setNormal(
          mesh.normals,
          vertexCursor,
          tangents[frameOffset]! * direction,
          tangents[frameOffset + 1]! * direction,
          tangents[frameOffset + 2]! * direction,
        );
        const theta = column === radialSegments ? 0 : (column / radialSegments) * TAU;
        setUv(mesh.uvs, vertexCursor++, 0.5 + Math.cos(theta) * 0.5, 0.5 + Math.sin(theta) * 0.5);
      }
      for (let column = 0; column < radialSegments; column += 1) {
        mesh.indices[indexCursor++] = center;
        if (direction < 0) {
          mesh.indices[indexCursor++] = rim + column + 1;
          mesh.indices[indexCursor++] = rim + column;
        } else {
          mesh.indices[indexCursor++] = rim + column;
          mesh.indices[indexCursor++] = rim + column + 1;
        }
      }
    };
    let vertexCursor = sideVertices;
    addCap(0, -1);
    addCap(path.length - 1, 1);
  }
  return requireNonDegenerateStoredTriangles(operation, mesh);
}

/**
 * Generates an upward-facing rectangular grid centered at the origin.
 *
 * `columns` and `rows` count vertices, including both boundaries, and must each be at
 * least two. `heightAt` is sampled once per vertex in unit-domain `(u, v)` coordinates;
 * normals use finite differences of those samples.
 */
export function createSheetMesh(options: SheetMeshOptions): ProceduralMesh {
  const operation = "createSheetMesh";
  const { width, height, columns, rows, heightAt = () => 0 } = options;
  requireRepresentablePositiveFloat32(operation, "width", width);
  requireRepresentablePositiveFloat32(operation, "height", height);
  requirePositiveInteger(operation, "columns", columns, 2);
  requirePositiveInteger(operation, "rows", rows, 2);
  const vertices = columns * rows;
  const indices = (columns - 1) * (rows - 1) * 6;
  checkedCount(operation, vertices, indices);
  const mesh = allocateMesh(vertices, indices);
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = column / (columns - 1);
      const vertex = row * columns + column;
      const sample = heightAt(u, v);
      requireFloat32(operation, `heightAt(${u}, ${v})`, sample);
      setPosition(mesh.positions, vertex, (u - 0.5) * width, sample, (v - 0.5) * height, operation);
      setUv(mesh.uvs, vertex, u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    const previousRow = Math.max(0, row - 1);
    const nextRow = Math.min(rows - 1, row + 1);
    for (let column = 0; column < columns; column += 1) {
      const previousColumn = Math.max(0, column - 1);
      const nextColumn = Math.min(columns - 1, column + 1);
      const left = (row * columns + previousColumn) * 3;
      const right = (row * columns + nextColumn) * 3;
      const before = (previousRow * columns + column) * 3;
      const after = (nextRow * columns + column) * 3;
      const dhdx =
        (mesh.positions[right + 1]! - mesh.positions[left + 1]!) /
        (mesh.positions[right]! - mesh.positions[left]!);
      const dhdz =
        (mesh.positions[after + 1]! - mesh.positions[before + 1]!) /
        (mesh.positions[after + 2]! - mesh.positions[before + 2]!);
      setNormal(mesh.normals, row * columns + column, -dhdx, 1, -dhdz);
    }
  }
  let indexCursor = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const lowerLeft = row * columns + column;
      mesh.indices[indexCursor++] = lowerLeft;
      mesh.indices[indexCursor++] = lowerLeft + columns;
      mesh.indices[indexCursor++] = lowerLeft + 1;
      mesh.indices[indexCursor++] = lowerLeft + 1;
      mesh.indices[indexCursor++] = lowerLeft + columns;
      mesh.indices[indexCursor++] = lowerLeft + columns + 1;
    }
  }
  return requireNonDegenerateStoredTriangles(operation, mesh);
}
