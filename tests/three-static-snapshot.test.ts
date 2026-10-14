import { describe, expect, it } from "vitest";
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Matrix4,
  Object3D,
  Points,
  PointsMaterial,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
} from "three";
import { createThreeMeshGeometry, type ThreeStaticMeshSnapshot } from "../src/three.ts";
import * as adapters from "../src/three.ts";

type Snapshot = ThreeStaticMeshSnapshot;

type SnapshotStaticMeshes = (root: Object3D, options?: { space?: "root" | "world" }) => Snapshot[];

const snapshotExport = (adapters as Record<string, unknown>).snapshotThreeStaticMeshes;
const snapshot = snapshotExport as SnapshotStaticMeshes;

function triangleGeometry(
  options: {
    positions?: Float32Array;
    normals?: BufferAttribute | InterleavedBufferAttribute;
    indices?: Uint16Array | Uint32Array;
    uvs?: BufferAttribute | InterleavedBufferAttribute;
  } = {},
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(options.positions ?? new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  );
  if (options.normals) geometry.setAttribute("normal", options.normals);
  if (options.uvs) geometry.setAttribute("uv", options.uvs);
  geometry.setIndex(new BufferAttribute(options.indices ?? new Uint16Array([0, 1, 2]), 1));
  return geometry;
}

function mesh(geometry = triangleGeometry(), name = "triangle"): Mesh {
  const out = new Mesh(geometry, new MeshBasicMaterial());
  out.name = name;
  return out;
}

function prepare(root: Object3D): void {
  root.updateWorldMatrix(true, true);
}

function expectSnapshotError(operation: () => unknown): void {
  expect(operation).toThrow(/^Three static snapshot:/);
}

function snapshotAt(entries: readonly Snapshot[], index: number): Snapshot {
  const entry = entries[index];
  expect(entry).toBeDefined();
  if (!entry) throw new Error(`Missing snapshot at ${index}`);
  return entry;
}

describe("static Three mesh snapshots", () => {
  it("exports the public Three static snapshot adapter", () => {
    // Deliberate RED baseline before the adapter source is integrated.
    expect(snapshotExport).toBeTypeOf("function");
  });

  describe.runIf(typeof snapshotExport === "function")("implemented adapter contract", () => {
    it("returns an empty snapshot for an empty hierarchy", () => {
      const root = new Group();
      prepare(root);
      expect(snapshot(root)).toEqual([]);
    });

    it("includes a root mesh in deterministic preorder and copies indexed interleaved normalized attributes", () => {
      const root = mesh();
      root.name = "root mesh";
      const child = mesh(triangleGeometry(), "child mesh");
      root.add(child);
      const interleaved = new InterleavedBuffer(
        new Uint16Array([0, 0, 0, 0, 0, 65535, 0, 0, 65535, 0, 0, 65535, 0, 0, 65535]),
        5,
      );
      const packed = triangleGeometry({
        normals: undefined,
        uvs: new InterleavedBufferAttribute(interleaved, 2, 3, true),
      });
      packed.setAttribute("position", new InterleavedBufferAttribute(interleaved, 3, 0, true));
      const packedMesh = mesh(packed, "packed mesh");
      child.add(packedMesh);
      prepare(root);

      const before = Array.from(interleaved.array);
      const result = snapshot(root);
      const packedEntry = snapshotAt(result, 2);
      expect(result.map((entry) => entry.name)).toEqual(["root mesh", "child mesh", "packed mesh"]);
      expect(Array.from(packedEntry.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(Array.from(packedEntry.uvs ?? [])).toEqual([0, 0, 1, 0, 0, 1]);
      expect(Array.from(packedEntry.indices)).toEqual([0, 1, 2]);
      expect(Array.from(interleaved.array)).toEqual(before);
      expect(packedEntry.positions).not.toBe(interleaved.array);
    });

    it("uses prepared nested transforms in root and world spaces without changing matrix caches", () => {
      const root = new Group();
      root.position.set(10, 20, 30);
      const nested = new Group();
      nested.position.set(5, 7, 11);
      nested.rotation.z = Math.PI / 2;
      const sourceNormal = Math.SQRT1_2;
      const child = mesh(
        triangleGeometry({
          normals: new BufferAttribute(
            new Float32Array([
              sourceNormal,
              sourceNormal,
              0,
              sourceNormal,
              sourceNormal,
              0,
              sourceNormal,
              sourceNormal,
              0,
            ]),
            3,
          ),
        }),
      );
      child.scale.set(2, 3, 4);
      root.add(nested);
      nested.add(child);
      prepare(root);
      const rootWorld = root.matrixWorld.toArray();
      const nestedWorld = nested.matrixWorld.toArray();
      const childWorld = child.matrixWorld.toArray();

      const rootSpace = snapshotAt(snapshot(root), 0);
      const worldSpace = snapshotAt(snapshot(root, { space: "world" }), 0);
      const normalX = -2 / Math.sqrt(13);
      const normalY = 3 / Math.sqrt(13);
      expect(Array.from(rootSpace.positions)).toEqual([5, 7, 11, 5, 9, 11, 2, 7, 11]);
      expect(Array.from(worldSpace.positions)).toEqual([15, 27, 41, 15, 29, 41, 12, 27, 41]);
      for (const offset of [0, 3, 6]) {
        expect(rootSpace.normals[offset]).toBeCloseTo(normalX);
        expect(rootSpace.normals[offset + 1]).toBeCloseTo(normalY);
        expect(rootSpace.normals[offset + 2]).toBeCloseTo(0);
      }
      expect(root.matrixWorld.toArray()).toEqual(rootWorld);
      expect(nested.matrixWorld.toArray()).toEqual(nestedWorld);
      expect(child.matrixWorld.toArray()).toEqual(childWorld);
    });

    it("cancels a reflected root transform in root space but reverses copied winding in world space", () => {
      const root = new Group();
      root.scale.set(-1, 1, 1);
      const child = mesh(triangleGeometry(), "root reflection");
      root.add(child);
      prepare(root);

      const rootSpace = snapshotAt(snapshot(root), 0);
      const worldSpace = snapshotAt(snapshot(root, { space: "world" }), 0);

      expect(Array.from(rootSpace.indices)).toEqual([0, 1, 2]);
      expect(Array.from(worldSpace.indices)).toEqual([0, 2, 1]);
      expect(Array.from(rootSpace.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(Array.from(worldSpace.positions)).toEqual([0, 0, 0, -1, 0, 0, 0, 1, 0]);
    });

    it("generates area-weighted transformed normals and corrects copied winding for reflections", () => {
      const root = new Group();
      const generatedGeometry = triangleGeometry({
        positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2]),
        indices: new Uint16Array([0, 1, 2, 0, 3, 1]),
      });
      const missing = mesh(generatedGeometry, "missing normal");
      const reflected = mesh(triangleGeometry(), "reflected missing normal");
      reflected.scale.set(-1, 1, 1);
      root.add(missing, reflected);
      prepare(root);

      const snapshots = snapshot(root);
      const generated = snapshotAt(snapshots, 0);
      const reflection = snapshotAt(snapshots, 1);
      expect(generated.normals[0]).toBeCloseTo(0);
      expect(generated.normals[1]).toBeCloseTo(2 / Math.sqrt(5));
      expect(generated.normals[2]).toBeCloseTo(1 / Math.sqrt(5));
      expect(generated.normals[3]).toBeCloseTo(0);
      expect(generated.normals[4]).toBeCloseTo(2 / Math.sqrt(5));
      expect(generated.normals[5]).toBeCloseTo(1 / Math.sqrt(5));
      expect(generated.normals[6]).toBeCloseTo(0);
      expect(generated.normals[7]).toBeCloseTo(0);
      expect(generated.normals[8]).toBeCloseTo(1);
      expect(generated.normals[9]).toBeCloseTo(0);
      expect(generated.normals[10]).toBeCloseTo(1);
      expect(generated.normals[11]).toBeCloseTo(0);
      expect(Array.from(reflection.indices)).toEqual([0, 2, 1]);
      expect(Array.from(reflection.normals)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    });

    it("creates copied Uint32 indices for a large nonindexed static mesh", () => {
      const vertices = 65_538;
      const positions = new Float32Array(vertices * 3);
      for (let vertex = 0; vertex < vertices; vertex += 3) {
        positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], vertex * 3);
      }
      const geometry = triangleGeometry({ positions });
      geometry.setIndex(null);
      const root = mesh(geometry);
      prepare(root);
      const result = snapshotAt(snapshot(root), 0);
      expect(result.indices).toBeInstanceOf(Uint32Array);
      expect(result.indices.length).toBe(vertices);
      expect(result.indices.at(-1)).toBe(vertices - 1);
      expect(result.normals[2]).toBeCloseTo(1);
    });

    it("does not retain source buffers or mutate a caller-owned source cache", () => {
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      const root = mesh(triangleGeometry({ positions, indices }));
      prepare(root);
      const matrix = root.matrixWorld.toArray();
      const result = snapshotAt(snapshot(root), 0);
      result.positions[0] = 99;
      result.indices[0] = 2;
      expect(Array.from(positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(Array.from(indices)).toEqual([0, 1, 2]);
      expect(root.matrixWorld.toArray()).toEqual(matrix);
    });

    it("preserves valid authored zero normals", () => {
      const root = mesh(
        triangleGeometry({
          normals: new BufferAttribute(new Float32Array(9), 3),
        }),
      );
      prepare(root);
      expect(Array.from(snapshotAt(snapshot(root), 0).normals)).toEqual(new Array(9).fill(0));
    });

    it("passes a typed no-UV snapshot directly to the public Three geometry adapter", () => {
      const root = mesh(triangleGeometry(), "neutral no-UV snapshot");
      prepare(root);
      const copied = snapshotAt(snapshot(root), 0);
      const geometry = createThreeMeshGeometry(copied);
      try {
        expect(geometry.getAttribute("position").array).toBe(copied.positions);
        expect(geometry.getAttribute("normal").array).toBe(copied.normals);
        expect(geometry.getIndex()?.array).toBe(copied.indices);
        expect(geometry.getAttribute("uv")).toBeUndefined();
      } finally {
        geometry.dispose();
      }
    });

    it("rejects each unsupported scene object and partial geometry before snapshotting", () => {
      const material = new MeshBasicMaterial();
      const batched = new BatchedMesh(1, 3, 3, material);
      const batchedGeometry = batched.addGeometry(triangleGeometry());
      const batchedInstance = batched.addInstance(batchedGeometry);
      batched.setMatrixAt(batchedInstance, new Matrix4().makeTranslation(9, 0, 0));
      const instancedGeometry = new InstancedBufferGeometry().copy(triangleGeometry());
      const unsupported = [
        new SkinnedMesh(triangleGeometry(), material),
        new InstancedMesh(triangleGeometry(), material, 1),
        batched,
        new Mesh(instancedGeometry, material),
        new Line(triangleGeometry(), new LineBasicMaterial()),
        new Points(triangleGeometry(), new PointsMaterial()),
        new Sprite(new SpriteMaterial()),
      ];
      for (const object of unsupported) {
        prepare(object);
        expectSnapshotError(() => snapshot(object));
      }
      const groupedGeometry = triangleGeometry();
      groupedGeometry.addGroup(0, 3, 0);
      const grouped = mesh(groupedGeometry);
      prepare(grouped);
      expectSnapshotError(() => snapshot(grouped));
      const partial = triangleGeometry();
      partial.setDrawRange(0, 0);
      const partialMesh = mesh(partial);
      prepare(partialMesh);
      expectSnapshotError(() => snapshot(partialMesh));
      const morphed = triangleGeometry();
      morphed.morphAttributes.position = [
        new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]), 3),
      ];
      const morphedMesh = mesh(morphed);
      prepare(morphedMesh);
      expectSnapshotError(() => snapshot(morphedMesh));
    });

    it("rejects malformed attributes, indices, degeneracy, and prepared nonfinite matrices", () => {
      const malformed = triangleGeometry();
      malformed.setAttribute("position", new BufferAttribute(new Float32Array([0, 0]), 3));
      const malformedNormal = triangleGeometry({
        normals: new BufferAttribute(new Float32Array([0, 0, 1]), 3),
      });
      const malformedUv = triangleGeometry({
        uvs: new BufferAttribute(new Float32Array([0, 0, 1, 0]), 2),
      });
      const invalidIndex = triangleGeometry();
      invalidIndex.setIndex(new BufferAttribute(new Uint16Array([0, 1, 3]), 1));
      const degenerate = triangleGeometry({
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
      });
      const nonFinite = mesh();
      prepare(nonFinite);
      nonFinite.matrixWorld.elements[0] = Number.NaN;
      for (const candidate of [
        mesh(malformed),
        mesh(malformedNormal),
        mesh(malformedUv),
        mesh(invalidIndex),
        mesh(degenerate),
        nonFinite,
      ]) {
        if (candidate !== nonFinite) prepare(candidate);
        expectSnapshotError(() => snapshot(candidate));
      }
      const singular = mesh();
      singular.scale.set(0, 1, 1);
      prepare(singular);
      expectSnapshotError(() => snapshot(singular));
    });

    it("rejects hierarchy, vertex, and index totals before producing output", () => {
      const tooManyNodes = new Group();
      for (let index = 0; index <= 100_000; index += 1) tooManyNodes.add(new Object3D());
      prepare(tooManyNodes);
      expectSnapshotError(() => snapshot(tooManyNodes));

      const largeVertices = new Float32Array(600_000 * 3);
      largeVertices.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const sharedLarge = triangleGeometry({ positions: largeVertices });
      const vertexRoot = new Group();
      vertexRoot.add(mesh(sharedLarge), mesh(sharedLarge));
      prepare(vertexRoot);
      expectSnapshotError(() => snapshot(vertexRoot));

      const manyIndices = new Uint32Array(6_000_003);
      manyIndices.set([0, 1, 2]);
      const indexRoot = mesh(triangleGeometry({ indices: manyIndices }));
      prepare(indexRoot);
      expectSnapshotError(() => snapshot(indexRoot));
    });
  });
});
