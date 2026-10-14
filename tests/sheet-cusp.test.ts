import { describe, expect, it, vi } from "vitest";
import { createSheetMesh, type ProceduralMesh } from "../src/mesh.ts";

function expectOutwardCorners(mesh: ProceduralMesh): void {
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = Array.from(mesh.indices.slice(t, t + 3), (i) => i * 3);
    const ab = [0, 1, 2].map((i) => mesh.positions[b + i]! - mesh.positions[a + i]!);
    const ac = [0, 1, 2].map((i) => mesh.positions[c + i]! - mesh.positions[a + i]!);
    const face = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    const magnitude = Math.hypot(...face);
    expect(magnitude).toBeGreaterThan(0);
    for (const corner of [a, b, c]) {
      const normal = [0, 1, 2].map((i) => mesh.normals[corner + i]!);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
      expect(
        face.reduce((sum, value, i) => sum + (value / magnitude) * normal[i]!, 0),
      ).toBeGreaterThan(0);
    }
  }
}

describe("sheet incident-corner normals", () => {
  it("promotes index width when corrected corners cross the Uint16 boundary", () => {
    const mesh = createSheetMesh({
      width: 1,
      height: 1,
      columns: 256,
      rows: 256,
      heightAt: (u, v) => (u === 0 ? (v === 0 ? 0 : 3) : v === 0 ? 3 : -30),
    });
    expect(mesh.positions.length / 3).toBeGreaterThan(65_536);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(mesh.indices).every((index) => index < mesh.positions.length / 3)).toBe(true);
  });

  it("keeps all corners outward across bounded fixed-seed relief grids", () => {
    let state = 0x832931;
    for (let sample = 0; sample < 48; sample += 1) {
      const columns = 2 + (sample % 6),
        rows = 2 + (Math.floor(sample / 6) % 6);
      const heights = Array.from({ length: columns * rows }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state / 0xffffffff) * 24 - 12;
      });
      const mesh = createSheetMesh({
        width: 1,
        height: 1,
        columns,
        rows,
        heightAt: (u, v) =>
          heights[Math.round(v * (rows - 1)) * columns + Math.round(u * (columns - 1))]!,
      });
      expectOutwardCorners(mesh);
    }
  });
  it("keeps every ridge corner in its actual face hemisphere without resampling", () => {
    const heightAt = vi.fn((u: number) => (u <= 0.5 ? 6 * u : 3 - 0.4 * (u - 0.5)));
    const mesh = createSheetMesh({ width: 0.2, height: 1, columns: 3, rows: 2, heightAt });
    expect(heightAt).toHaveBeenCalledTimes(6);
    expect(mesh.indices).toHaveLength(12);
    expectOutwardCorners(mesh);
  });

  it("handles a two-dimensional saddle with no interior axis nodes", () => {
    const heightAt = vi.fn((u: number, v: number) => 3 * u + 3 * v - 36 * u * v);
    const mesh = createSheetMesh({ width: 1, height: 1, columns: 2, rows: 2, heightAt });
    expect(heightAt).toHaveBeenCalledTimes(4);
    expect(mesh.indices).toHaveLength(6);
    expectOutwardCorners(mesh);
  });

  it("bounds base work before any height callback", () => {
    const heightAt = vi.fn(() => {
      throw new Error("must not sample");
    });
    expect(() =>
      createSheetMesh({ width: 1, height: 1, columns: 1001, rows: 1000, heightAt }),
    ).toThrow("vertex count exceeds 1000000");
    expect(heightAt).not.toHaveBeenCalled();
  });

  it("retains finite double slopes for valid extreme stored positions", () => {
    const mesh = createSheetMesh({
      width: 1e-44,
      height: 1,
      columns: 2,
      rows: 2,
      heightAt: (u) => (u ? 1e38 : 0),
    });
    expectOutwardCorners(mesh);
  });

  it("retains ordinary stored-position derivative normal bytes and topology", () => {
    const mesh = createSheetMesh({
      width: 0.1,
      height: 0.1,
      columns: 3,
      rows: 3,
      heightAt: (u, v) => -18 * u - 18 * v,
    });
    expect(mesh.positions).toHaveLength(27);
    expect(mesh.indices).toEqual(
      new Uint16Array([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 3, 6, 4, 4, 6, 7, 4, 7, 5, 5, 7, 8]),
    );
    for (let i = 0; i < mesh.normals.length; i += 3) {
      expect(Array.from(mesh.normals.slice(i, i + 3))).toEqual([
        0.7071013450622559, 0.003928340971469879, 0.7071013450622559,
      ]);
    }
  });
});
