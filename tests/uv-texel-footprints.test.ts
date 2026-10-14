import { describe, expect, it } from "vitest";

import {
  type NeutralIndexedMesh,
  type UvTexelFootprint,
  type UvTexelFootprintOptions,
  visitUvTexelFootprints,
} from "../src/reskin.ts";

function triangles(...uvTriangles: readonly number[][]): NeutralIndexedMesh {
  const uvs = uvTriangles.flat();
  return {
    positions: new Float32Array(
      uvs.flatMap((value, index) => (index % 2 === 0 ? [value] : [value, 0])),
    ),
    indices: new Uint32Array(Array.from({ length: uvs.length / 2 }, (_, index) => index)),
    uvs: new Float32Array(uvs),
  };
}

function collect(mesh: NeutralIndexedMesh, options: UvTexelFootprintOptions) {
  const footprints: UvTexelFootprint[] = [];
  const result = visitUvTexelFootprints(mesh, options, (footprint) => footprints.push(footprint));
  return { footprints, result };
}

const unitTriangle = [0, 0, 1, 0, 0, 1];
const selectedMesh = () =>
  triangles([0, 0, 0.25, 0, 0, 0.25], [0.5, 0, 0.75, 0, 0.5, 0.25], [0, 0.5, 0.25, 0.5, 0, 0.75]);

describe("raw UV texel footprints", () => {
  it("reports square-unit areas without normalising them or counting filled cells", () => {
    const { footprints, result } = collect(triangles(unitTriangle), { width: 2, height: 2 });
    expect(result).toEqual({ triangles: 1, footprints: 3 });
    expect(footprints.map(({ column, row, weight }) => [column, row, weight])).toEqual([
      [0, 0, 1],
      [1, 0, 0.5],
      [0, 1, 0.5],
    ]);
    // The UV triangle has area 1/2; a 2x2 grid scales it to 2 square texels.
    expect(footprints.reduce((sum, footprint) => sum + footprint.weight, 0)).toBe(2);
    const nonsquare = collect(triangles(unitTriangle), { width: 4, height: 2 });
    expect(nonsquare.footprints.reduce((sum, footprint) => sum + footprint.weight, 0)).toBeCloseTo(
      4,
      14,
    );
    expect(nonsquare.footprints.every(({ weight }) => weight > 0 && weight <= 1)).toBe(true);
  });

  it("uses bottom rows by default and only relabels rows for top origin", () => {
    const mesh = triangles(unitTriangle);
    const bottom = collect(mesh, { width: 2, height: 2 });
    const explicitBottom = collect(mesh, { width: 2, height: 2, rowOrigin: "bottom" });
    const top = collect(mesh, { width: 2, height: 2, rowOrigin: "top" });
    expect(explicitBottom).toEqual(bottom);
    expect(top.result).toEqual(bottom.result);
    expect(top.footprints.map(({ column, row }) => [column, row])).toEqual([
      [0, 1],
      [1, 1],
      [0, 0],
    ]);
    expect(top.footprints).toEqual(
      bottom.footprints.map((footprint) => ({ ...footprint, row: 1 - footprint.row })),
    );
  });

  it.each([[2, 0], new Uint16Array([2, 0]), new Uint32Array([2, 0])])(
    "preserves declared selection order and source IDs for %j",
    (selection) => {
      const { footprints, result } = collect(selectedMesh(), {
        width: 4,
        height: 4,
        triangles: selection,
      });
      expect(result).toEqual({ triangles: 2, footprints: 2 });
      expect(
        footprints.map(({ triangle, column, row, weight }) => [triangle, column, row, weight]),
      ).toEqual([
        [2, 0, 2, 0.5],
        [0, 0, 0, 0.5],
      ]);
    },
  );

  it("visits every source triangle in source order when selection is omitted", () => {
    const { footprints, result } = collect(selectedMesh(), { width: 4, height: 4 });
    expect(result).toEqual({ triangles: 3, footprints: 3 });
    expect(footprints.map(({ triangle }) => triangle)).toEqual([0, 1, 2]);
  });

  it.each([[], new Uint16Array(0), new Uint32Array(0)])(
    "accepts an empty selection %j without callbacks",
    (selection) => {
      const { footprints, result } = collect(selectedMesh(), {
        width: 4,
        height: 4,
        triangles: selection,
      });
      expect(result).toEqual({ triangles: 0, footprints: 0 });
      expect(footprints).toEqual([]);
    },
  );

  it("rejects duplicates, out-of-range IDs, fractional IDs and oversized selections", () => {
    const mesh = selectedMesh();
    expect(() => collect(mesh, { width: 4, height: 4, triangles: [0, 0] })).toThrow(
      "duplicate triangle ID",
    );
    for (const selection of [[-1], [3], [0.5], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
      expect(() => collect(mesh, { width: 4, height: 4, triangles: selection })).toThrow(
        "triangle ID must be an in-range integer",
      );
    }
    expect(() => collect(mesh, { width: 4, height: 4, triangles: [0, 1, 2, 0] })).toThrow(
      "selection exceeds source triangle count",
    );
    const options = {
      width: 4,
      height: 4,
      triangles: new Float32Array([0]),
    } as unknown as UvTexelFootprintOptions;
    expect(() => collect(mesh, options)).toThrow(
      "triangles must be an array of source triangle IDs",
    );
  });

  it("returns centroid barycentrics and positions in the supplied model coordinates", () => {
    const mesh = triangles(unitTriangle);
    mesh.positions.set([10, 20, 30, 14, 20, 34, 10, 26, 36]);
    const { footprints } = collect(mesh, { width: 2, height: 2 });
    // The complete bottom-left square has centroid UV (1/4,1/4).
    expect(footprints[0].barycentric).toEqual([0.5, 0.25, 0.25]);
    expect(footprints[0].position).toEqual([11, 21.5, 32.5]);
    // Its two neighbours are right triangles. Vertex averaging gives centroids
    // UV (2/3,1/6) and (1/6,2/3), independent of the clipping implementation.
    const expected = [
      { barycentric: [1 / 6, 2 / 3, 1 / 6], position: [38 / 3, 21, 101 / 3] },
      { barycentric: [1 / 6, 1 / 6, 2 / 3], position: [32 / 3, 24, 104 / 3] },
    ];
    for (let index = 0; index < expected.length; index++) {
      for (let component = 0; component < 3; component++) {
        expect(footprints[index + 1].barycentric[component]).toBeCloseTo(
          expected[index].barycentric[component],
          14,
        );
        expect(footprints[index + 1].position[component]).toBeCloseTo(
          expected[index].position[component],
          12,
        );
      }
    }
    for (const footprint of footprints) {
      expect(footprint.barycentric.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 14);
      expect(footprint.barycentric.every((weight) => weight >= 0 && weight <= 1)).toBe(true);
    }
  });

  it("gives each callback fresh arrays without changing borrowed mesh inputs", () => {
    const mesh = triangles(unitTriangle);
    const positionsBefore = mesh.positions.slice();
    const indicesBefore = mesh.indices.slice();
    const uvsBefore = mesh.uvs?.slice();
    const footprints: UvTexelFootprint[] = [];
    visitUvTexelFootprints(mesh, { width: 2, height: 2 }, (footprint) => {
      footprints.push(footprint);
      if (footprints.length === 1) {
        (footprint.barycentric as [number, number, number])[0] = -100;
        (footprint.position as [number, number, number])[0] = -100;
      }
    });
    expect(new Set(footprints)).toHaveProperty("size", 3);
    expect(new Set(footprints.map(({ barycentric }) => barycentric))).toHaveProperty("size", 3);
    expect(new Set(footprints.map(({ position }) => position))).toHaveProperty("size", 3);
    expect(footprints[1].barycentric[0]).toBeCloseTo(1 / 6, 14);
    expect(footprints[1].position[0]).toBeCloseTo(2 / 3, 14);
    expect(footprints[0].barycentric[0]).toBe(-100);
    expect(footprints[0].position[0]).toBe(-100);
    expect(mesh.positions).toEqual(positionsBefore);
    expect(mesh.indices).toEqual(indicesBefore);
    expect(mesh.uvs).toEqual(uvsBefore);
  });

  it("keeps area and interpolated positions under reversed winding", () => {
    const forward = collect(triangles(unitTriangle), { width: 2, height: 2 });
    const reversed = collect(triangles([0, 0, 0, 1, 1, 0]), { width: 2, height: 2 });
    expect(reversed.result).toEqual(forward.result);
    for (let index = 0; index < forward.footprints.length; index++) {
      const a = forward.footprints[index],
        b = reversed.footprints[index];
      expect([b.column, b.row, b.weight]).toEqual([a.column, a.row, a.weight]);
      for (let component = 0; component < 3; component++)
        expect(b.position[component]).toBeCloseTo(a.position[component], 14);
      expect(b.barycentric[0]).toBeCloseTo(a.barycentric[0], 14);
      expect(b.barycentric[1]).toBeCloseTo(a.barycentric[2], 14);
      expect(b.barycentric[2]).toBeCloseTo(a.barycentric[1], 14);
    }
  });

  it("excludes zero-area edge touches and retains both halves of shared boundaries", () => {
    const mesh = triangles([0, 0, 0.5, 0, 0, 0.5], [0.5, 0, 0.5, 0.5, 0, 0.5]);
    const { footprints, result } = collect(mesh, { width: 2, height: 2 });
    expect(result).toEqual({ triangles: 2, footprints: 2 });
    expect(
      footprints.map(({ triangle, column, row, weight }) => [triangle, column, row, weight]),
    ).toEqual([
      [0, 0, 0, 0.5],
      [1, 0, 0, 0.5],
    ]);
    expect(footprints.reduce((sum, footprint) => sum + footprint.weight, 0)).toBe(1);
  });

  it("reports overlapping source contributions independently without asserting occupancy", () => {
    const mesh = triangles(unitTriangle, unitTriangle);
    const { footprints, result } = collect(mesh, { width: 2, height: 2 });
    expect(result).toEqual({ triangles: 2, footprints: 6 });
    expect(footprints.reduce((sum, footprint) => sum + footprint.weight, 0)).toBe(4);
    const sameCell = footprints.filter(({ column, row }) => column === 0 && row === 0);
    expect(sameCell.map(({ triangle, weight }) => [triangle, weight])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    // Two raw contributions of 1 must remain 2; this visitor does not compute
    // a capped cell coverage, a chart verdict or model-space solid occupancy.
    expect(sameCell.reduce((sum, footprint) => sum + footprint.weight, 0)).toBe(2);
  });

  it("validates selected UV triangles while leaving other finite charts unvisited", () => {
    const mesh = triangles(unitTriangle, [-0.25, 0, 0.25, 0, 0, 0.25], [0, 0, 0.25, 0, 0.5, 0]);
    expect(collect(mesh, { width: 2, height: 2, triangles: [0] }).result).toEqual({
      triangles: 1,
      footprints: 3,
    });
    expect(() => collect(mesh, { width: 2, height: 2, triangles: [1] })).toThrow(
      "selected UV triangle extends outside the unit tile",
    );
    expect(() => collect(mesh, { width: 2, height: 2, triangles: [2] })).toThrow(
      "selected UV triangle is degenerate",
    );
  });

  it("preserves the two small footprints of an exact Float32 triangle", () => {
    const uv = [
      0.681056022644043, 0.01157000008970499, 0.680226743221283, 0.011578000150620937,
      0.6802390217781067, 0.011312000453472137,
    ];
    const mesh = triangles(uv);
    expect(Array.from(mesh.uvs ?? [])).toEqual(uv);
    const { footprints, result } = collect(mesh, { width: 1024, height: 1024 });
    expect(result).toEqual({ triangles: 1, footprints: 2 });
    expect(footprints.map(({ column, row }) => [column, row])).toEqual([
      [696, 11],
      [697, 11],
    ]);
    // Independent clipped areas in texel-square units, using the exact stored
    // Float32 coordinates rather than rounded decimal artwork coordinates.
    expect(footprints[0].weight).toBeCloseTo(0.0893870479119138, 13);
    expect(footprints[1].weight).toBeCloseTo(0.026213132521916396, 13);
    expect(footprints.reduce((sum, footprint) => sum + footprint.weight, 0)).toBeCloseTo(
      0.1156001804338302,
      13,
    );
    const top = collect(mesh, { width: 1024, height: 1024, rowOrigin: "top" });
    expect(top.footprints.map(({ column, row }) => [column, row])).toEqual([
      [696, 1012],
      [697, 1012],
    ]);
    expect(top.footprints.map(({ weight }) => weight)).toEqual(
      footprints.map(({ weight }) => weight),
    );
  });

  it("keeps valid positive-area triangles below the atlas-bake degeneracy threshold", () => {
    const side = 1 / 1048576;
    const { footprints, result } = collect(triangles([0, 0, side, 0, 0, side]), {
      width: 1,
      height: 1,
    });
    expect(result).toEqual({ triangles: 1, footprints: 1 });
    expect(footprints[0].weight).toBe((side * side) / 2);
    for (const weight of footprints[0].barycentric) expect(weight).toBeCloseTo(1 / 3, 14);
  });

  it("rejects excessive bottom-row candidate work before invoking a callback", () => {
    const mesh = triangles(...Array.from({ length: 17 }, () => [0, 0, 1, 0, 0, 2 ** -60]));
    let callbacks = 0;
    expect(() =>
      visitUvTexelFootprints(mesh, { width: 4_194_304, height: 1 }, () => {
        callbacks += 1;
        throw new Error("callback ran before raster admission");
      }),
    ).toThrow("triangle raster work exceeds 67108864");
    expect(callbacks).toBe(0);
  });

  it("preserves positive area under cyclic reindexing despite nearly coincident edge differences", () => {
    const side = Math.fround(1e-20);
    const mesh = triangles(
      [1, 1, side, 0, 0, side],
      [side, 0, 0, side, 1, 1],
      [0, side, 1, 1, side, 0],
    );
    const { footprints, result } = collect(mesh, { width: 1, height: 1 });
    expect(result).toEqual({ triangles: 3, footprints: 3 });
    expect(footprints.map(({ triangle, column, row }) => [triangle, column, row])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    // The large right triangle of area side loses a corner of area side^2/2.
    // This independent expression rounds to side, while subtracting edge
    // vectors near (1,1) can incorrectly cancel the complete area to zero.
    const area = side - (side * side) / 2;
    for (const footprint of footprints) {
      expect(footprint.weight).toBeGreaterThan(0);
      expect(footprint.weight / area).toBeCloseTo(1, 12);
      expect(footprint.weight).toBe(footprints[0].weight);
      expect(footprint.position[0]).toBeCloseTo((1 + side) / 3, 12);
      expect(footprint.position[1]).toBeCloseTo((1 + side) / 3, 12);
    }
  });

  it("retains a tiny positive area when a different polygon anchor avoids cancellation", () => {
    const side = Math.fround(1e-20);
    const mesh = triangles(
      [0, 1, side, 0, side, side],
      [side, 0, side, side, 0, 1],
      [side, side, 0, 1, side, 0],
    );
    const { footprints, result } = collect(mesh, { width: 1, height: 1 });
    expect(result).toEqual({ triangles: 3, footprints: 3 });
    expect(footprints.map(({ triangle, column, row }) => [triangle, column, row])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
    // The vertical edge from (side,0) to (side,side) has length side;
    // the perpendicular distance of (0,1) from that edge is also side.
    const area = (side * side) / 2;
    for (const footprint of footprints) {
      expect(footprint.weight).toBeGreaterThan(0);
      expect(footprint.weight / area).toBeCloseTo(1, 12);
    }
  });

  it("rejects invalid row labels, dimensions, callbacks and malformed mesh input", () => {
    const mesh = triangles(unitTriangle);
    for (const rowOrigin of ["invalid", null, 0]) {
      expect(() =>
        collect(mesh, { width: 2, height: 2, rowOrigin } as unknown as UvTexelFootprintOptions),
      ).toThrow("rowOrigin must be bottom or top");
    }
    expect(() => collect(mesh, { width: 0, height: 2 })).toThrow("positive integers");
    expect(() => collect(mesh, { width: 4096, height: 4096 })).toThrow("pixel count");
    expect(() =>
      visitUvTexelFootprints(
        mesh,
        { width: 2, height: 2 },
        undefined as unknown as (footprint: UvTexelFootprint) => void,
      ),
    ).toThrow("visit must be a function");
    expect(() => collect({ ...mesh, uvs: undefined }, { width: 2, height: 2 })).toThrow(
      "mesh must provide UVs",
    );
    expect(() =>
      collect({ ...mesh, indices: new Uint32Array([0, 1, 3]) }, { width: 2, height: 2 }),
    ).toThrow("indices[2] is outside the positions array");
  });
});
