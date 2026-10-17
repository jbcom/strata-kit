import { describe, expect, it } from "vitest";

import { analyzeUvLayout, type NeutralIndexedMesh } from "../src/reskin.ts";

type UvTriangle = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];

function stored(triangle: UvTriangle): UvTriangle {
  return triangle.map(Math.fround) as UvTriangle;
}

function mesh(triangles: readonly UvTriangle[]): NeutralIndexedMesh {
  const positions = new Float32Array(triangles.length * 9);
  const uvs = new Float32Array(triangles.length * 6);
  const indices = new Uint32Array(triangles.length * 3);
  for (let index = 0; index < triangles.length; index += 1) {
    const vertex = index * 3;
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], vertex * 3);
    uvs.set(triangles[index], vertex * 2);
    indices.set([vertex, vertex + 1, vertex + 2], vertex);
  }
  return { positions, uvs, indices };
}

function points(triangle: UvTriangle): Point[] {
  return [
    [triangle[0], triangle[1]],
    [triangle[2], triangle[3]],
    [triangle[4], triangle[5]],
  ];
}

function twiceArea(polygon: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current[0] * next[1] - current[1] * next[0];
  }
  return area;
}

function cross(a: Point, b: Point, point: Point): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function intersection(start: Point, end: Point, clipStart: Point, clipEnd: Point): Point {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const ex = clipEnd[0] - clipStart[0];
  const ey = clipEnd[1] - clipStart[1];
  const denominator = dx * ey - dy * ex;
  if (denominator === 0) return end;
  const scale = ((clipStart[0] - start[0]) * ey - (clipStart[1] - start[1]) * ex) / denominator;
  return [start[0] + scale * dx, start[1] + scale * dy];
}

/** Independent floating-point clipping oracle for bounded small layouts. */
function positiveIntersection(first: UvTriangle, second: UvTriangle): boolean {
  let polygon = points(first);
  const clip = points(second);
  const winding = Math.sign(twiceArea(clip));
  if (winding === 0 || Math.abs(twiceArea(points(first))) < 2e-12) return false;
  for (let edge = 0; edge < 3 && polygon.length > 0; edge += 1) {
    const start = clip[edge];
    const end = clip[(edge + 1) % 3];
    const output: Point[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentInside = cross(start, end, current) * winding >= 0;
      const previousInside = cross(start, end, previous) * winding >= 0;
      if (currentInside !== previousInside)
        output.push(intersection(previous, current, start, end));
      if (currentInside) output.push(current);
    }
    polygon = output;
  }
  return Math.abs(twiceArea(polygon)) > 0;
}

function bruteOverlapFraction(triangles: readonly UvTriangle[]): number {
  const storedTriangles = triangles.map(stored);
  const overlapping = new Set<number>();
  for (let left = 0; left < storedTriangles.length; left += 1)
    for (let right = left + 1; right < storedTriangles.length; right += 1)
      if (positiveIntersection(storedTriangles[left], storedTriangles[right])) {
        overlapping.add(left);
        overlapping.add(right);
      }
  return overlapping.size / storedTriangles.length;
}

function assertMatchesOracle(triangles: readonly UvTriangle[]): void {
  expect(analyzeUvLayout(mesh(triangles), { gridSize: 64 }).overlap).toBe(
    bruteOverlapFraction(triangles),
  );
}

describe("UV overlap broad-phase oracle", () => {
  it("matches an independent bounded brute-force oracle across dense, edge, sliver, winding, and Float32 cases", () => {
    const dense = Array.from({ length: 32 }, (_, index): UvTriangle => {
      const offset = index * 0.0001;
      return [offset, offset, 0.8 + offset, offset, offset, 0.8 + offset];
    });
    const sharedEdge: UvTriangle[] = [
      [0, 0, 1, 0, 0, 1],
      [1, 0, 1, 1, 0, 1],
    ];
    const sliver: UvTriangle[] = [
      [0, 0, 0.1, 0, 0, 0.1],
      [0.05, 0.05 - 1e-8, 0.1, 0.05, 0.05, 0.1],
    ];
    const reversedWinding: UvTriangle[] = [
      [0, 0, 1, 0, 0, 1],
      [0, 1, 1, 0, 0, 0],
    ];
    const edge = Math.fround(1 - 2 ** -20);
    const extremeFloat32: UvTriangle[] = [
      [0, 0, edge, 0, 0, edge],
      [0, edge, edge, 0, 0, 0],
    ];

    for (const triangles of [dense, sharedEdge, sliver, reversedWinding, extremeFloat32]) {
      assertMatchesOracle(triangles);
    }
  });

  it("matches changing U expiry and varied V active intervals", () => {
    const triangles: UvTriangle[] = [
      [0.0, 0.05, 0.62, 0.05, 0.0, 0.14],
      [0.1, 0.7, 0.68, 0.7, 0.1, 0.82],
      [0.18, 0.08, 0.34, 0.08, 0.18, 0.22],
      [0.28, 0.1, 0.45, 0.1, 0.28, 0.24],
      [0.47, 0.52, 0.78, 0.52, 0.47, 0.69],
      [0.6, 0.55, 0.84, 0.55, 0.6, 0.74],
      [0.81, 0.03, 0.98, 0.03, 0.81, 0.18],
      [0.86, 0.76, 0.99, 0.76, 0.86, 0.94],
    ];
    assertMatchesOracle(triangles);
  });

  it("matches a deterministic mixed-overlap grid without relying on call order", () => {
    let state = 0x51f15e;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
    const triangles: UvTriangle[] = [];
    for (let row = 0; row < 4; row += 1)
      for (let column = 0; column < 4; column += 1) {
        const u = column * 0.24 + random() * 0.01;
        const v = row * 0.115 + random() * 0.01;
        triangles.push([u, v, u + 0.14, v, u, v + 0.09]);
        triangles.push([u + 0.025, v + 0.0125, u + 0.15, v + 0.0125, u + 0.025, v + 0.1025]);
      }
    for (let column = 0; column < 8; column += 1) {
      const u = column * 0.12 + random() * 0.002;
      triangles.push([u, 0.7, u + 0.08, 0.7, u, 0.78]);
    }
    const expected = bruteOverlapFraction(triangles);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
    assertMatchesOracle(triangles);
  });

  it("filters UV-degenerate triangles before candidate enumeration", () => {
    const triangles: UvTriangle[] = [
      [0, 0, 1, 0, 0, 1],
      [0, 0, 0.5, 0, 1, 0],
      [0, 0, 0.5, 0, 1, 0],
    ];
    expect(bruteOverlapFraction(triangles)).toBe(0);
    expect(analyzeUvLayout(mesh(triangles), { gridSize: 64 }).overlap).toBe(0);
  });
});
