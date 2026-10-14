import { describe, expect, it } from "vitest";
import { createSheetMesh, type ProceduralMesh } from "../src/mesh.ts";
import { createThreeHeightfieldGeometry, createThreeMeshGeometry } from "../src/three.ts";

function emptyQuad(): ProceduralMesh {
  return {
    positions: new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    indices: new Uint16Array(0),
  };
}

describe("empty indexed surface adapter", () => {
  it("accepts an actual fully omitted sampled sheet", () => {
    const data = createSheetMesh({
      width: 2,
      height: 3,
      columns: 3,
      rows: 2,
      includeCell: () => false,
      heightAt: (u, v) => u - v,
    });
    const geometry = createThreeMeshGeometry(data);
    expect(geometry.index?.count).toBe(0);
    expect(geometry.getAttribute("position").count).toBe(6);
    expect(geometry.getAttribute("position").array).toBe(data.positions);
    expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
    geometry.dispose();
  });
  it("retains valid sampled attributes in a drawable empty geometry", () => {
    const data = emptyQuad();
    const geometry = createThreeMeshGeometry(data);
    expect(geometry.index?.count).toBe(0);
    expect(geometry.getAttribute("position").array).toBe(data.positions);
    expect(geometry.getAttribute("normal").array).toBe(data.normals);
    expect(geometry.getAttribute("uv").array).toBe(data.uvs);
    expect(geometry.boundingSphere?.radius).toBeCloseTo(Math.SQRT1_2);
    geometry.dispose();
  });

  it("still validates finite attributes and complete layouts without triangles", () => {
    const data = emptyQuad();
    data.normals[0] = Number.NaN;
    expect(() => createThreeMeshGeometry(data)).toThrow("attributes must be finite");
    expect(() => createThreeMeshGeometry({ ...emptyQuad(), uvs: new Float32Array(6) })).toThrow(
      "UV layout must match positions",
    );
  });

  it("retains the existing nonempty heightfield index contract", () => {
    const data = emptyQuad();
    expect(() =>
      createThreeHeightfieldGeometry({
        positions: data.positions,
        normals: data.normals,
        indices: new Uint32Array(0),
        width: 2,
        depth: 2,
      }),
    ).toThrow("indices must contain bounded complete triangles");
  });
});
