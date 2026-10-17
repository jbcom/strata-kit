import { describe, expect, it } from "vitest";

import { createSheetMesh, type ProceduralMesh, type SheetMeshOptions } from "../src/mesh.ts";

const createMaskedSheet = createSheetMesh;

function copy(mesh: ProceduralMesh): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  return {
    positions: [...mesh.positions],
    normals: [...mesh.normals],
    uvs: [...mesh.uvs],
    indices: [...mesh.indices],
  };
}

describe("sampled sheet cell selection", () => {
  it("corrects only retained incident faces at a sharp ridge", () => {
    const options = {
      width: 0.2,
      height: 1,
      columns: 3,
      rows: 2,
      heightAt: (u: number) => (u <= 0.5 ? 6 * u : 3 - 0.4 * (u - 0.5)),
    };
    expect(createSheetMesh(options).positions.length).toBeGreaterThan(18);
    const left = createSheetMesh({ ...options, includeCell: (column) => column === 0 });
    expect(left.positions).toHaveLength(18);
    for (const column of [0, 1]) {
      const mesh = createSheetMesh({ ...options, includeCell: (cell) => cell === column });
      expect(mesh.indices).toHaveLength(6);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const corners = Array.from(mesh.indices.slice(t, t + 3), (i) => i * 3);
        const [a, b, c] = corners;
        const ab = [0, 1, 2].map((i) => mesh.positions[b + i] - mesh.positions[a + i]);
        const ac = [0, 1, 2].map((i) => mesh.positions[c + i] - mesh.positions[a + i]);
        const face = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const magnitude = Math.hypot(...face);
        expect(magnitude).toBeGreaterThan(0);
        for (const corner of corners) {
          expect(
            face.reduce((dot, value, i) => dot + (value / magnitude) * mesh.normals[corner + i], 0),
          ).toBeGreaterThan(0);
        }
      }
    }
  });
  it("emits exactly the existing two triangles for each selected cell in row-major order", () => {
    const mesh = createMaskedSheet({
      width: 6,
      height: 4,
      columns: 4,
      rows: 3,
      includeCell: (column, row) =>
        (column === 0 && row === 0) || (column === 2 && row === 0) || (column === 1 && row === 1),
    });

    expect([...mesh.indices]).toEqual([0, 4, 1, 1, 4, 5, 2, 6, 3, 3, 6, 7, 5, 9, 6, 6, 9, 10]);
  });

  it("keeps sampled position and UV buffers while default/full selection is byte-identical", () => {
    const options: SheetMeshOptions = {
      width: 6,
      height: 4,
      columns: 4,
      rows: 3,
      heightAt: (u, v) => u * 2 + v * 3,
    };
    const defaultMesh = createSheetMesh(options);
    const fullyIncluded = createMaskedSheet({ ...options, includeCell: () => true });
    const partial = createMaskedSheet({ ...options, includeCell: (column, row) => column === row });

    expect(copy(fullyIncluded)).toEqual(copy(defaultMesh));
    expect([...partial.positions]).toEqual([...defaultMesh.positions]);
    expect([...partial.uvs]).toEqual([...defaultMesh.uvs]);
    expect([...partial.normals].every(Number.isFinite)).toBe(true);
  });

  it("evaluates cells once in row-major order before sampling every vertex once in row-major order", () => {
    const calls: string[] = [];
    createMaskedSheet({
      width: 2,
      height: 2,
      columns: 3,
      rows: 3,
      includeCell: (column, row) => {
        calls.push(`cell:${column},${row}`);
        return true;
      },
      heightAt: (u, v) => {
        calls.push(`height:${u},${v}`);
        return u + v;
      },
    });

    expect(calls).toEqual([
      "cell:0,0",
      "cell:1,0",
      "cell:0,1",
      "cell:1,1",
      "height:0,0",
      "height:0.5,0",
      "height:1,0",
      "height:0,0.5",
      "height:0.5,0.5",
      "height:1,0.5",
      "height:0,1",
      "height:0.5,1",
      "height:1,1",
    ]);
  });

  it("rejects a non-boolean inclusion result", () => {
    const invalid = {
      width: 1,
      height: 1,
      columns: 2,
      rows: 2,
      includeCell: () => 1,
    } as unknown as SheetMeshOptions;

    expect(() => createMaskedSheet(invalid)).toThrow(/includeCell.*boolean/);
  });

  it("returns an empty index buffer but retains complete finite sampled attributes when every cell is omitted", () => {
    const mesh = createMaskedSheet({
      width: 2,
      height: 3,
      columns: 3,
      rows: 2,
      heightAt: (u, v) => u - v,
      includeCell: () => false,
    });

    expect(mesh.indices).toHaveLength(0);
    expect(mesh.positions).toHaveLength(18);
    expect(mesh.normals).toHaveLength(18);
    expect(mesh.uvs).toHaveLength(12);
    expect([...mesh.positions, ...mesh.normals, ...mesh.uvs].every(Number.isFinite)).toBe(true);
  });

  it("checks worst-case bounds before any mask or height callback", () => {
    let maskCalls = 0;
    let heightCalls = 0;

    expect(() =>
      createMaskedSheet({
        width: 1,
        height: 1,
        columns: 1_001,
        rows: 1_000,
        includeCell: () => {
          maskCalls += 1;
          return true;
        },
        heightAt: () => {
          heightCalls += 1;
          return 0;
        },
      }),
    ).toThrow("vertex count exceeds 1000000");
    expect(maskCalls).toBe(0);
    expect(heightCalls).toBe(0);
  });
});
