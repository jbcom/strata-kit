import { expect, it } from "vitest";
import {
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  Matrix3,
  Matrix4,
  MeshStandardMaterial,
  NoColorSpace,
  ShaderLib,
  Texture,
} from "three";
import * as adapters from "../src/three.ts";

type Textures = {
  map: Texture;
  roughnessMap: Texture;
  bumpMap: Texture;
  metalnessMap?: Texture;
  dispose(): void;
};
type Options = {
  fieldTransform?: Matrix4;
  sharpness?: number;
  flipV?: boolean;
  color?: string | number | Color;
  roughness?: number;
  metalness?: number;
  bumpScale?: number;
  side?: typeof FrontSide | typeof BackSide | typeof DoubleSide;
};
type Factory = (textures: Textures, options?: Options) => MeshStandardMaterial;
type Shader = {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
};

function factory(): Factory {
  const value = (adapters as Record<string, unknown>).createThreeTriplanarMaterial;
  expect(value).toBeTypeOf("function");
  return value as Factory;
}

function textures(withMetalness = true): Textures {
  return adapters.createThreeSurfaceTextures({
    width: 1,
    height: 1,
    color: new Uint8Array([100, 120, 140, 255]),
    roughness: new Uint8Array([80]),
    bump: new Uint8Array([128]),
    ...(withMetalness ? { metalness: new Uint8Array([60]) } : {}),
  });
}

function actualStandardShader(): Shader {
  return {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  };
}

const webgl2Renderer = {
  isWebGLRenderer: true,
  capabilities: { isWebGL2: true },
  extensions: { has: () => false },
};

function matrixValues(value: Matrix3 | Matrix4): number[] {
  return Array.from(value.elements);
}

it("exports the triplanar material factory from the Three adapter", () => {
  expect(factory()).toBeTypeOf("function");
});

it("returns fresh materials without mutating or disposing caller textures", () => {
  const input = textures();
  input.map.flipY = false;
  input.roughnessMap.name = "caller-owned-roughness";
  let disposed = 0;
  for (const texture of [input.map, input.roughnessMap, input.bumpMap, input.metalnessMap])
    texture?.addEventListener("dispose", () => (disposed += 1));

  const first = factory()(input);
  const second = factory()(input, {
    color: "#d3a35f",
    roughness: 0.36,
    metalness: 0.74,
    bumpScale: 1.5,
    side: DoubleSide,
  });

  expect(first).toBeInstanceOf(MeshStandardMaterial);
  expect(second).toBeInstanceOf(MeshStandardMaterial);
  expect(first).not.toBe(second);
  expect(first.map).toBe(input.map);
  expect(first.roughnessMap).toBe(input.roughnessMap);
  expect(first.bumpMap).toBe(input.bumpMap);
  expect(first.metalnessMap).toBe(input.metalnessMap);
  expect(first.color.getHexString()).toBe("ffffff");
  expect(first.roughness).toBe(1);
  expect(first.metalness).toBe(0);
  expect(first.bumpScale).toBe(1);
  expect(first.side).toBe(FrontSide);
  expect(second.color.getHexString()).toBe("d3a35f");
  expect(second.roughness).toBe(0.36);
  expect(second.metalness).toBe(0.74);
  expect(second.bumpScale).toBe(1.5);
  expect(second.side).toBe(DoubleSide);
  expect(input.map.flipY).toBe(false);
  expect(input.roughnessMap.name).toBe("caller-owned-roughness");
  first.dispose();
  second.dispose();
  expect(disposed).toBe(0);
  input.dispose();
});

it("keeps option values in uniforms rather than fragmenting equivalent program keys", () => {
  const input = textures();
  const first = factory()(input, {
    sharpness: 2,
    flipV: false,
    roughness: 0.2,
    metalness: 0.1,
    bumpScale: 0.5,
  });
  const second = factory()(input, {
    sharpness: 9,
    flipV: true,
    roughness: 0.9,
    metalness: 0.8,
    bumpScale: 2,
  });
  const withoutMetalness = factory()(textures(false));

  expect(first.customProgramCacheKey()).toBe(second.customProgramCacheKey());
  expect(withoutMetalness.customProgramCacheKey()).not.toBe(first.customProgramCacheKey());
  first.dispose();
  second.dispose();
  withoutMetalness.dispose();
  input.dispose();
});

it("binds default uniforms while replacing the real standard material sampling chunks", () => {
  const input = textures();
  const material = factory()(input);
  const shader = actualStandardShader();
  material.onBeforeCompile(shader as never, webgl2Renderer as never);

  expect(shader.uniforms.strataTriMap?.value).toBe(input.map);
  expect(shader.uniforms.strataTriRoughness?.value).toBe(input.roughnessMap);
  expect(shader.uniforms.strataTriBump?.value).toBe(input.bumpMap);
  expect(shader.uniforms.strataTriMetalness?.value).toBe(input.metalnessMap);
  expect(shader.uniforms.strataTriSharpness?.value).toBe(4);
  expect(shader.uniforms.strataTriFlipV?.value).toBe(1);
  expect(shader.vertexShader).toContain("vStrataFieldPosition");
  expect(shader.fragmentShader).toContain("vStrataFieldPosition.zy");
  expect(shader.fragmentShader).toContain("vStrataFieldPosition.xz");
  expect(shader.fragmentShader).toContain("vStrataFieldPosition.xy");
  expect(shader.fragmentShader).toContain("perturbNormalArb");
  for (const anchor of [
    "#include <map_fragment>",
    "#include <roughnessmap_fragment>",
    "#include <metalnessmap_fragment>",
    "#include <normal_fragment_maps>",
  ])
    expect(shader.fragmentShader).not.toContain(anchor);
  material.dispose();
  input.dispose();
});

it("keeps the scalar metalness factor when no optional metalness map is supplied", () => {
  const input = textures(false);
  const material = factory()(input, { metalness: 0.37 });
  const shader = actualStandardShader();
  material.onBeforeCompile(shader as never, webgl2Renderer as never);

  expect(material.metalnessMap).toBeNull();
  expect(shader.uniforms.strataTriMetalness).toBeUndefined();
  expect(shader.fragmentShader).toContain("float metalnessFactor = metalness;");
  expect(shader.fragmentShader).not.toContain("strataTriMetalness");
  material.dispose();
  input.dispose();
});

it("refuses to compile through a non-WebGL renderer before mutating shader state", () => {
  const input = textures();
  const material = factory()(input);
  const shader = actualStandardShader();
  const vertexBefore = shader.vertexShader,
    fragmentBefore = shader.fragmentShader;
  expect(() =>
    material.onBeforeCompile(shader as never, { isWebGLRenderer: false } as never),
  ).toThrow();
  expect(shader.vertexShader).toBe(vertexBefore);
  expect(shader.fragmentShader).toBe(fragmentBefore);
  expect(shader.uniforms).toEqual({});
  material.dispose();
  input.dispose();
});

it("requires EXT_sRGB when compiling an sRGB triplanar map on WebGL1", () => {
  const input = textures();
  const material = factory()(input);
  const shader = actualStandardShader();
  const vertexBefore = shader.vertexShader,
    fragmentBefore = shader.fragmentShader;
  const webgl1WithoutSrgb = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    extensions: { has: () => false },
  };

  expect(() => material.onBeforeCompile(shader as never, webgl1WithoutSrgb as never)).toThrow();
  expect(shader.vertexShader).toBe(vertexBefore);
  expect(shader.fragmentShader).toBe(fragmentBefore);
  expect(shader.uniforms).toEqual({});

  const supportedShader = actualStandardShader();
  material.onBeforeCompile(
    supportedShader as never,
    {
      ...webgl1WithoutSrgb,
      extensions: { has: (name: string) => name === "EXT_sRGB" },
    } as never,
  );
  expect(supportedShader.uniforms.strataTriMap?.value).toBe(input.map);
  material.dispose();
  input.dispose();
});

it("copies an affine field transform into independent field and normal uniforms", () => {
  const fieldTransform = new Matrix4().set(2, 0, 0, 3, 0, 3, 0, 4, 0, 0, 4, 5, 0, 0, 0, 1);
  const input = textures();
  const material = factory()(input, { fieldTransform });
  const shader = actualStandardShader();
  material.onBeforeCompile(shader as never, webgl2Renderer as never);
  fieldTransform.makeScale(99, 99, 99);

  const values = Object.values(shader.uniforms).map(({ value }) => value);
  const inverse = values.filter((value): value is Matrix4 => value instanceof Matrix4);
  const normal = values.filter((value): value is Matrix3 => value instanceof Matrix3);
  expect(inverse).toHaveLength(1);
  expect(normal).toHaveLength(1);
  const expectedField = new Matrix4().set(2, 0, 0, 3, 0, 3, 0, 4, 0, 0, 4, 5, 0, 0, 0, 1);
  const expectedNormal = new Matrix3().getNormalMatrix(
    new Matrix4().set(2, 0, 0, 3, 0, 3, 0, 4, 0, 0, 4, 5, 0, 0, 0, 1),
  );
  expect(matrixValues(inverse[0]!)).toEqual(matrixValues(expectedField));
  expect(matrixValues(normal[0]!)).toEqual(matrixValues(expectedNormal));
  material.dispose();
  input.dispose();
});

it("keeps a large finite field scale with a finite inverse-transpose normal matrix", () => {
  const fieldTransform = new Matrix4().makeScale(1e30, 1e30, 1e30);
  const input = textures();
  const material = factory()(input, { fieldTransform });
  const shader = actualStandardShader();
  material.onBeforeCompile(shader as never, webgl2Renderer as never);

  const field = shader.uniforms.strataFieldTransform?.value as Matrix4;
  const normal = shader.uniforms.strataFieldNormalTransform?.value as Matrix3;
  expect(matrixValues(field).every(Number.isFinite)).toBe(true);
  expect(matrixValues(normal).every(Number.isFinite)).toBe(true);
  expect(matrixValues(normal)).toEqual(matrixValues(new Matrix3().getNormalMatrix(fieldTransform)));
  material.dispose();
  input.dispose();
});

it("fails before mutating a real standard shader when any required include anchor is absent", () => {
  const input = textures();
  const material = factory()(input);
  const anchors = [
    ["vertexShader", "#include <common>"],
    ["vertexShader", "#include <begin_vertex>"],
    ["fragmentShader", "#include <common>"],
    ["fragmentShader", "#include <map_fragment>"],
    ["fragmentShader", "#include <roughnessmap_fragment>"],
    ["fragmentShader", "#include <metalnessmap_fragment>"],
    ["fragmentShader", "#include <normal_fragment_maps>"],
  ] as const;
  for (const [part, anchor] of anchors) {
    const shader = actualStandardShader();
    shader[part] = shader[part].replace(anchor, "");
    const vertexBefore = shader.vertexShader,
      fragmentBefore = shader.fragmentShader;
    shader.uniforms.preserved = { value: "untouched" };
    expect(() => material.onBeforeCompile(shader as never, webgl2Renderer as never)).toThrow();
    expect(shader.vertexShader).toBe(vertexBefore);
    expect(shader.fragmentShader).toBe(fragmentBefore);
    expect(shader.uniforms).toEqual({ preserved: { value: "untouched" } });
  }
  material.dispose();
  input.dispose();
});

it("validates the public scalar, boolean, and affine transform inputs", () => {
  const input = textures();
  const brokenAffine = new Matrix4();
  brokenAffine.elements[3] = 0.25;
  const singular = new Matrix4().makeScale(0, 1, 1);
  const quantizedSingular = new Matrix4().makeScale(1e-46, 1, 1);
  for (const options of [
    { sharpness: 0 },
    { sharpness: Number.NaN },
    { flipV: "true" },
    { roughness: -0.01 },
    { roughness: 1.01 },
    { metalness: -0.01 },
    { metalness: 1.01 },
    { bumpScale: Number.POSITIVE_INFINITY },
    { fieldTransform: brokenAffine },
    { fieldTransform: singular },
    { fieldTransform: quantizedSingular },
  ]) {
    expect(() => factory()(input, options as Options)).toThrow();
  }
  input.dispose();
});

it("rejects overridden, render-target, malformed, and unloaded map data", () => {
  const invalid = [
    (input: Textures) => {
      input.map.colorSpace = NoColorSpace;
    },
    (input: Textures) => {
      input.map.internalFormat = "RGBA8";
    },
    (input: Textures) => {
      (input.map as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture = true;
    },
    (input: Textures) => {
      (input.map.image as { data: Uint8Array }).data = new Uint8Array(3);
    },
    (input: Textures) => {
      (input.map.image as { complete?: boolean }).complete = false;
    },
  ];
  for (const configure of invalid) {
    const input = textures();
    configure(input);
    expect(() => factory()(input)).toThrow();
    input.dispose();
  }
});
