import type { ProceduralMesh } from "./mesh.js";
import type { Vec3 } from "./sdf.js";

/** A mapped grid with neutral correspondence for caller-defined attributes. */
export interface ParametricSheetMesh extends ProceduralMesh {
  /** Original row*columns+column sample ID, including independent seam endpoints. */
  sourceVertex: Uint32Array;
}

export interface ParametricSheetMeshOptions {
  columns: number;
  rows: number;
  positionAt: (u: number, v: number) => Vec3;
  uvAt?: (u: number, v: number) => readonly [number, number];
  normalAt?: (u: number, v: number) => Vec3;
  insideAt?: (u: number, v: number) => Vec3;
  normalMode?: "grid" | "area-weighted";
  /** Set one parameter-grid winding instead of inferring orientation from normals. */
  winding?: "forward" | "reverse";
  includeCell?: (column: number, row: number) => boolean;
  includeVertex?: (column: number, row: number) => boolean;
  /** Copy the first column into a distinct final seam column; never add a strip. */
  closedColumns?: boolean;
}

const OP = "createParametricSheetMesh";
const MAX_VERTICES = 1_000_000;
const MAX_INDICES = 6_000_000;
const MAX_FLOAT32 = 3.4028234663852886e38;

function fail(message: string): never {
  throw new Error(`${OP}: ${message}`);
}

function callback(name: string, value: unknown, required = false): void {
  if ((required || value !== undefined) && typeof value !== "function")
    fail(`${name} must be a function`);
}

function scalar(name: string, value: number, float32 = false): number {
  if (!Number.isFinite(value) || (float32 && Math.abs(value) > MAX_FLOAT32))
    fail(`${name} must be finite${float32 ? " and representable in Float32" : ""}`);
  return value;
}

function point(
  value: Vec3,
  name: string,
  output: Float32Array | Float64Array,
  id: number,
): readonly [number, number, number] {
  if (value === null || typeof value !== "object") fail(`${name} must return a Vec3`);
  const float32 = output instanceof Float32Array;
  const x = scalar(`${name}.x`, value.x, float32);
  const y = scalar(`${name}.y`, value.y, float32);
  const z = scalar(`${name}.z`, value.z, float32);
  output[id * 3] = x;
  output[id * 3 + 1] = y;
  output[id * 3 + 2] = z;
  return [x, y, z];
}

function unit(x: number, y: number, z: number): readonly [number, number, number] | undefined {
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (!Number.isFinite(scale)) fail("normal computation exceeded finite arithmetic");
  if (scale === 0) return undefined;
  const a = x / scale,
    b = y / scale,
    c = z / scale;
  const length = Math.hypot(a, b, c);
  return [a / length, b / length, c / length];
}

function face(
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
): readonly [number, number, number] {
  // Indexed area-weighted arithmetic in a common triangle frame.
  const cx = positions[c * 3] - positions[b * 3];
  const cy = positions[c * 3 + 1] - positions[b * 3 + 1];
  const cz = positions[c * 3 + 2] - positions[b * 3 + 2];
  const ax = positions[a * 3] - positions[b * 3];
  const ay = positions[a * 3 + 1] - positions[b * 3 + 1];
  const az = positions[a * 3 + 2] - positions[b * 3 + 2];
  return [cy * az - cz * ay, cz * ax - cx * az, cx * ay - cy * ax];
}

/**
 * Samples a unit-domain mapped grid with copied numeric results and bounded topology.
 * Generated grid normals use the full sampled surface; area-weighted normals use
 * retained triangles. Authored normals are never replaced. Closed geometry samples
 * only unique columns for positions/normals/inside, but samples UVs and vertex
 * selection independently at both seam endpoints. Callbacks must be deterministic.
 */
export function createParametricSheetMesh(
  options: ParametricSheetMeshOptions,
): ParametricSheetMesh {
  if (options === null || typeof options !== "object") fail("options must be an object");
  const { columns, rows, positionAt, uvAt, normalAt, insideAt, includeCell, includeVertex } =
    options;
  const mode = options.normalMode === undefined ? "grid" : options.normalMode;
  const closed = options.closedColumns === undefined ? false : options.closedColumns;
  const declaredWinding = options.winding;
  if (
    declaredWinding !== undefined &&
    declaredWinding !== "forward" &&
    declaredWinding !== "reverse"
  )
    fail("winding must be forward or reverse");
  if (declaredWinding !== undefined && insideAt !== undefined)
    fail("winding and insideAt are mutually exclusive");
  if (typeof closed !== "boolean") fail("closedColumns must be boolean");
  if (mode !== "grid" && mode !== "area-weighted") fail("normalMode must be grid or area-weighted");
  if (!Number.isSafeInteger(columns) || columns < (closed ? 4 : 2)) fail("invalid columns");
  if (!Number.isSafeInteger(rows) || rows < 2) fail("invalid rows");
  const count = columns * rows;
  const cells = (columns - 1) * (rows - 1);
  if (!Number.isSafeInteger(count) || count > MAX_VERTICES)
    fail(`grid vertex count exceeds ${MAX_VERTICES}`);
  if (!Number.isSafeInteger(cells * 6) || cells * 6 > MAX_INDICES)
    fail(`candidate index count exceeds ${MAX_INDICES}`);
  for (const [name, value] of Object.entries({
    positionAt,
    uvAt,
    normalAt,
    insideAt,
    includeCell,
    includeVertex,
  }))
    callback(name, value, name === "positionAt");
  if (normalAt && (insideAt !== undefined || options.normalMode !== undefined))
    fail("normalAt is mutually exclusive with insideAt and normalMode");

  const cellMask = new Uint8Array(cells);
  const vertexMask = new Uint8Array(count);
  for (let row = 0; row < rows - 1; row += 1)
    for (let column = 0; column < columns - 1; column += 1) {
      const keep = includeCell === undefined ? true : includeCell(column, row);
      if (typeof keep !== "boolean") fail("includeCell must return boolean");
      cellMask[row * (columns - 1) + column] = Number(keep);
    }
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const keep = includeVertex === undefined ? true : includeVertex(column, row);
      if (typeof keep !== "boolean") fail("includeVertex must return boolean");
      vertexMask[row * columns + column] = Number(keep);
    }

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const accumulated =
    !normalAt && mode === "area-weighted" ? new Float64Array(count * 3) : undefined;
  const uvs = new Float32Array(count * 2);
  // Source-frame position-minus-inside directions, not rounded inside points.
  const inside = insideAt ? new Float64Array(count * 3) : undefined;
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const id = row * columns + column;
      const u = column / (columns - 1),
        v = row / (rows - 1);
      const seam = closed && column === columns - 1;
      let sourcePoint: readonly [number, number, number] = [0, 0, 0];
      if (seam) {
        positions.set(positions.subarray(row * columns * 3, row * columns * 3 + 3), id * 3);
      } else sourcePoint = point(positionAt(u, v), "positionAt", positions, id);
      const uv = uvAt === undefined ? [u, v] : uvAt(u, v);
      if (!Array.isArray(uv) || uv.length !== 2) fail("uvAt must return two numbers");
      uvs[id * 2] = scalar("uvAt[0]", uv[0], true);
      uvs[id * 2 + 1] = scalar("uvAt[1]", uv[1], true);
      if (normalAt) {
        if (seam) normals.set(normals.subarray(row * columns * 3, row * columns * 3 + 3), id * 3);
        else {
          const value = normalAt(u, v);
          if (value === null || typeof value !== "object") fail("normalAt must return a Vec3");
          const n = unit(
            scalar("normalAt.x", value.x),
            scalar("normalAt.y", value.y),
            scalar("normalAt.z", value.z),
          );
          if (!n) fail("normalAt must return a nonzero vector");
          normals.set(n, id * 3);
        }
      }
      if (inside && insideAt) {
        if (seam) inside.set(inside.subarray(row * columns * 3, row * columns * 3 + 3), id * 3);
        else {
          const insidePoint = point(insideAt(u, v), "insideAt", inside, id);
          // This direction belongs to the caller's frame before storage quantization.
          // Mixing a Float32 position with an unrounded point can turn exact tangency
          // into an arbitrary positive or negative orientation hint.
          for (let axis = 0; axis < 3; axis += 1)
            inside[id * 3 + axis] = scalar(
              "insideAt direction",
              sourcePoint[axis] - insidePoint[axis],
            );
        }
      }
    }

  const candidate = new Uint32Array(cells * 6);
  const referenced = new Uint8Array(count);
  let length = 0;
  const emit = (a: number, b: number, c: number) => {
    if (!(vertexMask[a] && vertexMask[b] && vertexMask[c])) return;
    const f = face(positions, a, b, c);
    if (!unit(...f)) fail(`stored triangle ${length / 3} is degenerate`);
    candidate[length++] = a;
    candidate[length++] = b;
    candidate[length++] = c;
    referenced[a] = referenced[b] = referenced[c] = 1;
    if (accumulated)
      for (const id of [a, b, c])
        for (let axis = 0; axis < 3; axis += 1) {
          const value = accumulated[id * 3 + axis] + f[axis];
          accumulated[id * 3 + axis] = scalar("area-weighted accumulation", value);
        }
  };
  for (let row = 0; row < rows - 1; row += 1)
    for (let column = 0; column < columns - 1; column += 1) {
      if (!cellMask[row * (columns - 1) + column]) continue;
      const a = row * columns + column,
        b = a + 1,
        c = a + columns,
        d = c + 1;
      emit(a, c, b);
      emit(b, c, d);
    }

  if (!normalAt) {
    if (accumulated && closed)
      for (let row = 0; row < rows; row += 1) {
        const first = row * columns,
          last = first + columns - 1;
        for (let axis = 0; axis < 3; axis += 1) {
          const sum = scalar(
            "seam accumulation",
            accumulated[first * 3 + axis] + accumulated[last * 3 + axis],
          );
          accumulated[first * 3 + axis] = accumulated[last * 3 + axis] = sum;
        }
      }
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1) {
        const id = row * columns + column;
        const seamPartner =
          column === 0 ? id + columns - 1 : column === columns - 1 ? id - columns + 1 : id;
        const needed = referenced[id] || (closed && referenced[seamPartner]);
        let x = accumulated?.[id * 3] ?? 0,
          y = accumulated?.[id * 3 + 1] ?? 0,
          z = accumulated?.[id * 3 + 2] ?? 0;
        if (mode === "grid") {
          const logical = closed && column === columns - 1 ? 0 : column;
          const left = closed ? (logical + columns - 2) % (columns - 1) : Math.max(0, logical - 1);
          const right = closed ? (logical + 1) % (columns - 1) : Math.min(columns - 1, logical + 1);
          const previous = Math.max(0, row - 1),
            next = Math.min(rows - 1, row + 1);
          const ax =
            positions[(next * columns + logical) * 3] -
            positions[(previous * columns + logical) * 3];
          const ay =
            positions[(next * columns + logical) * 3 + 1] -
            positions[(previous * columns + logical) * 3 + 1];
          const az =
            positions[(next * columns + logical) * 3 + 2] -
            positions[(previous * columns + logical) * 3 + 2];
          const bx = positions[(row * columns + right) * 3] - positions[(row * columns + left) * 3];
          const by =
            positions[(row * columns + right) * 3 + 1] - positions[(row * columns + left) * 3 + 1];
          const bz =
            positions[(row * columns + right) * 3 + 2] - positions[(row * columns + left) * 3 + 2];
          x = ay * bz - az * by;
          y = az * bx - ax * bz;
          z = ax * by - ay * bx;
        }
        let n = unit(x, y, z);
        if (!n) {
          if (needed)
            fail(
              `normal computation failed at sample ${id}; supply normalAt or partition the surface`,
            );
          n = [0, 1, 0];
        }
        if (inside && needed) {
          const reference = unit(inside[id * 3], inside[id * 3 + 1], inside[id * 3 + 2]);
          if (!reference) fail(`insideAt coincides with sample ${id}`);
          const direction = n[0] * reference[0] + n[1] * reference[1] + n[2] * reference[2];
          if (direction === 0) fail(`insideAt is tangent at sample ${id}`);
          if (direction < 0) n = [-n[0], -n[1], -n[2]];
        }
        if (declaredWinding === "reverse") n = [-n[0], -n[1], -n[2]];
        normals.set(n, id * 3);
      }
  }

  const faceNormals = new Float32Array(length);
  let winding = 0;
  for (let offset = 0; offset < length; offset += 3) {
    const ids = [candidate[offset], candidate[offset + 1], candidate[offset + 2]];
    const raw = face(positions, ids[0], ids[1], ids[2]);
    const f = unit(...raw);
    if (!f) fail(`stored triangle ${offset / 3} is degenerate`);
    let direction = 0;
    for (const id of ids)
      direction +=
        raw[0] * normals[id * 3] + raw[1] * normals[id * 3 + 1] + raw[2] * normals[id * 3 + 2];
    const sign =
      declaredWinding === "forward" ? 1 : declaredWinding === "reverse" ? -1 : Math.sign(direction);
    if (sign === 0) fail(`ambiguous winding at triangle ${offset / 3}`);
    if (winding && sign !== winding)
      fail(`inconsistent orientation at triangle ${offset / 3}; partition the surface`);
    winding = sign;
    faceNormals.set(sign < 0 ? [-f[0], -f[1], -f[2]] : f, offset);
    if (sign < 0)
      [candidate[offset + 1], candidate[offset + 2]] = [
        candidate[offset + 2],
        candidate[offset + 1],
      ];
  }

  const repair = new Uint8Array(length);
  let extra = 0;
  for (let offset = 0; offset < length; offset += 3) {
    const raw = face(positions, candidate[offset], candidate[offset + 1], candidate[offset + 2]);
    for (let corner = 0; corner < 3; corner += 1) {
      const id = candidate[offset + corner];
      const dot =
        raw[0] * normals[id * 3] + raw[1] * normals[id * 3 + 1] + raw[2] * normals[id * 3 + 2];
      if (dot <= 0) {
        if (normalAt) fail(`authored normal opposes triangle ${offset / 3} at sample ${id}`);
        if (inside) {
          const reference = unit(inside[id * 3], inside[id * 3 + 1], inside[id * 3 + 2]);
          if (
            !reference ||
            raw[0] * reference[0] + raw[1] * reference[1] + raw[2] * reference[2] <= 0
          )
            fail(`insideAt opposes triangle ${offset / 3} at sample ${id}`);
        }
        repair[offset + corner] = 1;
        extra += 1;
      }
    }
  }
  const finalCount = count + extra;
  if (finalCount > MAX_VERTICES) fail(`repaired vertex count exceeds ${MAX_VERTICES}`);
  const outputPositions = extra ? new Float32Array(finalCount * 3) : positions;
  const outputNormals = extra ? new Float32Array(finalCount * 3) : normals;
  const outputUvs = extra ? new Float32Array(finalCount * 2) : uvs;
  if (extra) {
    outputPositions.set(positions);
    outputNormals.set(normals);
    outputUvs.set(uvs);
  }
  const sourceVertex = new Uint32Array(finalCount);
  for (let id = 0; id < count; id += 1) sourceVertex[id] = id;
  const indices = finalCount <= 65_536 ? new Uint16Array(length) : new Uint32Array(length);
  let cursor = count;
  for (let offset = 0; offset < length; offset += 1) {
    const id = candidate[offset];
    if (!repair[offset]) indices[offset] = id;
    else {
      outputPositions.set(positions.subarray(id * 3, id * 3 + 3), cursor * 3);
      outputNormals.set(
        faceNormals.subarray(offset - (offset % 3), offset - (offset % 3) + 3),
        cursor * 3,
      );
      outputUvs.set(uvs.subarray(id * 2, id * 2 + 2), cursor * 2);
      sourceVertex[cursor] = id;
      indices[offset] = cursor++;
    }
  }
  return {
    positions: outputPositions,
    normals: outputNormals,
    uvs: outputUvs,
    indices,
    sourceVertex,
  };
}
