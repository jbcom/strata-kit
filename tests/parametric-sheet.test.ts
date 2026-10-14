import { describe, expect, it, vi } from "vitest";
import {
  createParametricSheetMesh,
  type ParametricSheetMesh,
  type ParametricSheetMeshOptions,
} from "../src/parametricSheet.ts";

const plane = (u: number, v: number) => ({ x: 2 * u, y: 3 * v, z: 0 });
const basic: ParametricSheetMeshOptions = { columns: 2, rows: 2, positionAt: plane };
function xyz(values: Float32Array, vertex: number): number[] {
  return Array.from(values.subarray(vertex * 3, vertex * 3 + 3));
}
function expectVector(actual: readonly number[], expected: readonly number[]): void {
  expected.forEach((value, axis) => {
    expect(actual[axis]).toBeCloseTo(value, 6);
  });
}
function normalized(x: number, y: number, z: number): number[] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}
/** Independent stored-triangle predicate, not the builder's normal estimator. */
function expectAligned(mesh: ParametricSheetMesh): void {
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const ids = Array.from(mesh.indices.subarray(offset, offset + 3));
    const [a, b, c] = ids.map((id) => xyz(mesh.positions, id));
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    expect(Math.hypot(...face)).toBeGreaterThan(0);
    for (const id of ids) {
      const normal = xyz(mesh.normals, id);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
      expect(face.reduce((dot, value, axis) => dot + value * normal[axis], 0)).toBeGreaterThan(0);
    }
  }
}
function cylinder(u: number, v: number) {
  return { x: Math.cos(u * Math.PI * 2), y: v, z: Math.sin(u * Math.PI * 2) };
}

describe("parametric sheet analytic geometry", () => {
  it("uses column U, row V, and row-cross-column normals on an independent plane", () => {
    const mesh = createParametricSheetMesh(basic);
    expect([...mesh.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 3, 0, 2, 3, 0]);
    expect([...mesh.uvs]).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
    expect([...mesh.indices]).toEqual([0, 2, 1, 1, 2, 3]);
    expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3]);
    for (let id = 0; id < 4; id++) expectVector(xyz(mesh.normals, id), [0, 0, -1]);
    expectAligned(mesh);
  });
  it("maps variable row widths and custom UVs outside the unit tile", () => {
    const mesh = createParametricSheetMesh({
      columns: 3,
      rows: 3,
      positionAt: (u, v) => ({ x: (u - 0.5) * 2 * (1 + v), y: 3 * v, z: 0 }),
      uvAt: (u, v) => [2 * u - 1, 3 * v + 2],
    });
    expect(xyz(mesh.positions, 0)).toEqual([-1, 0, 0]);
    expect(xyz(mesh.positions, 2)).toEqual([1, 0, 0]);
    expect(xyz(mesh.positions, 6)).toEqual([-2, 3, 0]);
    expect(xyz(mesh.positions, 8)).toEqual([2, 3, 0]);
    expect([...mesh.uvs]).toEqual([-1, 2, 0, 2, 1, 2, -1, 3.5, 0, 3.5, 1, 3.5, -1, 5, 0, 5, 1, 5]);
    for (let id = 0; id < 9; id++) expectVector(xyz(mesh.normals, id), [0, 0, -1]);
    expectAligned(mesh);
  });
  it("matches analytic bilinear saddle normals at non-square-grid boundaries", () => {
    const mesh = createParametricSheetMesh({
      columns: 5,
      rows: 3,
      positionAt: (u, v) => ({ x: u, y: v, z: u * v }),
    });
    for (let id = 0; id < 15; id++) {
      const u = (id % 5) / 4;
      const v = Math.floor(id / 5) / 2;
      expectVector(xyz(mesh.normals, id), normalized(v, u, -1));
    }
    expectAligned(mesh);
  });
  it("keeps separately authored folded patches independent at coincident boundaries", () => {
    const flat = createParametricSheetMesh({ ...basic, normalAt: () => ({ x: 0, y: 0, z: -1 }) });
    const folded = createParametricSheetMesh({
      ...basic,
      positionAt: (u, v) => ({ x: 0, y: 3 * v, z: 2 * u }),
      normalAt: () => ({ x: 1, y: 0, z: 0 }),
    });
    expect(xyz(flat.positions, 0)).toEqual(xyz(folded.positions, 0));
    expect(xyz(flat.positions, 2)).toEqual(xyz(folded.positions, 2));
    expectVector(xyz(flat.normals, 0), [0, 0, -1]);
    expectVector(xyz(folded.normals, 0), [1, 0, 0]);
    expectAligned(flat);
    expectAligned(folded);
  });
  it("normalizes authored vectors safely and reverses the entire patch coherently", () => {
    const mesh = createParametricSheetMesh({
      ...basic,
      normalAt: () => ({ x: 0, y: 0, z: Number.MAX_VALUE }),
    });
    expect([...mesh.indices]).toEqual([0, 1, 2, 1, 3, 2]);
    for (let id = 0; id < 4; id++) expectVector(xyz(mesh.normals, id), [0, 0, 1]);
    expect(mesh.positions).toHaveLength(12);
    expectAligned(mesh);
  });
  it("treats insideAt as a point in the same frame, not a direction", () => {
    const raised = {
      ...basic,
      positionAt: (u: number, v: number) => ({ x: 2 * u, y: 3 * v, z: 5 }),
    };
    const below = createParametricSheetMesh({ ...raised, insideAt: () => ({ x: 0, y: 0, z: 4 }) });
    expect([...below.indices]).toEqual([0, 1, 2, 1, 3, 2]);
    const above = createParametricSheetMesh({ ...raised, insideAt: () => ({ x: 0, y: 0, z: 6 }) });
    expect([...above.indices]).toEqual([0, 2, 1, 1, 2, 3]);
    expectVector(xyz(below.normals, 0), [0, 0, 1]);
    expectVector(xyz(above.normals, 0), [0, 0, -1]);
    expectAligned(below);
    expectAligned(above);
  });
  it("uses retained face areas for area-weighted normals, distinct from grid secants", () => {
    const options = { ...basic, positionAt: (u: number, v: number) => ({ x: u, y: v, z: u * v }) };
    const weighted = createParametricSheetMesh({ ...options, normalMode: "area-weighted" });
    // Face area vectors are (0,0,-1) and (1,1,-1); shared corners sum both.
    expectVector(xyz(weighted.normals, 0), [0, 0, -1]);
    expectVector(xyz(weighted.normals, 1), normalized(1, 1, -2));
    expectVector(xyz(weighted.normals, 2), normalized(1, 1, -2));
    expectVector(xyz(weighted.normals, 3), normalized(1, 1, -1));
    const grid = createParametricSheetMesh({
      ...options,
      includeVertex: (column, row) => column !== 1 || row !== 1,
    });
    const selectedWeighted = createParametricSheetMesh({
      ...options,
      normalMode: "area-weighted",
      includeVertex: (column, row) => column !== 1 || row !== 1,
    });
    expectVector(xyz(grid.normals, 1), normalized(0, 1, -1));
    expectVector(xyz(selectedWeighted.normals, 1), [0, 0, -1]);
    expectVector(xyz(selectedWeighted.normals, 3), [0, 1, 0]);
    expectAligned(weighted);
  });
});

describe("parametric sheet selection and source correspondence", () => {
  it("retains either half of a quad independently and does not compact samples", () => {
    const first = createParametricSheetMesh({
      ...basic,
      includeVertex: (column, row) => column !== 1 || row !== 1,
    });
    const second = createParametricSheetMesh({
      ...basic,
      includeVertex: (column, row) => column !== 0 || row !== 0,
    });
    expect([...first.indices]).toEqual([0, 2, 1]);
    expect([...second.indices]).toEqual([1, 2, 3]);
    for (const mesh of [first, second]) {
      expect(mesh.positions).toHaveLength(12);
      expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3]);
      expectAligned(mesh);
    }
  });
  it("combines full-cell and vertex masks with AND in row-major topology", () => {
    const mesh = createParametricSheetMesh({
      ...basic,
      columns: 3,
      rows: 3,
      includeCell: (column, row) => column === row,
      includeVertex: (column, row) => column !== 2 || row !== 2,
    });
    expect([...mesh.indices]).toEqual([0, 3, 1, 1, 3, 4, 4, 7, 5]);
    expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("samples empty selections and gives unreferenced singular normals a deterministic fallback", () => {
    const positionAt = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
    const mesh = createParametricSheetMesh({ ...basic, positionAt, includeCell: () => false });
    expect(positionAt).toHaveBeenCalledTimes(4);
    expect(mesh.indices).toHaveLength(0);
    expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3]);
    expect([...mesh.normals]).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    expect(
      createParametricSheetMesh({ ...basic, includeVertex: () => false }).indices,
    ).toHaveLength(0);
  });
  it("duplicates only conflicting generated corners and keeps exact sample identity", () => {
    const positionAt = vi.fn((u: number, v: number) => ({
      x: 0.2 * u,
      y: u <= 0.5 ? 6 * u : 3 - 0.1 * (u - 0.5),
      z: v,
    }));
    const mesh = createParametricSheetMesh({
      columns: 3,
      rows: 2,
      positionAt,
      uvAt: () => [-2, 7],
    });
    expect(positionAt).toHaveBeenCalledTimes(6);
    expect(mesh.positions).toHaveLength(27);
    expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3, 4, 5, 1, 4, 4]);
    expect([...mesh.indices]).toEqual([0, 3, 1, 1, 3, 4, 6, 7, 2, 2, 8, 5]);
    for (const id of [6, 7, 8]) {
      expect(xyz(mesh.positions, id)).toEqual(xyz(mesh.positions, mesh.sourceVertex[id]));
      expect([...mesh.uvs.subarray(id * 2, id * 2 + 2)]).toEqual([-2, 7]);
    }
    expectAligned(mesh);
  });
});

describe("parametric sheet callback ownership", () => {
  it("runs selectors first and samples each vertex in position/UV/normal order", () => {
    const calls: string[] = [];
    createParametricSheetMesh({
      ...basic,
      includeCell: (c, r) => {
        calls.push(`cell:${c},${r}`);
        return true;
      },
      includeVertex: (c, r) => {
        calls.push(`vertex:${c},${r}`);
        return true;
      },
      positionAt: (u, v) => {
        calls.push(`position:${u},${v}`);
        return plane(u, v);
      },
      uvAt: (u, v) => {
        calls.push(`uv:${u},${v}`);
        return [u, v];
      },
      normalAt: (u, v) => {
        calls.push(`normal:${u},${v}`);
        return { x: 0, y: 0, z: -1 };
      },
    });
    expect(calls).toEqual([
      "cell:0,0",
      "vertex:0,0",
      "vertex:1,0",
      "vertex:0,1",
      "vertex:1,1",
      "position:0,0",
      "uv:0,0",
      "normal:0,0",
      "position:1,0",
      "uv:1,0",
      "normal:1,0",
      "position:0,1",
      "uv:0,1",
      "normal:0,1",
      "position:1,1",
      "uv:1,1",
      "normal:1,1",
    ]);
  });
  it("copies reused scratch returns immediately and snapshots options before callbacks", () => {
    const scratch = { x: 0, y: 0, z: 0 };
    const uv: [number, number] = [0, 0];
    const normal = { x: 0, y: 0, z: -5 };
    const options: ParametricSheetMeshOptions = {
      ...basic,
      positionAt: (u, v) => {
        Object.assign(scratch, plane(u, v));
        options.positionAt = () => ({ x: 999, y: 999, z: 999 });
        options.uvAt = () => [99, 99];
        options.normalAt = () => ({ x: 0, y: 0, z: 1 });
        options.columns = 100;
        return scratch;
      },
      uvAt: (u, v) => {
        uv[0] = u - 2;
        uv[1] = v + 3;
        return uv;
      },
      normalAt: () => normal,
    };
    const mesh = createParametricSheetMesh(options);
    Object.assign(scratch, { x: 42, y: 42, z: 42 });
    uv.fill(42);
    normal.z = 42;
    expect([...mesh.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 3, 0, 2, 3, 0]);
    expect([...mesh.uvs]).toEqual([-2, 3, -1, 3, -2, 4, -1, 4]);
    expectVector(xyz(mesh.normals, 0), [0, 0, -1]);
    expectVector(xyz(mesh.normals, 3), [0, 0, -1]);
  });
  it("copies inside-point scratch values after UV sampling on each original vertex", () => {
    const calls: string[] = [];
    const scratch = { x: 0, y: 0, z: 1 };
    const mesh = createParametricSheetMesh({
      ...basic,
      positionAt: (u, v) => {
        calls.push(`position:${u},${v}`);
        return plane(u, v);
      },
      uvAt: (u, v) => {
        calls.push(`uv:${u},${v}`);
        return [u, v];
      },
      insideAt: (u, v) => {
        calls.push(`inside:${u},${v}`);
        Object.assign(scratch, { x: 2 * u, y: 3 * v, z: 1 });
        return scratch;
      },
    });
    expect(calls).toEqual([
      "position:0,0",
      "uv:0,0",
      "inside:0,0",
      "position:1,0",
      "uv:1,0",
      "inside:1,0",
      "position:0,1",
      "uv:0,1",
      "inside:0,1",
      "position:1,1",
      "uv:1,1",
      "inside:1,1",
    ]);
    scratch.z = -1;
    for (const id of [0, 1, 2, 3]) expectVector(xyz(mesh.normals, id), [0, 0, -1]);
  });
  it("supports reentrant sampling and preserves original callback exceptions", () => {
    let nested: ParametricSheetMesh | undefined;
    const outer = createParametricSheetMesh({
      ...basic,
      positionAt: (u, v) => {
        nested ??= createParametricSheetMesh(basic);
        return plane(u, v);
      },
    });
    expect(outer.positions).toEqual(nested?.positions);
    expect(outer.positions).not.toBe(nested?.positions);
    const failure = new Error("sampler stopped");
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        uvAt: () => {
          throw failure;
        },
      }),
    ).toThrow(failure);
  });
});

describe("parametric sheet closed-column seam", () => {
  it("copies geometry/authored normals without sampling U=1, retaining independent UV/selection", () => {
    const positionAt = vi.fn((u: number, v: number) => {
      if (u === 1) throw new Error("endpoint geometry must be copied");
      return cylinder(u, v);
    });
    const normalAt = vi.fn((u: number) => {
      if (u === 1) throw new Error("endpoint normal must be copied");
      return { x: Math.cos(u * Math.PI * 2), y: 0, z: Math.sin(u * Math.PI * 2) };
    });
    const uvAt = vi.fn((u: number, v: number): [number, number] => [u * 4 - 1, v + 2]);
    const includeVertex = vi.fn(() => true);
    const mesh = createParametricSheetMesh({
      columns: 5,
      rows: 2,
      closedColumns: true,
      positionAt,
      normalAt,
      uvAt,
      includeVertex,
    });
    expect(positionAt).toHaveBeenCalledTimes(8);
    expect(normalAt).toHaveBeenCalledTimes(8);
    expect(uvAt).toHaveBeenCalledTimes(10);
    expect(includeVertex).toHaveBeenCalledTimes(10);
    expect(includeVertex.mock.calls).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    expect(mesh.indices).toHaveLength(24);
    expect(mesh.positions).toHaveLength(30);
    expect([...mesh.sourceVertex]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(xyz(mesh.positions, 4)).toEqual(xyz(mesh.positions, 0));
    expect(xyz(mesh.positions, 9)).toEqual(xyz(mesh.positions, 5));
    expect(xyz(mesh.normals, 4)).toEqual(xyz(mesh.normals, 0));
    expect([...mesh.uvs.subarray(0, 2)]).toEqual([-1, 2]);
    expect([...mesh.uvs.subarray(8, 10)]).toEqual([3, 2]);
    expectAligned(mesh);
  });
  it("wraps generated derivative neighbors and skips U=1 inside-point sampling", () => {
    const insideAt = vi.fn((u: number, v: number) => {
      if (u === 1) throw new Error("endpoint inside point must be copied");
      return { x: 0, y: v, z: 0 };
    });
    const mesh = createParametricSheetMesh({
      columns: 5,
      rows: 3,
      closedColumns: true,
      positionAt: cylinder,
      insideAt,
    });
    expect(insideAt).toHaveBeenCalledTimes(12);
    for (const row of [0, 1, 2]) {
      const first = row * 5;
      expectVector(xyz(mesh.normals, first), [1, 0, 0]);
      expect(xyz(mesh.normals, first + 4)).toEqual(xyz(mesh.normals, first));
      expectVector(xyz(mesh.normals, first + 1), [0, 0, 1]);
      expectVector(xyz(mesh.normals, first + 2), [-1, 0, 0]);
    }
    expectAligned(mesh);
  });
  it.each([0, 3])(
    "orients copied seam partners when only cell %s references one endpoint",
    (column) => {
      const mesh = createParametricSheetMesh({
        columns: 5,
        rows: 2,
        closedColumns: true,
        positionAt: cylinder,
        includeCell: (c) => c === column,
        insideAt: (u, v) => ({
          x: 2 * Math.cos(u * Math.PI * 2),
          y: v,
          z: 2 * Math.sin(u * Math.PI * 2),
        }),
      });
      expect(mesh.indices).toHaveLength(6);
      expectVector(xyz(mesh.normals, 0), [-1, 0, 0]);
      expect(xyz(mesh.normals, 4)).toEqual(xyz(mesh.normals, 0));
      expect(xyz(mesh.normals, 9)).toEqual(xyz(mesh.normals, 5));
      expectAligned(mesh);
    },
  );
  it("combines seam face areas while preserving endpoint provenance and independent masks", () => {
    const mesh = createParametricSheetMesh({
      columns: 5,
      rows: 2,
      closedColumns: true,
      positionAt: cylinder,
      normalMode: "area-weighted",
      includeVertex: (column) => column !== 0,
    });
    expect([...mesh.indices]).not.toContain(0);
    expect([...mesh.indices]).toContain(4);
    expect(xyz(mesh.normals, 0)).toEqual(xyz(mesh.normals, 4));
    expect(xyz(mesh.normals, 5)).toEqual(xyz(mesh.normals, 9));
    expect(mesh.sourceVertex[4]).toBe(4);
    expect(mesh.sourceVertex[9]).toBe(9);
    expectAligned(mesh);
  });
});

describe("parametric sheet numeric and resource contracts", () => {
  it.each(["grid", "area-weighted"] as const)(
    "preserves scale-invariant analytic normals in %s mode",
    (normalMode) => {
      for (const scale of [1e-30, 1, 1e20]) {
        const mesh = createParametricSheetMesh({
          ...basic,
          normalMode,
          positionAt: (u, v) => ({ x: scale * u, y: 0, z: scale * v }),
        });
        expect(mesh.positions).toHaveLength(12);
        for (const id of [0, 1, 2, 3]) expectVector(xyz(mesh.normals, id), [0, 1, 0]);
        expectAligned(mesh);
      }
    },
  );
  it("validates resource/count bounds before callbacks, even with an empty mask", () => {
    const positionAt = vi.fn(plane);
    const includeCell = vi.fn(() => false);
    for (const [columns, rows] of [
      [1001, 1000],
      [Number.MAX_SAFE_INTEGER, 2],
      [Number.MAX_SAFE_INTEGER + 1, 2],
      [1, 2],
      [2, 1],
      [2.5, 2],
      [NaN, 2],
      [2, Infinity],
    ]) {
      expect(() => createParametricSheetMesh({ columns, rows, positionAt, includeCell })).toThrow();
    }
    expect(positionAt).not.toHaveBeenCalled();
    expect(includeCell).not.toHaveBeenCalled();
    const boundary = new Error("accepted exact full-grid cap");
    expect(() =>
      createParametricSheetMesh({
        columns: 1000,
        rows: 1000,
        positionAt,
        includeCell: () => {
          throw boundary;
        },
      }),
    ).toThrow(boundary);
    expect(() => createParametricSheetMesh({ ...basic, columns: 3, closedColumns: true })).toThrow(
      /columns/,
    );
  });
  it("uses final-count Uint16/Uint32 boundaries, independent of source ID width", () => {
    const atBoundary = createParametricSheetMesh({
      ...basic,
      columns: 256,
      rows: 256,
      includeCell: () => false,
    });
    const above = createParametricSheetMesh({
      ...basic,
      columns: 257,
      rows: 256,
      includeCell: () => false,
    });
    expect(atBoundary.positions).toHaveLength(65_536 * 3);
    expect(atBoundary.indices).toBeInstanceOf(Uint16Array);
    expect(above.indices).toBeInstanceOf(Uint32Array);
    expect(atBoundary.sourceVertex).toBeInstanceOf(Uint32Array);
    expect(above.sourceVertex.at(-1)).toBe(65_791);
  });
  it("promotes index width after generated corner repair and retains sample IDs", () => {
    // At column 128 the central secant slope is 57/8; the retained descending
    // face slope is -1/2. Their normal dot numerator is 1-(57/8)/2 < 0.
    expect(1 - 57 / 8 / 2).toBeLessThan(0);
    const mesh = createParametricSheetMesh({
      columns: 256,
      rows: 256,
      positionAt: (u, v) => ({ x: 0.2 * u, y: u <= 0.5 ? 6 * u : 3 - 0.1 * (u - 0.5), z: v }),
    });
    expect(mesh.positions.length / 3).toBeGreaterThan(65_536);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.sourceVertex).toHaveLength(mesh.positions.length / 3);
    expect([...mesh.sourceVertex.subarray(0, 4)]).toEqual([0, 1, 2, 3]);
    for (let id = 65_536; id < mesh.sourceVertex.length; id++) {
      expect(mesh.sourceVertex[id]).toBeLessThan(65_536);
      expect(xyz(mesh.positions, id)).toEqual(xyz(mesh.positions, mesh.sourceVertex[id]));
    }
  });
  it("rejects malformed callbacks, enum/boolean options and selector results", () => {
    for (const patch of [
      { positionAt: undefined },
      { uvAt: 3 },
      { normalAt: 3 },
      { insideAt: 3 },
      { includeCell: 3 },
      { includeVertex: 3 },
      { normalMode: "other" },
      { closedColumns: 1 },
    ]) {
      expect(() =>
        createParametricSheetMesh({ ...basic, ...patch } as unknown as ParametricSheetMeshOptions),
      ).toThrow();
    }
    expect(() =>
      createParametricSheetMesh(null as unknown as ParametricSheetMeshOptions),
    ).toThrow();
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        includeCell: () => 1,
      } as unknown as ParametricSheetMeshOptions),
    ).toThrow(/includeCell.*boolean/);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        includeVertex: () => null,
      } as unknown as ParametricSheetMeshOptions),
    ).toThrow(/includeVertex.*boolean/);
  });
  it("rejects nonfinite/Float32-overflow samples and quantized zero-area triangles", () => {
    for (const value of [NaN, Infinity, 3.5e38]) {
      expect(() =>
        createParametricSheetMesh({ ...basic, positionAt: () => ({ x: value, y: 0, z: 0 }) }),
      ).toThrow(/positionAt/);
      expect(() => createParametricSheetMesh({ ...basic, uvAt: () => [value, 0] })).toThrow(/uvAt/);
    }
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        uvAt: () => [0],
      } as unknown as ParametricSheetMeshOptions),
    ).toThrow(/uvAt/);
    expect(() =>
      createParametricSheetMesh({ ...basic, positionAt: (u, v) => ({ x: u * 1e-50, y: v, z: 0 }) }),
    ).toThrow(/degenerate/);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        positionAt: () => null,
      } as unknown as ParametricSheetMeshOptions),
    ).toThrow(/Vec3/);
    expect(() =>
      createParametricSheetMesh({ ...basic, insideAt: () => ({ x: 0, y: 0, z: Infinity }) }),
    ).toThrow(/insideAt/);
  });
  it("rejects normal conflicts without silently repairing authored data", () => {
    const normalAt = () => ({ x: 0, y: 0, z: -1 });
    expect(() =>
      createParametricSheetMesh({ ...basic, normalAt, insideAt: () => ({ x: 0, y: 0, z: 1 }) }),
    ).toThrow(/mutually exclusive/);
    expect(() => createParametricSheetMesh({ ...basic, normalAt, normalMode: "grid" })).toThrow(
      /mutually exclusive/,
    );
    expect(() =>
      createParametricSheetMesh({ ...basic, normalAt: () => ({ x: 0, y: 0, z: 0 }) }),
    ).toThrow(/nonzero/);
    expect(() =>
      createParametricSheetMesh({ ...basic, normalAt: () => ({ x: 1, y: 0, z: 0 }) }),
    ).toThrow(/winding/);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        normalAt: (u, v) => ({ x: 0, y: 0, z: u === 1 && v === 0 ? 1 : -1 }),
      }),
    ).toThrow(/authored normal opposes/);
    expect(() => createParametricSheetMesh({ ...basic, insideAt: plane })).toThrow(/coincides/);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        insideAt: (u, v) => ({ x: 2 * u - 1, y: 3 * v, z: 0 }),
      }),
    ).toThrow(/tangent/);
  });
  it("rejects exactly tangent authored corners against the raw stored face", () => {
    // The first triangle area vector is exactly (1,2,3), whose dot with (-1,-1,1) is zero.
    expect(1 * -1 + 2 * -1 + 3 * 1).toBe(0);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        positionAt: (u, v) => ({ x: 3 * u + 2 * v, y: -v, z: -u }),
        normalAt: (u, v) => (u === 0 && v === 0 ? { x: -1, y: -1, z: 1 } : { x: 1, y: 2, z: 3 }),
      }),
    ).toThrow(/authored normal opposes/);
  });
  it("rejects a strictly negative authored incidence hidden by rounded face normals", () => {
    // Float32 retains the tiny -2**-28 height at the second corner. The raw first
    // face is (1,2,3-2**-27), so its dot with (-1,-1,1) is strictly negative.
    expect(-1 - 2 + (3 - 2 ** -27)).toBeLessThan(0);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        positionAt: (u, v) => ({ x: 3 * u + 2 * v, y: -v - u * 2 ** -28, z: -u }),
        normalAt: (u, v) => (u === 0 && v === 0 ? { x: -1, y: -1, z: 1 } : { x: 1, y: 2, z: 3 }),
      }),
    ).toThrow(/authored normal opposes/);
  });
  it("rejects cancelled grid derivatives and contradictory patch orientation", () => {
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        columns: 3,
        positionAt: (u, v) => ({ x: u === 0.5 ? 1 : 0, y: v, z: 0 }),
      }),
    ).toThrow(/normal computation failed/);
    expect(() =>
      createParametricSheetMesh({
        ...basic,
        columns: 3,
        positionAt: (u, v) => ({ x: u === 0.5 ? 1 : 0, y: v, z: 0 }),
        normalAt: () => ({ x: 0, y: 0, z: -1 }),
      }),
    ).toThrow(/inconsistent orientation/);
  });
});
