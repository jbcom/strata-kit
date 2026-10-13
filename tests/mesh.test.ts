import { describe, expect, it } from "vitest";

import {
  createRevolvedMesh,
  createSheetMesh,
  createSweptMesh,
  type ProceduralMesh,
} from "../src/mesh.ts";

function position(mesh: ProceduralMesh, index: number): [number, number, number] {
  const offset = index * 3;
  return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
}

function normal(mesh: ProceduralMesh, index: number): [number, number, number] {
  const offset = index * 3;
  return [mesh.normals[offset], mesh.normals[offset + 1], mesh.normals[offset + 2]];
}

function subtract(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function cross(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function faceNormal(mesh: ProceduralMesh, triangle: number): [number, number, number] {
  const offset = triangle * 3;
  const a = position(mesh, mesh.indices[offset]);
  const b = position(mesh, mesh.indices[offset + 1]);
  const c = position(mesh, mesh.indices[offset + 2]);
  return cross(subtract(b, a), subtract(c, a));
}

function expectFiniteUnitNormals(mesh: ProceduralMesh): void {
  expect([...mesh.positions, ...mesh.normals, ...mesh.uvs].every(Number.isFinite)).toBe(true);
  for (let index = 0; index < mesh.normals.length / 3; index += 1) {
    expect(Math.hypot(...normal(mesh, index))).toBeCloseTo(1, 5);
  }
  expect([...mesh.indices].every((index) => index >= 0 && index < mesh.positions.length / 3)).toBe(
    true,
  );
}

describe("neutral procedural meshes", () => {
  it("builds a capped revolution with duplicated UV seam and separately shaded caps", () => {
    const mesh = createRevolvedMesh({
      profile: [
        { radius: 1, height: -1 },
        { radius: 0.5, height: 1 },
      ],
      segments: 4,
    });

    expect(mesh.positions).toHaveLength(22 * 3);
    expect(mesh.normals).toHaveLength(22 * 3);
    expect(mesh.uvs).toHaveLength(22 * 2);
    expect(mesh.indices).toHaveLength(48);
    expect(mesh.indices).toBeInstanceOf(Uint16Array);
    expect(position(mesh, 0)).toEqual(position(mesh, 4));
    expect(mesh.uvs[0]).toBe(0);
    expect(mesh.uvs[8]).toBe(1);
    expect(normal(mesh, 10)).toEqual([0, -1, 0]);
    expect(normal(mesh, 16)).toEqual([0, 1, 0]);
    expect(dot(faceNormal(mesh, 0), normal(mesh, mesh.indices[0]))).toBeGreaterThan(0);
    expect(dot(faceNormal(mesh, 8), normal(mesh, mesh.indices[24]))).toBeGreaterThan(0);
    expectFiniteUnitNormals(mesh);
  });

  it("uses arc-length sweep coordinates, transported frames, and radius-sensitive normals", () => {
    const mesh = createSweptMesh({
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 1, y: 3, z: 1 },
        { x: 3, y: 3, z: 2 },
      ],
      radius: (t) => 0.25 + t * 0.75,
      radialSegments: 8,
    });

    const ring = 9;
    const sideIndexCount = 3 * 8 * 6;
    expect(mesh.uvs[1]).toBe(0);
    expect(mesh.uvs[(ring + 0) * 2 + 1]).toBeGreaterThan(0);
    expect(mesh.uvs[ring * 2 * 2 + 1]).toBeGreaterThan(mesh.uvs[ring * 2 + 1]);
    expect(mesh.uvs[ring * 3 * 2 + 1]).toBe(1);
    expect(position(mesh, 0)).toEqual(position(mesh, 8));
    expect(mesh.positions).toHaveLength(56 * 3);
    expect(normal(mesh, 36)[1]).toBe(-1);
    expect(dot(faceNormal(mesh, 0), normal(mesh, mesh.indices[0]))).toBeGreaterThan(0);
    expect(
      dot(faceNormal(mesh, sideIndexCount / 3), normal(mesh, mesh.indices[sideIndexCount])),
    ).toBeGreaterThan(0);
    expect(dot(normal(mesh, 0), normal(mesh, ring))).toBeGreaterThan(-0.1);
    expect(Math.abs(normal(mesh, ring)[1])).toBeGreaterThan(0.01);
    expectFiniteUnitNormals(mesh);
  });

  it("generates a height sheet with upward winding and finite-difference normals", () => {
    const mesh = createSheetMesh({
      width: 4,
      height: 2,
      columns: 3,
      rows: 3,
      heightAt: (u, v) => u * 2 + v,
    });

    expect(position(mesh, 0)).toEqual([-2, 0, -1]);
    expect(position(mesh, 8)).toEqual([2, 3, 1]);
    expect(mesh.indices).toHaveLength(24);
    expect(dot(faceNormal(mesh, 0), normal(mesh, 0))).toBeGreaterThan(0);
    expect(normal(mesh, 4)).toMatchObject({
      0: expect.closeTo(-0.4082483, 5),
      1: expect.closeTo(0.8164966, 5),
      2: expect.closeTo(-0.4082483, 5),
    });
    expectFiniteUnitNormals(mesh);
  });

  it("selects Uint32 once a valid grid needs an index beyond Uint16", () => {
    const mesh = createSheetMesh({ width: 1, height: 1, columns: 257, rows: 257 });
    expect(mesh.positions.length / 3).toBe(66049);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.indices[mesh.indices.length - 1]).toBe(66048);
  });

  it("rejects invalid dimensions, finite values, path degeneracy, and allocation ceilings before output allocation", () => {
    expect(() => createRevolvedMesh({ profile: [{ radius: 1, height: 0 }], segments: 4 })).toThrow(
      "profile must contain at least two points",
    );
    expect(() =>
      createRevolvedMesh({
        profile: [
          { radius: -1, height: 0 },
          { radius: 1, height: 1 },
        ],
        segments: 4,
      }),
    ).toThrow("profile[0].radius must be a non-negative finite number");
    expect(() =>
      createSweptMesh({
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
        radius: 1,
        radialSegments: 3,
      }),
    ).toThrow("path contains consecutive identical points");
    expect(() =>
      createSweptMesh({
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
        radius: 1,
        radialSegments: 3,
      }),
    ).toThrow("path contains reversing consecutive tangents");
    expect(() =>
      createSweptMesh({
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ],
        radius: () => Number.NaN,
        radialSegments: 3,
      }),
    ).toThrow("radius(t) must return a positive finite number");
    expect(() => createSheetMesh({ width: 1, height: 1, columns: 1001, rows: 1000 })).toThrow(
      "vertex count exceeds 1000000",
    );
    expect(() => createSheetMesh({ width: 1, height: Number.NaN, columns: 2, rows: 2 })).toThrow(
      "height must be a positive finite number",
    );
  });

  it("rejects dimensions and radii lost to Float32 quantization, plus collapsed stored triangles", () => {
    expect(() =>
      createRevolvedMesh({
        profile: [
          { radius: Number.MIN_VALUE, height: 0 },
          { radius: 1, height: 1 },
        ],
        segments: 3,
      }),
    ).toThrow("profile[0].radius must survive Float32 quantization");
    expect(() =>
      createSweptMesh({
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        radius: Number.MIN_VALUE,
        radialSegments: 3,
      }),
    ).toThrow("radius(t) must survive Float32 quantization");
    expect(() =>
      createSheetMesh({ width: Number.MIN_VALUE, height: 1, columns: 2, rows: 2 }),
    ).toThrow("width must survive Float32 quantization");
    expect(() =>
      createSweptMesh({
        path: [
          { x: 1e30, y: 0, z: 0 },
          { x: 1e30 + 1e20, y: 0, z: 0 },
        ],
        radius: 1,
        radialSegments: 4,
      }),
    ).toThrow("triangle 0 has zero area after Float32 quantization");
  });

  it("rejects revolutions with no surface or a zero-radius profile segment", () => {
    expect(() =>
      createRevolvedMesh({
        profile: [
          { radius: 0, height: 0 },
          { radius: 0, height: 1 },
        ],
        segments: 3,
      }),
    ).toThrow("profile must contain at least one positive radius");
    expect(() =>
      createRevolvedMesh({
        profile: [
          { radius: 1, height: 0 },
          { radius: 0, height: 1 },
          { radius: 0, height: 2 },
          { radius: 1, height: 3 },
        ],
        segments: 3,
      }),
    ).toThrow("profile cannot contain adjacent zero-radius points");
  });
});
