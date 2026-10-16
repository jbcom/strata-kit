import { describe, expect, it } from "vitest";

import {
  createRevolvedSurfaceMesh,
  type RevolvedSection,
  type RevolvedSurfaceMesh,
  type RevolvedSurfaceOptions,
} from "../src/revolvedSurface.ts";

const section = (height: number, radius = 1): RevolvedSection => ({
  height,
  halfWidth: radius,
  positiveDepth: radius,
  negativeDepth: radius,
});

function point(values: Float32Array, vertex: number): number[] {
  return Array.from(values.subarray(vertex * 3, vertex * 3 + 3));
}

function expectPoint(actual: readonly number[], expected: readonly number[]): void {
  for (let component = 0; component < 3; component++)
    expect(actual[component]).toBeCloseTo(expected[component], 5);
}

function face(mesh: RevolvedSurfaceMesh, offset: number): number[] {
  const a = point(mesh.positions, mesh.indices[offset]);
  const b = point(mesh.positions, mesh.indices[offset + 1]);
  const c = point(mesh.positions, mesh.indices[offset + 2]);
  const ab = b.map((value, index) => value - a[index]);
  const ac = c.map((value, index) => value - a[index]);
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

function expectStoredSurface(mesh: RevolvedSurfaceMesh): void {
  const vertices = mesh.positions.length / 3;
  expect(mesh.normals).toHaveLength(vertices * 3);
  expect(mesh.uvs).toHaveLength(vertices * 2);
  expect(mesh.parameters).toBeInstanceOf(Float64Array);
  expect(mesh.parameters).toHaveLength(vertices * 2);
  for (const values of [mesh.positions, mesh.normals, mesh.uvs, mesh.parameters])
    expect(values.every(Number.isFinite)).toBe(true);
  expect(mesh.indices.length % 3).toBe(0);
  expect(mesh.indices.every((index) => index < vertices)).toBe(true);
  for (let vertex = 0; vertex < vertices; vertex++)
    expect(Math.hypot(...point(mesh.normals, vertex))).toBeCloseTo(1, 5);
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const cross = face(mesh, offset);
    expect(Math.hypot(...cross)).toBeGreaterThan(0);
    for (let corner = 0; corner < 3; corner++) {
      const normal = point(mesh.normals, mesh.indices[offset + corner]);
      expect(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0)).toBeGreaterThan(0);
    }
  }
}

describe("sampled revolved surfaces", () => {
  it("uses separate depth halves and the polar ellipse at diagonal angles", () => {
    const row = {
      height: 4,
      halfWidth: 2,
      positiveDepth: 3,
      negativeDepth: 1,
      center: [1, -2] as const,
    };
    const mesh = createRevolvedSurfaceMesh({ sections: [row, { ...row, height: 5 }], segments: 8 });
    expectPoint(point(mesh.positions, 0), [1, 4, 1]);
    expectPoint(point(mesh.positions, 2), [3, 4, -2]);
    expectPoint(point(mesh.positions, 4), [1, 4, -3]);
    expectPoint(point(mesh.positions, 6), [-1, 4, -2]);
    // x=z relative to the center at pi/4. The ellipse equation
    // x^2/2^2 + z^2/3^2 = 1 gives x=z=6/sqrt(13).
    const diagonal = 6 / Math.sqrt(13);
    expectPoint(point(mesh.positions, 1), [1 + diagonal, 4, -2 + diagonal]);
    const backDiagonal = 2 / Math.sqrt(5);
    expectPoint(point(mesh.positions, 3), [1 + backDiagonal, 4, -2 - backDiagonal]);
    expectStoredSurface(mesh);
  });

  it("preserves the independent superellipse equation instead of substituting a circle", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(1)],
      segments: 8,
      power: 4,
    });
    const diagonal = point(mesh.positions, 1);
    expectPoint(diagonal, [2 ** -0.25, 0, 2 ** -0.25]);
    expect(Math.abs(diagonal[0]) ** 4 + Math.abs(diagonal[2]) ** 4).toBeCloseTo(1, 5);
    expect(Math.hypot(diagonal[0], diagonal[2])).toBeCloseTo(2 ** 0.25, 5);
    const circular = createRevolvedSurfaceMesh({ sections: [section(0), section(1)], segments: 8 });
    expect(Math.hypot(...[circular.positions[3], circular.positions[5]])).toBeCloseTo(1, 5);
    expectStoredSurface(mesh);
  });

  it("applies center shifts, radial and axial offsets in their separate coordinate roles", () => {
    const row = {
      height: 4,
      halfWidth: 2,
      positiveDepth: 3,
      negativeDepth: 1,
      center: [1, -2] as const,
    };
    const mesh = createRevolvedSurfaceMesh({
      sections: [row, { ...row, height: 5 }],
      segments: 4,
      radialOffset: () => 0.5,
      axialOffset: () => -0.25,
    });
    expectPoint(point(mesh.positions, 0), [1, 3.75, 1.5]);
    expectPoint(point(mesh.positions, 1), [3.5, 3.75, -2]);
    expectPoint(point(mesh.positions, 2), [1, 3.75, -3.5]);
    expectPoint(point(mesh.positions, 3), [-1.5, 3.75, -2]);
    expectStoredSurface(mesh);
  });

  it("keeps wrapped-angular-length UVs separate from normalized parameter provenance", () => {
    const row = { height: 4, halfWidth: 2, positiveDepth: 3, negativeDepth: 1 };
    const mesh = createRevolvedSurfaceMesh({
      sections: [row, { ...row, height: 5 }],
      segments: 4,
      uv: "wrapped-angular-length",
      axialOffset: () => -0.25,
    });
    // Mean half-extent is (2+3+1)/3=2, so quarter-turn U is pi.
    expect(mesh.uvs[2]).toBeCloseTo(Math.PI, 5);
    expect(mesh.uvs[3]).toBe(3.75);
    expect(mesh.uvs[6]).toBeCloseTo(-Math.PI, 5);
    expect(mesh.parameters[2]).toBe(0);
    expect(mesh.parameters[3]).toBeCloseTo(Math.PI / 2, 14);
    expect(mesh.parameters[10]).toBe(1);
    expect(mesh.uvs[11]).toBe(4.75);
  });

  it("leaves partial angular and axial boundaries open without adding caps", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(1)],
      segments: 2,
      angular: { kind: "open", start: -Math.PI / 2, end: Math.PI / 2 },
    });
    expect(mesh.positions).toHaveLength(6 * 3);
    expect(mesh.indices).toHaveLength(4 * 3);
    expectPoint(point(mesh.positions, 0), [-1, 0, 0]);
    expectPoint(point(mesh.positions, 1), [0, 0, 1]);
    expectPoint(point(mesh.positions, 2), [1, 0, 0]);
    expectPoint(point(mesh.normals, 1), [0, 0, 1]);
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const us = Array.from(
        mesh.indices.subarray(offset, offset + 3),
        (index) => mesh.uvs[index * 2],
      );
      expect(Math.max(...us) - Math.min(...us)).toBeLessThanOrEqual(0.5);
    }
    expectStoredSurface(mesh);
  });

  it("allows one interval for an explicitly open patch", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(1)],
      segments: 1,
      angular: { kind: "open", start: -Math.PI / 4, end: Math.PI / 4 },
    });
    expect(mesh.positions).toHaveLength(4 * 3);
    expect(mesh.indices).toHaveLength(2 * 3);
    expectStoredSurface(mesh);
  });

  it("accepts descending axial rows with radial winding and original section parameters", () => {
    const mesh = createRevolvedSurfaceMesh({ sections: [section(1), section(0)], segments: 8 });
    expect(mesh.indices).toHaveLength(16 * 3);
    expectPoint(point(mesh.positions, 0), [0, 1, 1]);
    expectPoint(point(mesh.positions, 9), [0, 0, 1]);
    expect(mesh.parameters[0]).toBe(0);
    expect(mesh.parameters[18]).toBe(1);
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const cross = face(mesh, offset);
      const points = Array.from(mesh.indices.subarray(offset, offset + 3), (vertex) =>
        point(mesh.positions, vertex),
      );
      const radialX = points.reduce((sum, vertex) => sum + vertex[0], 0);
      const radialZ = points.reduce((sum, vertex) => sum + vertex[2], 0);
      expect(cross[0] * radialX + cross[2] * radialZ).toBeGreaterThan(0);
    }
    expectStoredSurface(mesh);
  });

  it("copies a closed seam exactly while preserving distinct normalized UV edges", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(1)],
      segments: 4,
      angular: { kind: "closed", seam: Math.PI },
    });
    for (const start of [0, 5]) {
      expect(point(mesh.positions, start + 4)).toEqual(point(mesh.positions, start));
      expect(point(mesh.normals, start + 4)).toEqual(point(mesh.normals, start));
      expect(Array.from(mesh.parameters.subarray((start + 4) * 2, (start + 5) * 2))).toEqual(
        Array.from(mesh.parameters.subarray(start * 2, (start + 1) * 2)),
      );
      expect(mesh.uvs[start * 2]).toBe(0);
      expect(mesh.uvs[(start + 4) * 2]).toBe(1);
    }
    expectPoint(point(mesh.positions, 0), [0, 0, -1]);
    expect(mesh.indices).toHaveLength(8 * 3);
  });

  it("uses one-sided normals at open full-turn edges rather than copying the closed stencil", () => {
    const sections = [section(0), section(1)];
    const open = createRevolvedSurfaceMesh({
      sections,
      segments: 4,
      angular: { kind: "open", start: 0, end: 2 * Math.PI },
    });
    const closed = createRevolvedSurfaceMesh({ sections, segments: 4 });
    // A square's first outgoing chord is (1,0,-1); its outward endpoint
    // normal has positive X and Z. The last incoming chord has negative X.
    expect(open.normals[0]).toBeGreaterThan(0.5);
    expect(open.normals[2]).toBeGreaterThan(0.5);
    expect(open.normals[12]).toBeLessThan(-0.5);
    expect(open.normals[14]).toBeGreaterThan(0.5);
    expectPoint(point(closed.normals, 0), [0, 0, 1]);
    expectStoredSurface(open);
  });

  it.each(["first", "last"] as const)(
    "emits a finite fan for a zero-size %s endpoint without a redundant cap",
    (endpoint) => {
      const sections =
        endpoint === "first" ? [section(0, 0), section(1)] : [section(0), section(1, 0)];
      const mesh = createRevolvedSurfaceMesh({ sections, segments: 8 });
      expect(mesh.indices).toHaveLength(8 * 3);
      expectStoredSurface(mesh);
    },
  );

  it("clamps intentional radial collapse and omits only analytically degenerate triangles", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(1)],
      segments: 8,
      radialOffset: (s) => (s === 0 ? -2 : 0),
    });
    expect(mesh.indices).toHaveLength(8 * 3);
    expectPoint(point(mesh.positions, 0), [0, 0, 0]);
    expectStoredSurface(mesh);
  });

  it("captures reused callback sections and centers immediately", () => {
    const center: [number, number] = [0, 0];
    const reused = { ...section(0), center };
    const mesh = createRevolvedSurfaceMesh({
      segments: 4,
      subdivisions: 1,
      sectionAt(s) {
        reused.height = s;
        reused.halfWidth = 1 + s;
        center[0] = 10 * s;
        return reused;
      },
    });
    reused.height = 100;
    reused.halfWidth = 100;
    center[0] = 100;
    expectPoint(point(mesh.positions, 0), [0, 0, 1]);
    expectPoint(point(mesh.positions, 1), [1, 0, 0]);
    expectPoint(point(mesh.positions, 5), [10, 1, 1]);
    expectPoint(point(mesh.positions, 6), [12, 1, 0]);
    expectStoredSurface(mesh);
  });

  it("samples sections once and unique closed offset samples in row-major order", () => {
    const sectionCalls: number[] = [],
      radialCalls: number[][] = [],
      axialCalls: number[][] = [];
    createRevolvedSurfaceMesh({
      segments: 4,
      subdivisions: 2,
      sectionAt(s) {
        sectionCalls.push(s);
        return section(s);
      },
      radialOffset(s, theta) {
        radialCalls.push([s, theta]);
        return 0;
      },
      axialOffset(s, theta) {
        axialCalls.push([s, theta]);
        return 0;
      },
    });
    expect(sectionCalls).toEqual([0, 0.5, 1]);
    const expected = [0, 0.5, 1].flatMap((s) =>
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((theta) => [s, theta]),
    );
    expect(radialCalls).toHaveLength(12);
    expect(axialCalls).toHaveLength(12);
    for (let index = 0; index < expected.length; index++) {
      expect(radialCalls[index][0]).toBe(expected[index][0]);
      expect(radialCalls[index][1]).toBeCloseTo(expected[index][1], 14);
      expect(axialCalls[index]).toEqual(radialCalls[index]);
    }
  });

  it("captures common options before callbacks can mutate the caller recipe", () => {
    const angular = { kind: "closed" as const, seam: 0 };
    const calls: number[] = [];
    const options: RevolvedSurfaceOptions = {
      segments: 4,
      subdivisions: 1,
      power: 2,
      angular,
      radialOffset: () => 0,
      axialOffset: () => 0,
      sectionAt(s) {
        calls.push(s);
        options.segments = 8;
        options.power = 4;
        options.uv = "angular-length";
        options.axialOffset = () => 100;
        angular.seam = Math.PI;
        return section(s);
      },
    };
    const baseline = createRevolvedSurfaceMesh({ sections: [section(0), section(1)], segments: 4 });
    expect(createRevolvedSurfaceMesh(options)).toEqual(baseline);
    expect(calls).toEqual([0, 1]);
  });

  it("derives cardinal normals from a linearly shifted centerline", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [
        { ...section(0), center: [0, 0] },
        { ...section(1), center: [1, 0] },
      ],
      segments: 4,
    });
    // At +X, the vertical direction is (1,1,0). Its perpendicular outward
    // direction in the XY plane is (1,-1,0), not the unshifted radial +X.
    expectPoint(point(mesh.normals, 1), [Math.SQRT1_2, -Math.SQRT1_2, 0]);
    expectPoint(point(mesh.normals, 3), [-Math.SQRT1_2, Math.SQRT1_2, 0]);
    expectPoint(point(mesh.normals, 0), [0, 0, 1]);
    expectStoredSurface(mesh);
  });

  it("allows a horizontal meridian segment without invented end faces", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(0, 2), section(1, 2)],
      segments: 8,
    });
    expect(mesh.indices).toHaveLength(2 * 2 * 8 * 3);
    expect(mesh.positions.some((value, index) => index % 3 === 1 && value === 0)).toBe(true);
    expect(mesh.positions.some((value, index) => index % 3 === 1 && value === 1)).toBe(true);
    expectStoredSurface(mesh);
  });

  it("is deterministic for pure callbacks despite unrelated prior invocations", () => {
    const options: RevolvedSurfaceOptions = {
      segments: 8,
      subdivisions: 2,
      sectionAt: (s) => section(s, 1 + s * 0.25),
      radialOffset: (s, theta) => 0.05 * Math.cos(theta * 2) * (1 + s),
      axialOffset: (s, theta) => 0.05 * Math.sin(theta) * s,
    };
    const first = createRevolvedSurfaceMesh(options);
    createRevolvedSurfaceMesh({ sections: [section(-2, 2), section(-1, 3)], segments: 5 });
    expect(createRevolvedSurfaceMesh(options)).toEqual(first);
  });

  it("preserves parameter and UV provenance when cusp corners need separate normals", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [section(0), section(0.1, 0.1), section(0.2, 10)],
      segments: 8,
    });
    expect(mesh.positions.length / 3).toBeGreaterThan(3 * 9);
    const sources = new Map<string, number[]>();
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      const key = [
        mesh.parameters[vertex * 2],
        mesh.parameters[vertex * 2 + 1],
        mesh.uvs[vertex * 2],
        mesh.uvs[vertex * 2 + 1],
      ].join(",");
      const prior = sources.get(key);
      if (prior) prior.push(vertex);
      else sources.set(key, [vertex]);
      expect([0, 0.5, 1]).toContain(mesh.parameters[vertex * 2]);
    }
    const duplicated = Array.from(sources.values()).filter((vertices) => vertices.length > 1);
    expect(duplicated.length).toBeGreaterThan(0);
    for (const vertices of duplicated)
      for (const vertex of vertices.slice(1))
        expect(point(mesh.positions, vertex)).toEqual(point(mesh.positions, vertices[0]));
    expectStoredSurface(mesh);
  });

  it("repairs a strictly negative raw stored-face incidence without an epsilon waiver", () => {
    const mesh = createRevolvedSurfaceMesh({
      sections: [
        section(0, 0.643452525138855),
        section(0.643452525138855, 1.4089385271072388),
        section(0.7654860019683838, 0),
      ],
      segments: 4,
    });
    expect(mesh.positions.length / 3).toBe(21);
    expect(mesh.indices).toHaveLength(12 * 3);
    // Three rows of five samples establish the original parameter grid.
    // Every repaired corner must retain one original sample's exact stored
    // position, UV and parameter metadata, rather than inventing a new sample.
    const originalVertices = 3 * 5;
    for (let vertex = originalVertices; vertex < mesh.positions.length / 3; vertex++) {
      const matchingOriginal = Array.from({ length: originalVertices }, (_, index) => index).find(
        (index) =>
          mesh.parameters[index * 2] === mesh.parameters[vertex * 2] &&
          mesh.parameters[index * 2 + 1] === mesh.parameters[vertex * 2 + 1] &&
          mesh.uvs[index * 2] === mesh.uvs[vertex * 2] &&
          mesh.uvs[index * 2 + 1] === mesh.uvs[vertex * 2 + 1],
      );
      expect(matchingOriginal).toBeDefined();
      if (matchingOriginal !== undefined) {
        expect(point(mesh.positions, vertex)).toEqual(point(mesh.positions, matchingOriginal));
      }
    }
    // The helper uses each unnormalised cross product from the final Float32
    // positions. Every emitted corner must have a strictly positive raw dot.
    expectStoredSurface(mesh);
  });

  it("rejects oversized grids before section callbacks or indexed row reads", () => {
    let calls = 0;
    expect(() =>
      createRevolvedSurfaceMesh({
        segments: 3,
        subdivisions: 250000,
        sectionAt(s) {
          calls++;
          return section(s);
        },
      }),
    ).toThrow(/vertex count|resource|1000000/);
    expect(calls).toBe(0);
    let reads = 0;
    const sections = new Proxy([section(0), section(1)], {
      get(target, key, receiver) {
        if (key === "length") return 250001;
        if (typeof key === "string" && /^\d+$/.test(key)) {
          reads++;
          return section(Number(key));
        }
        return Reflect.get(target, key, receiver);
      },
    });
    expect(() => createRevolvedSurfaceMesh({ sections, segments: 3 })).toThrow(
      /vertex count|resource|1000000/,
    );
    expect(reads).toBe(0);
  });

  it("selects a wide index array when the stored surface exceeds Uint16 range", () => {
    const mesh = createRevolvedSurfaceMesh({ sections: [section(0), section(1)], segments: 32768 });
    expect(mesh.positions.length / 3).toBe(65538);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.indices.some((index) => index > 65535)).toBe(true);
    expect(mesh.indices.every((index) => index < mesh.positions.length / 3)).toBe(true);
  });

  it("rejects malformed section sources, unsupported angular domains and invalid scalar callbacks", () => {
    const valid = { sections: [section(0), section(1)], segments: 4 };
    const invalid: unknown[] = [
      { ...valid, sections: [section(0)] },
      { ...valid, sections: [] },
      { ...valid, segments: 2 },
      { ...valid, segments: 3.5 },
      { segments: 4, subdivisions: 0, sectionAt: () => section(0) },
      { ...valid, power: 1 },
      { ...valid, power: Number.NaN },
      { ...valid, sections: [{ ...section(0), halfWidth: 0 }, section(1)] },
      { ...valid, sections: [section(0, 0), section(1, 0)] },
      { ...valid, sections: [section(0), section(0)] },
      { ...valid, sections: [section(0), { ...section(1), center: [Number.NaN, 0] }] },
      { ...valid, angular: { kind: "open", start: 1, end: 0 } },
      { ...valid, angular: { kind: "open", start: 0, end: 4 * Math.PI } },
      { ...valid, angular: { kind: "closed", seam: 1e30 } },
      { ...valid, radialOffset: () => Number.NaN },
      { ...valid, axialOffset: () => Number.POSITIVE_INFINITY },
      { ...valid, uv: "invalid" },
      { segments: 4, subdivisions: 1, sectionAt: () => undefined },
      { ...valid, subdivisions: 1, sectionAt: () => section(0) },
    ];
    for (const options of invalid)
      expect(() => createRevolvedSurfaceMesh(options as RevolvedSurfaceOptions)).toThrow();
  });

  it("rejects positive dimensions or faces erased by Float32 quantization", () => {
    expect(() =>
      createRevolvedSurfaceMesh({
        sections: [section(0, Number.MIN_VALUE), section(1)],
        segments: 4,
      }),
    ).toThrow();
    expect(() =>
      createRevolvedSurfaceMesh({ sections: [section(1e30), section(1e30 + 1e20)], segments: 4 }),
    ).toThrow(/Float32|quantization|zero area/);
    expect(() =>
      createRevolvedSurfaceMesh({
        sections: [section(0), section(1)],
        segments: 4,
        axialOffset: () => 3.5e38,
      }),
    ).toThrow();
  });
});

describe("explicit revolved parameter winding", () => {
  const folded: RevolvedSurfaceOptions = {
    sections: [section(0), section(-0.2, 2), section(0.1, 2.2), section(0.7, 1.2)],
    segments: 12,
    axialOffset: (s, theta) => 0.07 * Math.sin(theta) * (1 + 0.1 * s),
  };

  function expectGridWinding(
    mesh: RevolvedSurfaceMesh,
    rows: number,
    segments: number,
    winding: "forward" | "reverse",
  ): void {
    const gridVertex = (vertex: number): number =>
      Math.round(mesh.parameters[vertex * 2] * (rows - 1)) * (segments + 1) +
      Math.round(mesh.uvs[vertex * 2] * segments);
    let offset = 0;
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < segments; column++) {
        const a = row * (segments + 1) + column;
        const c = a + 1;
        const b = a + segments + 1;
        for (const expected of [
          [a, c, b],
          [c, b + 1, b],
        ]) {
          if (winding === "reverse") [expected[1], expected[2]] = [expected[2], expected[1]];
          expect(Array.from(mesh.indices.subarray(offset, offset + 3), gridVertex)).toEqual(
            expected,
          );
          offset += 3;
        }
      }
    }
    expect(offset).toBe(mesh.indices.length);
  }

  function expectCoherentEdges(
    mesh: RevolvedSurfaceMesh,
    rows: number,
    segments: number,
    closed: boolean,
  ): void {
    const source = (vertex: number): number => {
      const row = Math.round(mesh.parameters[vertex * 2] * (rows - 1));
      const column = Math.round(mesh.uvs[vertex * 2] * segments);
      return row * (segments + 1) + (closed ? column % segments : column);
    };
    const edges = new Map<string, number[]>();
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const vertices = Array.from(mesh.indices.subarray(offset, offset + 3), source);
      for (let corner = 0; corner < 3; corner++) {
        const a = vertices[corner];
        const b = vertices[(corner + 1) % 3];
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        const directions = edges.get(key) ?? [];
        directions.push(a < b ? 1 : -1);
        edges.set(key, directions);
      }
    }
    let boundaries = 0;
    for (const directions of edges.values()) {
      expect(directions.length).toBeLessThanOrEqual(2);
      if (directions.length === 1) boundaries++;
      else expect(directions[0] + directions[1]).toBe(0);
    }
    expect(boundaries).toBe(2 * segments + (closed ? 0 : 2 * (rows - 1)));
  }

  it("preserves omitted radial orientation and its folded-meridian rejection", () => {
    const options = { sections: [section(1), section(0)], segments: 8 };
    expect(createRevolvedSurfaceMesh({ ...options, winding: undefined })).toEqual(
      createRevolvedSurfaceMesh(options),
    );
    for (const options of [folded, { ...folded, winding: undefined }])
      expect(() => createRevolvedSurfaceMesh(options)).toThrow(/inconsistent orientation/);
  });

  it.each(["forward", "reverse"] as const)(
    "retains a complete folded grid with coherent %s faces and repaired corner normals",
    (winding) => {
      const mesh = createRevolvedSurfaceMesh({ ...folded, winding });
      expect(mesh.indices).toHaveLength(3 * 12 * 6);
      expectGridWinding(mesh, 4, 12, winding);
      expectCoherentEdges(mesh, 4, 12, true);
      expectStoredSurface(mesh);
      // The lower band points radially inward under forward parameter order.
      // The upper band points outward; one grid sign preserves both sides.
      expect(mesh.normals[2] * (winding === "forward" ? 1 : -1)).toBeLessThan(0);
      expect(mesh.normals[3 * 13 * 3 + 2] * (winding === "forward" ? 1 : -1)).toBeGreaterThan(0);
      for (let row = 0; row < 4; row++) {
        const first = row * 13;
        expect(point(mesh.positions, first + 12)).toEqual(point(mesh.positions, first));
        expect(point(mesh.normals, first + 12)).toEqual(point(mesh.normals, first));
        expect(mesh.parameters[(first + 12) * 2 + 1]).toBe(mesh.parameters[first * 2 + 1]);
        expect(mesh.uvs[first * 2]).toBe(0);
        expect(mesh.uvs[(first + 12) * 2]).toBe(1);
      }
    },
  );

  it("reverses normals and connectivity without changing sampled attributes", () => {
    const forward = createRevolvedSurfaceMesh({ ...folded, winding: "forward" });
    const reverse = createRevolvedSurfaceMesh({ ...folded, winding: "reverse" });
    expect(reverse.positions.length).toBe(forward.positions.length);
    expect(reverse.positions.subarray(0, 4 * 13 * 3)).toEqual(
      forward.positions.subarray(0, 4 * 13 * 3),
    );
    expect(reverse.uvs.subarray(0, 4 * 13 * 2)).toEqual(forward.uvs.subarray(0, 4 * 13 * 2));
    expect(reverse.parameters.subarray(0, 4 * 13 * 2)).toEqual(
      forward.parameters.subarray(0, 4 * 13 * 2),
    );
    for (let vertex = 0; vertex < 4 * 13; vertex++)
      expectPoint(
        point(reverse.normals, vertex),
        point(forward.normals, vertex).map((v) => -v),
      );
    for (let offset = 0; offset < forward.indices.length; offset += 3) {
      for (const [forwardCorner, reverseCorner] of [
        [0, 0],
        [1, 2],
        [2, 1],
      ]) {
        const a = forward.indices[offset + forwardCorner];
        const b = reverse.indices[offset + reverseCorner];
        expect(point(reverse.positions, b)).toEqual(point(forward.positions, a));
        expectPoint(
          point(reverse.normals, b),
          point(forward.normals, a).map((v) => -v),
        );
        expect(Array.from(reverse.uvs.subarray(b * 2, b * 2 + 2))).toEqual(
          Array.from(forward.uvs.subarray(a * 2, a * 2 + 2)),
        );
        expect(Array.from(reverse.parameters.subarray(b * 2, b * 2 + 2))).toEqual(
          Array.from(forward.parameters.subarray(a * 2, a * 2 + 2)),
        );
      }
    }
  });

  it.each(["forward", "reverse"] as const)(
    "uses %s winding on a folded patch with open angular ends",
    (winding) => {
      const mesh = createRevolvedSurfaceMesh({
        ...folded,
        winding,
        segments: 6,
        angular: { kind: "open", start: -Math.PI / 2, end: Math.PI / 2 },
      });
      expectGridWinding(mesh, 4, 6, winding);
      expectCoherentEdges(mesh, 4, 6, false);
      expectStoredSurface(mesh);
    },
  );

  it.each(["forward", "reverse"] as const)(
    "keeps analytic pole fans and raw stored-face repairs under %s winding",
    (winding) => {
      for (const sections of [
        [section(0, 0), section(1)],
        [section(0), section(1, 0)],
        [
          section(0, 0.643452525138855),
          section(0.643452525138855, 1.4089385271072388),
          section(0.7654860019683838, 0),
        ],
      ]) {
        for (const angular of [undefined, { kind: "open" as const, start: 0, end: Math.PI }]) {
          const mesh = createRevolvedSurfaceMesh({ sections, segments: 4, winding, angular });
          expect(mesh.indices).toHaveLength((sections.length === 2 ? 4 : 12) * 3);
          if (sections.length === 3 && angular === undefined)
            expect(mesh.positions.length / 3).toBeGreaterThan(15);
          for (let vertex = sections.length * 5; vertex < mesh.positions.length / 3; vertex++) {
            const original = Array.from({ length: sections.length * 5 }, (_, index) => index).find(
              (index) =>
                mesh.parameters[index * 2] === mesh.parameters[vertex * 2] &&
                mesh.parameters[index * 2 + 1] === mesh.parameters[vertex * 2 + 1] &&
                mesh.uvs[index * 2] === mesh.uvs[vertex * 2] &&
                mesh.uvs[index * 2 + 1] === mesh.uvs[vertex * 2 + 1],
            );
            expect(original).toBeDefined();
            if (original !== undefined)
              expect(point(mesh.positions, vertex)).toEqual(point(mesh.positions, original));
          }
          expectStoredSurface(mesh);
        }
      }
    },
  );

  it("rejects unknown winding before any section or displacement callback", () => {
    for (const winding of ["radial", "invalid", null, 0]) {
      let calls = 0;
      const sample = () => {
        calls++;
        return 0;
      };
      expect(() =>
        createRevolvedSurfaceMesh({
          segments: 4,
          subdivisions: 1,
          winding,
          sectionAt: (s: number) => {
            calls++;
            return section(s);
          },
          radialOffset: sample,
          axialOffset: sample,
        } as RevolvedSurfaceOptions),
      ).toThrow(/winding/);
      expect(calls).toBe(0);
    }
  });

  it("captures explicit winding before callbacks mutate the caller options", () => {
    const options: RevolvedSurfaceOptions = {
      segments: 4,
      subdivisions: 1,
      winding: "forward",
      sectionAt(s) {
        options.winding = "reverse";
        return section(1 - s);
      },
    };
    expect(createRevolvedSurfaceMesh(options)).toEqual(
      createRevolvedSurfaceMesh({
        sections: [section(1), section(0)],
        segments: 4,
        winding: "forward",
      }),
    );
  });

  it.each(["forward", "reverse"] as const)(
    "retains quantization and pre-callback resource guards with %s winding",
    (winding) => {
      expect(() =>
        createRevolvedSurfaceMesh({
          sections: [section(1e30), section(1e30 + 1e20)],
          segments: 4,
          winding,
        }),
      ).toThrow(/Float32|quantization|zero area/);
      expect(() =>
        createRevolvedSurfaceMesh({
          sections: [section(0, Number.MIN_VALUE), section(1)],
          segments: 4,
          winding,
        }),
      ).toThrow(/Float32/);
      let calls = 0;
      expect(() =>
        createRevolvedSurfaceMesh({
          segments: 3,
          subdivisions: 250000,
          winding,
          sectionAt(s) {
            calls++;
            return section(s);
          },
        }),
      ).toThrow(/vertex count|resource|1000000/);
      expect(calls).toBe(0);
    },
  );
});

describe("revolved angular-length UV projections", () => {
  it("keeps an open sweep continuous across the wrapped angle boundary", () => {
    const row = { height: 4, halfWidth: 2, positiveDepth: 3, negativeDepth: 1 };
    const options: RevolvedSurfaceOptions = {
      sections: [row, { ...row, height: 5 }],
      segments: 4,
      angular: { kind: "open", start: 2, end: 4 },
      axialOffset: () => -0.25,
    };
    const mesh = createRevolvedSurfaceMesh({ ...options, uv: "angular-length" });
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column <= 4; column++) {
        const vertex = row * 5 + column;
        // Mean reference half-extent 2 times sweep offset column/2.
        expect(mesh.uvs[vertex * 2]).toBe(column);
        expect(mesh.uvs[vertex * 2 + 1]).toBe(3.75 + row);
      }
    }
    expect(mesh.parameters[2 * 2 + 1]).toBe(3);
    expect(mesh.parameters[3 * 2 + 1]).toBeLessThan(0);
    const normalized = createRevolvedSurfaceMesh(options);
    expect(mesh.positions).toEqual(normalized.positions);
    expect(mesh.normals).toEqual(normalized.normals);
    expect(mesh.indices).toEqual(normalized.indices);
    expect(mesh.parameters).toEqual(normalized.parameters);
    expectStoredSurface(mesh);
  });

  it.each([
    {
      label: "asymmetric ellipse",
      power: 2,
      sections: [
        { height: 0, halfWidth: 2, positiveDepth: 3, negativeDepth: 1 },
        { height: 1, halfWidth: 3, positiveDepth: 4, negativeDepth: 2 },
      ],
    },
    {
      label: "asymmetric superellipse",
      power: 4,
      sections: [
        { height: 0, halfWidth: 2, positiveDepth: 3, negativeDepth: 1 },
        { height: 1, halfWidth: 3, positiveDepth: 4, negativeDepth: 2 },
      ],
    },
    { label: "first endpoint pole", power: 2, sections: [section(0, 0), section(1)] },
    { label: "last endpoint pole", power: 4, sections: [section(0), section(1, 0)] },
  ])("uses sweep distance through the closed seam for $label", ({ sections, power }) => {
    for (const seam of [0, 2.5, -1.2]) {
      const mesh = createRevolvedSurfaceMesh({
        sections,
        power,
        segments: 8,
        angular: { kind: "closed", seam },
        uv: "angular-length",
      });
      for (let row = 0; row < sections.length; row++) {
        const source = sections[row];
        const mean = (source.halfWidth + source.positiveDepth + source.negativeDepth) / 3;
        const first = row * 9;
        expect(mesh.uvs[first * 2]).toBe(0);
        expect(mesh.uvs[(first + 8) * 2]).toBe(Math.fround(2 * Math.PI * mean));
        expect(point(mesh.positions, first + 8)).toEqual(point(mesh.positions, first));
        expect(mesh.parameters[(first + 8) * 2 + 1]).toBe(mesh.parameters[first * 2 + 1]);
        for (let column = 0; column <= 8; column++) {
          const vertex = first + column;
          expect(mesh.uvs[vertex * 2]).toBe(Math.fround((column / 8) * 2 * Math.PI * mean));
          expect(mesh.uvs[vertex * 2 + 1]).toBe(source.height);
          if (column === 0) continue;
          const increment = mesh.uvs[vertex * 2] - mesh.uvs[(vertex - 1) * 2];
          expect(increment).toBeCloseTo((2 * Math.PI * mean) / 8, 5);
          if (mean > 0) expect(increment).toBeGreaterThan(0);
          else expect(increment).toBe(0);
        }
      }
      expectStoredSurface(mesh);
    }
  });

  it("preserves the explicit wrapped projection and its copied closed seam", () => {
    const sections = [section(0, 2), section(1, 2)];
    for (const seam of [0, 2.5]) {
      const mesh = createRevolvedSurfaceMesh({
        sections,
        segments: 8,
        angular: { kind: "closed", seam },
        uv: "wrapped-angular-length",
      });
      for (let row = 0; row < 2; row++) {
        const first = row * 9;
        for (let column = 0; column < 8; column++) {
          const raw = seam + (column / 8) * 2 * Math.PI;
          const wrapped = Math.atan2(Math.sin(raw), Math.cos(raw));
          expect(mesh.uvs[(first + column) * 2]).toBe(Math.fround(wrapped * 2));
        }
        expect(mesh.uvs[(first + 8) * 2]).toBe(mesh.uvs[first * 2]);
      }
      expectStoredSurface(mesh);
    }
    const open = createRevolvedSurfaceMesh({
      sections,
      segments: 4,
      angular: { kind: "open", start: 2, end: 4 },
      uv: "wrapped-angular-length",
    });
    expect(open.uvs[0]).toBe(4);
    expect(open.uvs[4 * 2]).toBe(Math.fround(Math.atan2(Math.sin(4), Math.cos(4)) * 2));
    expect(open.uvs[3 * 2]).toBeLessThan(open.uvs[2 * 2]);
    expectStoredSurface(open);
  });

  it("checks Float32 admission for the continuous closed seam beyond its unique columns", () => {
    const radius = 6e37;
    const options = { sections: [section(0, radius), section(1, radius)], segments: 3 };
    expect(Number.isFinite(Math.fround((4 * Math.PI * radius) / 3))).toBe(true);
    expect(Math.fround(2 * Math.PI * radius)).toBe(Number.POSITIVE_INFINITY);
    expect(() => createRevolvedSurfaceMesh({ ...options, uv: "angular-length" })).toThrow(/UV u/);
    for (const uv of ["normalized", "wrapped-angular-length"] as const) {
      const mesh = createRevolvedSurfaceMesh({ ...options, uv });
      expect(mesh.indices).toHaveLength(18);
      expectStoredSurface(mesh);
    }
  });

  it("rejects malformed UV modes before section or displacement callbacks", () => {
    for (const uv of ["continuous", "wrapped", "", null, 1]) {
      let calls = 0;
      expect(() =>
        createRevolvedSurfaceMesh({
          segments: 4,
          subdivisions: 1,
          uv,
          sectionAt(s: number) {
            calls++;
            return section(s);
          },
          radialOffset() {
            calls++;
            return 0;
          },
          axialOffset() {
            calls++;
            return 0;
          },
        } as RevolvedSurfaceOptions),
      ).toThrow(/UV mode/);
      expect(calls).toBe(0);
    }
  });
});
