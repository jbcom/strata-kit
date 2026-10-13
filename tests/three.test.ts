import { describe, expect, it } from "vitest";
import { LinearFilter, NoColorSpace, RGBAFormat, SRGBColorSpace } from "three";
import * as adapters from "../src/three.ts";

function mesh() {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
  };
}

describe("explicit Three procedural resources", () => {
  it("converts valid neutral mesh attributes and owns only its geometry", () => {
    expect(adapters.createThreeMeshGeometry).toBeTypeOf("function");
    const data = mesh();
    const geometry = adapters.createThreeMeshGeometry(data);
    expect(geometry.getAttribute("position").array).toBe(data.positions);
    expect(geometry.getAttribute("uv").array).toBe(data.uvs);
    expect(geometry.index?.array).toBe(data.indices);
    expect(geometry.boundingBox?.max.x).toBe(1);
    geometry.dispose();
    expect(data.positions[3]).toBe(1);
  });

  it("rejects malformed buffers and indices before creating a geometry", () => {
    for (const broken of [
      { ...mesh(), positions: new Float32Array([0, 0]) },
      { ...mesh(), normals: new Float32Array([0, 0, 1]) },
      { ...mesh(), uvs: new Float32Array([0, 0]) },
      { ...mesh(), positions: new Float32Array([Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0]) },
      { ...mesh(), indices: new Uint16Array([0, 1, 3]) },
      { ...mesh(), indices: new Uint16Array([0, 1]) },
    ])
      expect(() => adapters.createThreeMeshGeometry(broken)).toThrow();
  });

  it("rejects malformed legacy heightfields before conversion", () => {
    expect(() =>
      adapters.createThreeHeightfieldGeometry({
        ...mesh(),
        indices: new Uint32Array([0, 1, 2]),
        width: 2,
        depth: 2,
      }),
    ).toThrow();
  });

  it("maps scalar channels and top-left rows into conventional Three UV textures", () => {
    expect(adapters.createThreeSurfaceTextures).toBeTypeOf("function");
    const bake = {
      width: 1,
      height: 2,
      color: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]),
      roughness: new Uint8Array([12, 34]),
      bump: new Uint8Array([56, 78]),
      metalness: new Uint8Array([90, 123]),
    };
    const textures = adapters.createThreeSurfaceTextures(bake);
    expect(Array.from(textures.map.image.data)).toEqual([40, 50, 60, 255, 10, 20, 30, 255]);
    expect(textures.map.colorSpace).toBe(SRGBColorSpace);
    expect(textures.roughnessMap.colorSpace).toBe(NoColorSpace);
    expect(textures.roughnessMap.format).toBe(RGBAFormat);
    expect(Array.from(textures.roughnessMap.image.data)).toEqual([
      34, 34, 34, 255, 12, 12, 12, 255,
    ]);
    expect(Array.from(textures.metalnessMap?.image.data ?? [])).toEqual([
      123, 123, 123, 255, 90, 90, 90, 255,
    ]);
    // RGBA remains uploadable on WebGL1 at the declared Three r152 floor.
    expect(textures.bumpMap.format).toBe(RGBAFormat);
    expect(textures.bumpMap.colorSpace).toBe(NoColorSpace);
    expect(Array.from(textures.bumpMap.image.data)).toEqual([
      78, 78, 78, 255, 56, 56, 56, 255,
    ]);
    expect(textures.map.minFilter).toBe(LinearFilter);
    expect(textures.map.magFilter).toBe(LinearFilter);
    expect(textures.map.flipY).toBe(false);
    let disposed = 0;
    for (const texture of [
      textures.map,
      textures.roughnessMap,
      textures.bumpMap,
      textures.metalnessMap,
    ]) {
      texture?.addEventListener("dispose", () => {
        disposed += 1;
      });
    }
    textures.dispose();
    textures.dispose();
    expect(disposed).toBe(4);
    expect(bake.color[0]).toBe(10);
  });

  it("supports explicit unflipped data and rejects invalid bake layouts", () => {
    const bake = {
      width: 1,
      height: 1,
      color: new Uint8Array([1, 2, 3, 255]),
      roughness: new Uint8Array([4]),
      bump: new Uint8Array([5]),
    };
    const textures = adapters.createThreeSurfaceTextures(bake, { flipY: false });
    expect(Array.from(textures.map.image.data)).toEqual([1, 2, 3, 255]);
    expect(textures.metalnessMap).toBeUndefined();
    textures.dispose();
    expect(() =>
      adapters.createThreeSurfaceTextures({ ...bake, color: new Uint8Array(3) }),
    ).toThrow();
    expect(() => adapters.createThreeSurfaceTextures({ ...bake, width: 0 })).toThrow();
  });
});
