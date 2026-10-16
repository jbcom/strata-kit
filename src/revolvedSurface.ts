/** Renderer-neutral sampled section surfaces, without end caps. */
import type { ProceduralMesh } from "./mesh.js";
import { requireFiniteNumber } from "./validation.js";

export interface RevolvedSection {
  height: number;
  halfWidth: number;
  positiveDepth: number;
  negativeDepth: number;
  /** Caller-local XZ center; defaults to [0, 0]. */
  center?: readonly [number, number];
}
/** Numeric rows are already sampled; sectionAt samples s=i/subdivisions once per row. */
export type RevolvedSectionSource =
  | { sections: readonly RevolvedSection[]; subdivisions?: never; sectionAt?: never }
  | { sectionAt: (s: number) => RevolvedSection; subdivisions: number; sections?: never };
export type RevolvedAngularDomain =
  | { kind: "closed"; seam?: number }
  | { kind: "open"; start: number; end: number };
export type RevolvedSurfaceOptions = RevolvedSectionSource & {
  segments: number;
  /** Polar superellipse exponent, finite and >= 2; defaults to 2. */
  power?: number;
  angular?: RevolvedAngularDomain;
  /** Whole-grid parameter winding; omission retains local radial orientation. */
  winding?: "forward" | "reverse";
  /** Length offsets sampled once per unique grid point in row-major order. */
  radialOffset?: (s: number, theta: number) => number;
  axialOffset?: (s: number, theta: number) => number;
  /**
   * Normalized (default) is [column/segments, s]. Angular-length U is the
   * continuous sweep offset (column/segments)*span times mean section half-extent.
   * Wrapped-angular-length U is wrapped theta times that same mean. Both length
   * modes use displaced Y for V and do not measure exact ellipse perimeter length.
   */
  uv?: "normalized" | "angular-length" | "wrapped-angular-length";
};
export interface RevolvedSurfaceMesh extends ProceduralMesh {
  /** Interleaved Float64 [s, wrapped theta] for every output vertex, including repairs. */
  parameters: Float64Array;
}

const OP = "createRevolvedSurfaceMesh";
const TAU = Math.PI * 2;
const MAX_VERTICES = 1_000_000;
const MAX_INDICES = 6_000_000;
const MAX_FLOAT32 = 3.4028234663852886e38;
type Triple = [number, number, number];
type OwnedSection = Required<Omit<RevolvedSection, "center">> & { center: [number, number] };

function finite(name: string, value: number): number {
  requireFiniteNumber(OP, name, value);
  return value;
}
function float32(name: string, value: number): number {
  finite(name, value);
  if (Math.abs(value) > MAX_FLOAT32) throw new Error(`${OP}: ${name} must fit finite Float32`);
  return value;
}
function count(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error(`${OP}: ${name} exceeds ${maximum}`);
}
function integer(name: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${OP}: ${name} must be a safe integer >= ${minimum}`);
}
function normalize(x: number, y: number, z: number): Triple | undefined {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length)) throw new Error(`${OP}: normal magnitude must be finite`);
  return length === 0 ? undefined : [x / length, y / length, z / length];
}
function cross(a: Triple, b: Triple): Triple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Triple, b: Triple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function read(points: Float64Array | Float32Array, vertex: number): Triple {
  return [points[vertex * 3], points[vertex * 3 + 1], points[vertex * 3 + 2]];
}
function difference(points: Float64Array | Float32Array, to: number, from: number): Triple {
  const a = read(points, to);
  const b = read(points, from);
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function face(points: Float64Array | Float32Array, a: number, b: number, c: number): Triple {
  return cross(difference(points, b, a), difference(points, c, a));
}
function ownSection(input: RevolvedSection, row: number, rows: number): OwnedSection {
  if (!input || typeof input !== "object")
    throw new Error(`${OP}: section ${row} must be an object`);
  const { height, halfWidth, positiveDepth, negativeDepth } = input;
  for (const [name, value] of Object.entries({ height, halfWidth, positiveDepth, negativeDepth }))
    float32(`section ${row} ${name}`, value);
  const extents = [halfWidth, positiveDepth, negativeDepth];
  const pole = extents.every((value) => value === 0);
  if (pole ? row !== 0 && row !== rows - 1 : extents.some((value) => value <= 0))
    throw new Error(`${OP}: sections require positive half-extents or an all-zero endpoint pole`);
  if (!pole && extents.some((value) => Math.fround(value) === 0))
    throw new Error(`${OP}: positive half-extents must survive Float32 quantization`);
  const center = input.center === undefined ? [0, 0] : input.center;
  if (!Array.isArray(center) || center.length !== 2)
    throw new Error(`${OP}: section center must contain two numbers`);
  return {
    height,
    halfWidth,
    positiveDepth,
    negativeDepth,
    center: [float32("center x", center[0]), float32("center z", center[1])],
  };
}
function offset(
  callback: ((s: number, theta: number) => number) | undefined,
  s: number,
  theta: number,
  name: string,
): number {
  if (!callback) return 0;
  try {
    return finite(name, callback(s, theta));
  } catch (cause) {
    throw new Error(`${OP}: ${name} callback failed`, { cause });
  }
}

/**
 * Samples sections along Y with angle zero at +Z and pi/2 at +X.
 * Closed topology samples only unique angular columns and copies its seam; open
 * boundaries use one-sided differences even for a complete turn. Callbacks are
 * borrowed pure samplers; closed offsets must be periodic. No caps are inferred.
 * Callback theta is atan2(sin(raw), cos(raw)), with either signed-pi endpoint
 * possible. Closed seam parameters copy the first column. Its U is 1 for normalized,
 * 2*pi times mean section half-extent for angular-length, and the first column's
 * wrapped U for wrapped-angular-length. Angular-length U starts at zero regardless
 * of the angular start or seam; parameter theta remains wrapped in every UV mode.
 * Radial offsets clamp negative resulting radii to zero; only analytically collapsed
 * triangles are omitted. Positive-area faces erased by Float32 quantization reject.
 * Omitted winding uses local radial orientation and rejects inconsistent face
 * orientation across a shared patch edge. Explicit forward winding uses
 * dP/dtheta cross dP/ds; reverse negates it and reverses every retained face.
 * Neither mode infers hollow-meridian/solid-volume semantics.
 * Base work is bounded to one million grid vertices and six million potential
 * indices before callbacks; final admission counts actual repaired vertices.
 */
export function createRevolvedSurfaceMesh(options: RevolvedSurfaceOptions): RevolvedSurfaceMesh {
  if (!options || typeof options !== "object") throw new Error(`${OP}: options are required`);
  const parameterWinding = options.winding;
  if (
    parameterWinding !== undefined &&
    parameterWinding !== "forward" &&
    parameterWinding !== "reverse"
  )
    throw new Error(`${OP}: winding must be forward or reverse`);
  const hasSections = Object.hasOwn(options, "sections");
  const hasSampler = Object.hasOwn(options, "sectionAt");
  if (hasSections === hasSampler)
    throw new Error(`${OP}: supply sections or sectionAt, exclusively`);
  let rows: number;
  let source: readonly RevolvedSection[] | undefined;
  let sectionAt: ((s: number) => RevolvedSection) | undefined;
  if (hasSections) {
    if (
      !Array.isArray(options.sections) ||
      options.sections.length < 2 ||
      Object.hasOwn(options, "subdivisions")
    )
      throw new Error(`${OP}: sections must contain at least two rows without subdivisions`);
    source = options.sections;
    rows = source.length;
  } else {
    if (typeof options.sectionAt !== "function")
      throw new Error(`${OP}: sectionAt must be a function`);
    integer("subdivisions", options.subdivisions as number, 1);
    sectionAt = options.sectionAt;
    rows = (options.subdivisions as number) + 1;
  }
  const angular =
    options.angular === undefined ? { kind: "closed" as const, seam: 0 } : options.angular;
  if (!angular || (angular.kind !== "closed" && angular.kind !== "open"))
    throw new Error(`${OP}: angular kind must be closed or open`);
  const closed = angular.kind === "closed";
  const segments = options.segments;
  integer("segments", segments, closed ? 3 : 1);
  const start = finite(
    "angular start",
    closed ? (angular.seam === undefined ? 0 : angular.seam) : angular.start,
  );
  const span = closed ? TAU : finite("angular span", finite("angular end", angular.end) - start);
  if (span <= 0 || span > TAU) throw new Error(`${OP}: angular span must be in (0, 2*pi]`);
  const power = finite("power", options.power === undefined ? 2 : options.power);
  if (power < 2) throw new Error(`${OP}: power must be >= 2`);
  const uv = options.uv === undefined ? "normalized" : options.uv;
  if (uv !== "normalized" && uv !== "angular-length" && uv !== "wrapped-angular-length")
    throw new Error(`${OP}: unknown UV mode`);
  const radialOffset = options.radialOffset;
  const axialOffset = options.axialOffset;
  for (const callback of [radialOffset, axialOffset])
    if (callback !== undefined && typeof callback !== "function")
      throw new Error(`${OP}: offsets must be functions`);
  const stride = segments + 1;
  const gridCount = rows * stride;
  const maximumIndices = (rows - 1) * segments * 6;
  count("grid vertex count", gridCount, MAX_VERTICES);
  count("grid index work", maximumIndices, MAX_INDICES);

  // Check every raw increment before invoking any sampler; large starts must not erase intervals.
  const angles = new Float64Array(stride);
  let previous = start;
  for (let column = 0; column <= segments; column += 1) {
    const raw = finite("raw angle", start + (column / segments) * span);
    if (column > 0 && raw <= previous)
      throw new Error(`${OP}: angular increments lose coordinate resolution`);
    previous = raw;
    angles[column] = Math.atan2(Math.sin(raw), Math.cos(raw));
  }
  if (closed) angles[segments] = angles[0];
  const sections: OwnedSection[] = [];
  for (let row = 0; row < rows; row += 1) {
    let input: RevolvedSection;
    try {
      input = sectionAt ? sectionAt(row / (rows - 1)) : (source as readonly RevolvedSection[])[row];
    } catch (cause) {
      throw new Error(`${OP}: sectionAt callback failed at row ${row}`, { cause });
    }
    sections.push(ownSection(input, row, rows));
  }
  const working = new Float64Array(gridCount * 3);
  const stored = new Float32Array(gridCount * 3);
  const normals = new Float64Array(gridCount * 3);
  const uvs = new Float32Array(gridCount * 2);
  const collapsed = new Uint8Array(gridCount);
  const fullyCollapsed = new Uint8Array(rows);
  for (let row = 0; row < rows; row += 1) {
    const section = sections[row];
    const s = row / (rows - 1);
    let collapsedCount = 0;
    for (let column = 0; column < (closed ? segments : stride); column += 1) {
      const vertex = row * stride + column;
      const theta = angles[column];
      const sine = Math.sin(theta);
      const cosine = Math.cos(theta);
      const width = section.halfWidth;
      const depth = cosine >= 0 ? section.positiveDepth : section.negativeDepth;
      let radius = 0;
      if (width !== 0) {
        if (power === 2) {
          const numerator = finite("ellipse numerator", width * depth);
          const ds = finite("ellipse depth term", depth * sine);
          const wc = finite("ellipse width term", width * cosine);
          const denominator = Math.sqrt(
            finite(
              "ellipse squared sum",
              finite("ellipse depth square", ds * ds) + finite("ellipse width square", wc * wc),
            ),
          );
          if (numerator === 0 || denominator === 0)
            throw new Error(`${OP}: ellipse arithmetic underflow`);
          radius = finite("ellipse radius", numerator / denominator);
        } else {
          const x = finite("superellipse x ratio", Math.abs(sine) / width);
          const z = finite("superellipse z ratio", Math.abs(cosine) / depth);
          const denominator = finite(
            "superellipse sum",
            finite("superellipse x power", x ** power) + finite("superellipse z power", z ** power),
          );
          if (denominator === 0) throw new Error(`${OP}: superellipse arithmetic underflow`);
          radius = finite("superellipse radius", 1 / denominator ** (1 / power));
        }
        if (radius <= 0 || Math.fround(radius) === 0)
          throw new Error(`${OP}: positive radius must survive Float32 quantization`);
      }
      radius = Math.max(
        0,
        finite("displaced radius", radius + offset(radialOffset, s, theta, "radialOffset")),
      );
      if (radius > 0 && Math.fround(radius) === 0)
        throw new Error(`${OP}: displaced radius must survive Float32 quantization`);
      if (radius === 0) {
        collapsed[vertex] = 1;
        collapsedCount += 1;
      }
      const y = finite(
        "displaced height",
        section.height + offset(axialOffset, s, theta, "axialOffset"),
      );
      const point = [
        finite("position x", section.center[0] + sine * radius),
        y,
        finite("position z", section.center[1] + cosine * radius),
      ];
      for (let axis = 0; axis < 3; axis += 1) {
        working[vertex * 3 + axis] = float32("position", point[axis]);
        stored[vertex * 3 + axis] = point[axis];
      }
      const mean = finite(
        "mean section extent",
        (width + section.positiveDepth + section.negativeDepth) / 3,
      );
      uvs[vertex * 2] = float32(
        "UV u",
        uv === "normalized"
          ? column / segments
          : (uv === "angular-length" ? (column / segments) * span : theta) * mean,
      );
      uvs[vertex * 2 + 1] = float32("UV v", uv === "normalized" ? s : y);
    }
    fullyCollapsed[row] = collapsedCount === (closed ? segments : stride) ? 1 : 0;
    if (row > 0 && fullyCollapsed[row] && fullyCollapsed[row - 1])
      throw new Error(`${OP}: adjacent fully collapsed rows are unsupported`);
    if (closed) {
      const first = row * stride;
      const last = first + segments;
      working.set(working.subarray(first * 3, first * 3 + 3), last * 3);
      stored.set(stored.subarray(first * 3, first * 3 + 3), last * 3);
      collapsed[last] = collapsed[first];
      uvs[last * 2] =
        uv === "normalized"
          ? 1
          : uv === "angular-length"
            ? float32(
                "UV u",
                TAU * ((section.halfWidth + section.positiveDepth + section.negativeDepth) / 3),
              )
            : uvs[first * 2];
      uvs[last * 2 + 1] = uvs[first * 2 + 1];
    }
  }
  const reference = (vertex: number): Triple => {
    const section = sections[Math.floor(vertex / stride)];
    return [
      working[vertex * 3] - section.center[0],
      working[vertex * 3 + 1] - section.height,
      working[vertex * 3 + 2] - section.center[1],
    ];
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < (closed ? segments : stride); column += 1) {
      const vertex = row * stride + column;
      const before = closed ? (column + segments - 1) % segments : Math.max(0, column - 1);
      const after = closed ? (column + 1) % segments : Math.min(segments, column + 1);
      const angularDelta = difference(working, row * stride + after, row * stride + before);
      const axialDelta = difference(
        working,
        Math.min(rows - 1, row + 1) * stride + column,
        Math.max(0, row - 1) * stride + column,
      );
      const radial = reference(vertex);
      const gradient = cross(angularDelta, axialDelta);
      if (
        parameterWinding === "reverse" ||
        (parameterWinding === undefined && dot(gradient, radial) < 0)
      ) {
        gradient[0] *= -1;
        gradient[1] *= -1;
        gradient[2] *= -1;
      }
      let normal =
        normalize(...gradient) ??
        (parameterWinding === undefined ? normalize(...radial) : undefined);
      if (!normal && parameterWinding === undefined && (row === 0 || row === rows - 1)) {
        const neighbor = sections[row === 0 ? 1 : rows - 2];
        const section = sections[row];
        normal = normalize(
          section.center[0] - neighbor.center[0],
          section.height - neighbor.height,
          section.center[1] - neighbor.center[1],
        );
      }
      if (normal) normals.set(normal, vertex * 3);
    }
    if (closed)
      normals.set(
        normals.subarray(row * stride * 3, row * stride * 3 + 3),
        (row * stride + segments) * 3,
      );
  }

  const triangleCount = maximumIndices / 3;
  const winding = new Uint8Array(triangleCount); // 0 omitted, 1 parameter order, 2 reversed.
  const rowFallbacks: (Triple | undefined)[] = [];
  const verticesOf = (triangle: number): Triple => {
    const cell = Math.floor(triangle / 2);
    const row = Math.floor(cell / segments);
    const column = cell % segments;
    const a = row * stride + column;
    const c = a + 1;
    const b = a + stride;
    const d = b + 1;
    return triangle % 2 === 0 ? [a, c, b] : [c, d, b];
  };
  let emitted = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const [a, b, c] = verticesOf(triangle);
    const exact = face(working, a, b, c);
    if (!normalize(...exact)) {
      if (collapsed[a] + collapsed[b] + collapsed[c] < 2)
        throw new Error(`${OP}: triangle ${triangle} has non-pole zero area`);
      continue;
    }
    const storedFace = normalize(...face(stored, a, b, c));
    if (!storedFace)
      throw new Error(`${OP}: triangle ${triangle} collapses after Float32 quantization`);
    let flip = parameterWinding === "reverse";
    if (parameterWinding === undefined) {
      const references = [reference(a), reference(b), reference(c)];
      const radial: Triple = [0, 0, 0];
      const smooth: Triple = [0, 0, 0];
      for (let i = 0; i < 3; i += 1) {
        radial[i] = references[0][i] + references[1][i] + references[2][i];
        smooth[i] = normals[a * 3 + i] + normals[b * 3 + i] + normals[c * 3 + i];
      }
      const orientation = dot(exact, radial);
      flip = orientation < 0 || (orientation === 0 && dot(exact, smooth) < 0);
    }
    winding[triangle] = flip ? 2 : 1;
    emitted += 1;
    const oriented: Triple = flip ? [-storedFace[0], -storedFace[1], -storedFace[2]] : storedFace;
    for (const vertex of [a, b, c]) {
      if (!normalize(...read(normals, vertex))) normals.set(oriented, vertex * 3);
      if (parameterWinding !== undefined) rowFallbacks[Math.floor(vertex / stride)] ??= oriented;
    }
  }
  if (emitted === 0) throw new Error(`${OP}: surface has no nondegenerate triangles`);
  if (parameterWinding !== undefined) {
    // An analytic pole's redundant angular endpoint may belong only to omitted
    // faces. Give unused samples the same deterministic oriented fan fallback.
    for (let vertex = 0; vertex < gridCount; vertex += 1) {
      const fallback = rowFallbacks[Math.floor(vertex / stride)];
      if (fallback && !normalize(...read(normals, vertex))) normals.set(fallback, vertex * 3);
    }
  }
  if (closed) {
    for (let row = 0; row < rows; row += 1)
      normals.set(
        normals.subarray(row * stride * 3, row * stride * 3 + 3),
        (row * stride + segments) * 3,
      );
  }
  const consistent = (left: number, right: number): void => {
    if (winding[left] && winding[right] && winding[left] !== winding[right])
      throw new Error(
        `${OP}: inconsistent orientation across shared patch edge; meridian inversions are unsupported`,
      );
  };
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const first = (row * segments + column) * 2;
      consistent(first, first + 1);
      if (row + 1 < rows - 1) consistent(first + 1, first + 2 * segments);
      if (column + 1 < segments || closed) {
        const next = (row * segments + ((column + 1) % segments)) * 2;
        consistent(first + 1, next);
        // A collapsed endpoint fan shares geometric edges between its retained triangles.
        if (fullyCollapsed[row]) consistent(first + 1, next + 1);
        if (fullyCollapsed[row + 1]) consistent(first, next);
      }
    }
  }

  // Test exactly the normals that will be stored, including Float32 rounding.
  const storedNormals = new Float32Array(gridCount * 3);
  for (let vertex = 0; vertex < gridCount; vertex += 1) {
    const normal = normalize(...read(normals, vertex));
    if (!normal) throw new Error(`${OP}: vertex ${vertex} has no valid orientation`);
    storedNormals.set(normal, vertex * 3);
  }
  // Admission uses actual corner repairs, never a pessimistic all-corners estimate.
  // Use the raw stored-position cross: normalizing it can round exact tangency
  // to a positive dot product and incorrectly admit a shared corner.
  const repair = (vertex: number, storedFaceCross: Triple): boolean =>
    dot(read(storedNormals, vertex), storedFaceCross) <= 0;
  let repairs = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!winding[triangle]) continue;
    const vertices = verticesOf(triangle);
    if (winding[triangle] === 2) [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
    const storedFaceCross = face(stored, ...vertices);
    for (const vertex of vertices) if (repair(vertex, storedFaceCross)) repairs += 1;
  }
  const outputCount = gridCount + repairs;
  count("repaired vertex count", outputCount, MAX_VERTICES);
  count("emitted index count", emitted * 3, MAX_INDICES);
  const mesh: RevolvedSurfaceMesh = {
    positions: new Float32Array(outputCount * 3),
    normals: new Float32Array(outputCount * 3),
    uvs: new Float32Array(outputCount * 2),
    parameters: new Float64Array(outputCount * 2),
    indices: outputCount <= 65_536 ? new Uint16Array(emitted * 3) : new Uint32Array(emitted * 3),
  };
  mesh.positions.set(stored);
  mesh.uvs.set(uvs);
  mesh.normals.set(storedNormals);
  for (let vertex = 0; vertex < gridCount; vertex += 1) {
    mesh.parameters[vertex * 2] = Math.floor(vertex / stride) / (rows - 1);
    mesh.parameters[vertex * 2 + 1] = angles[vertex % stride];
  }
  let cursor = gridCount;
  let indexCursor = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!winding[triangle]) continue;
    const vertices = verticesOf(triangle);
    if (winding[triangle] === 2) [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
    const storedFaceCross = face(stored, ...vertices);
    const normal = normalize(...storedFaceCross) as Triple;
    for (const vertex of vertices) {
      let output = vertex;
      if (repair(vertex, storedFaceCross)) {
        output = cursor++;
        mesh.positions.set(mesh.positions.subarray(vertex * 3, vertex * 3 + 3), output * 3);
        mesh.normals.set(normal, output * 3);
        mesh.uvs.set(mesh.uvs.subarray(vertex * 2, vertex * 2 + 2), output * 2);
        mesh.parameters.set(mesh.parameters.subarray(vertex * 2, vertex * 2 + 2), output * 2);
      }
      mesh.indices[indexCursor++] = output;
    }
  }
  return mesh;
}
