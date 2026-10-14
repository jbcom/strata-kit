import {
  BackSide,
  type ColorRepresentation,
  DoubleSide,
  FrontSide,
  LinearSRGBColorSpace,
  LinearFilter,
  Matrix3,
  Matrix4,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  ShaderChunk,
  type Side,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from "three";
import * as ThreePeer from "three";
import { applyShaderPatches } from "./shaderPatches.js";

/** The color replacement declares values consumed by later scalar/bump replacements. */
function requireStandardFragmentLayout(source: string): void {
  const map = "#include <map_fragment>";
  // Missing/duplicate literals retain the existing exact-occurrence patch errors.
  if (source.split(map).length === 2) {
    for (const name of ["roughnessmap_fragment", "metalnessmap_fragment", "normal_fragment_maps"]) {
      const anchor = `#include <${name}>`;
      if (source.split(anchor).length === 2 && source.indexOf(anchor) < source.indexOf(map))
        fail(`fragment shader requires map_fragment before ${name}`);
    }
  }
  for (const [chunk, factor, uniform] of [
    ["roughnessmap_fragment", "roughnessFactor", "roughness"],
    ["metalnessmap_fragment", "metalnessFactor", "metalness"],
  ] as const) {
    const declaration = new RegExp(`\\bfloat\\s+${factor}\\s*=\\s*${uniform}\\s*;`, "g");
    if ((ShaderChunk[chunk].match(declaration) ?? []).length !== 1)
      fail(`unsupported native ${chunk} factor declaration`);
  }
}

/** Precomputed RGBA8 maps owned and disposed separately by the caller. */
export interface ThreeTriplanarTextures {
  map: Texture;
  roughnessMap: Texture;
  bumpMap: Texture;
  metalnessMap?: Texture;
}

/** Explicit geometry-local sampling domain and standard material settings. */
export interface ThreeTriplanarMaterialOptions {
  /** Copied affine geometry-local-to-field transform. Defaults to identity. */
  fieldTransform?: Matrix4;
  /** Positive normal-blend exponent. Defaults to 4. */
  sharpness?: number;
  /** Convert sampler v-down to texture t-up. Defaults to true. */
  flipV?: boolean;
  color?: ColorRepresentation;
  roughness?: number;
  metalness?: number;
  /** Scale of encoded unit-interval height, as in Three's bumpScale. */
  bumpScale?: number;
  side?: Side;
}

function fail(message: string): never {
  throw new Error(`Three triplanar material: ${message}`);
}

function float(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    fail(`${name} must be finite and representable as Float32`);
  }
  return value;
}

function unit(value: number, name: string): number {
  float(value, name);
  if (value < 0 || value > 1) fail(`${name} must be between 0 and 1`);
  return value;
}

// r152 WebGL1 uploads replace the color texture's format in place. Later
// peers do not export this format; never accept its numeric value alone.
function legacySrgb(value: Texture): boolean {
  const format = (ThreePeer as unknown as { _SRGBAFormat?: number })._SRGBAFormat;
  return typeof format === "number" && value.format === format;
}

function texture(value: Texture, name: string, color: boolean): void {
  if (!value?.isTexture) fail(`${name} must be a Texture`);
  if (
    value.offset.x !== 0 ||
    value.offset.y !== 0 ||
    value.repeat.x !== 1 ||
    value.repeat.y !== 1 ||
    value.center.x !== 0 ||
    value.center.y !== 0 ||
    value.rotation !== 0 ||
    value.matrix.elements.some((coefficient, index) => coefficient !== (index % 4 === 0 ? 1 : 0))
  ) {
    fail(`${name} must have identity texture transforms; use fieldTransform`);
  }
  const flags = value as Texture & {
    isCubeTexture?: boolean;
    isData3DTexture?: boolean;
    isDataArrayTexture?: boolean;
    isVideoTexture?: boolean;
    isCompressedTexture?: boolean;
    isRenderTargetTexture?: boolean;
  };
  if (
    flags.isCubeTexture ||
    flags.isData3DTexture ||
    flags.isDataArrayTexture ||
    flags.isVideoTexture ||
    flags.isCompressedTexture ||
    flags.isRenderTargetTexture ||
    value.internalFormat !== null ||
    (value.format !== RGBAFormat &&
      !(
        color &&
        legacySrgb(value) &&
        value.colorSpace === SRGBColorSpace &&
        value.minFilter === LinearFilter &&
        value.generateMipmaps === false
      )) ||
    value.type !== UnsignedByteType ||
    value.premultiplyAlpha
  ) {
    fail(`${name} must be a non-premultiplied RGBA8 2D texture`);
  }
  const image = value.image as { width?: number; height?: number } | null;
  const width = image?.width;
  const height = image?.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 4_194_304
  ) {
    fail(`${name} must have ready bounded dimensions`);
  }
  const source = image as { data?: unknown; complete?: boolean; naturalWidth?: number };
  if (
    (source.data !== undefined &&
      (!(source.data instanceof Uint8Array) || source.data.length !== width * height * 4)) ||
    source.complete === false ||
    source.naturalWidth === 0
  ) {
    fail(`${name} must contain ready RGBA8 image data`);
  }
  if (
    color
      ? value.colorSpace !== SRGBColorSpace && value.colorSpace !== LinearSRGBColorSpace
      : value.colorSpace !== NoColorSpace
  ) {
    fail(`${name} has incompatible colorSpace`);
  }
}

const VERTEX = /* glsl */ `
uniform mat4 strataFieldTransform;
uniform mat3 strataFieldNormalTransform;
varying vec3 vStrataFieldPosition;
varying vec3 vStrataFieldNormal;
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D strataTriMap;
uniform sampler2D strataTriRoughness;
uniform sampler2D strataTriBump;
uniform float strataTriSharpness;
uniform float strataTriFlipV;
varying vec3 vStrataFieldPosition;
varying vec3 vStrataFieldNormal;

vec2 strataTriUv(vec2 p) {
  return vec2(p.x, mix(p.y, 1.0 - p.y, strataTriFlipV));
}
vec3 strataTriWeights(vec3 n) {
  vec3 a = abs(n);
  float dominant = max(max(a.x, a.y), a.z);
  if (dominant == 0.0) return vec3(0.0);
  vec3 w = pow(a / dominant, vec3(strataTriSharpness));
  return w / (w.x + w.y + w.z);
}
vec3 strataTriCoverage(vec3 w, vec2 x, vec2 y, vec2 z) {
  vec3 a = vec3(texture2D(strataTriMap, x).a,
    texture2D(strataTriMap, y).a, texture2D(strataTriMap, z).a) * w;
  float total = a.x + a.y + a.z;
  if (total == 0.0) return vec3(0.0);
  return a / total;
}
float strataTriHeight(vec3 w, vec2 x, vec2 y, vec2 z) {
  vec3 covered = strataTriCoverage(w, x, y, z);
  // Uncovered samples have zero signed bump: neutral encoded height is 0.5.
  if (covered.x + covered.y + covered.z == 0.0) return 0.5;
  return dot(covered, vec3(texture2D(strataTriBump, x).r,
    texture2D(strataTriBump, y).r, texture2D(strataTriBump, z).r));
}
`;

const COLOR = /* glsl */ `
vec3 strataW = strataTriWeights(vStrataFieldNormal);
vec2 strataX = strataTriUv(vStrataFieldPosition.zy);
vec2 strataY = strataTriUv(vStrataFieldPosition.xz);
vec2 strataZ = strataTriUv(vStrataFieldPosition.xy);
// Texture upload decodes sRGB; do not decode a second time here.
vec4 strataCx = texture2D(strataTriMap, strataX);
vec4 strataCy = texture2D(strataTriMap, strataY);
vec4 strataCz = texture2D(strataTriMap, strataZ);
vec3 strataAlphaWeights = strataW * vec3(strataCx.a, strataCy.a, strataCz.a);
float strataAlpha = strataAlphaWeights.x + strataAlphaWeights.y + strataAlphaWeights.z;
vec3 strataCovered = vec3(0.0);
if (strataAlpha > 0.0) strataCovered = strataAlphaWeights / strataAlpha;
diffuseColor *= vec4(strataCx.rgb * strataCovered.x + strataCy.rgb * strataCovered.y
  + strataCz.rgb * strataCovered.z, strataAlpha);
`;

const ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
roughnessFactor *= dot(strataCovered, vec3(texture2D(strataTriRoughness, strataX).g,
  texture2D(strataTriRoughness, strataY).g, texture2D(strataTriRoughness, strataZ).g));
`;

const METALNESS = /* glsl */ `
metalnessFactor *= dot(strataCovered, vec3(texture2D(strataTriMetalness, strataX).b,
  texture2D(strataTriMetalness, strataY).b, texture2D(strataTriMetalness, strataZ).b));
`;

const BUMP = /* glsl */ `
#ifdef USE_BUMPMAP
  float strataH = strataTriHeight(strataW, strataX, strataY, strataZ);
  float strataHx = strataTriHeight(strataW, strataX + dFdx(strataX),
    strataY + dFdx(strataY), strataZ + dFdx(strataZ));
  float strataHy = strataTriHeight(strataW, strataX + dFdy(strataX),
    strataY + dFdy(strataY), strataZ + dFdy(strataZ));
  // The native helper and bumpScale retain each supported peer's side convention.
  normal = perturbNormalArb(-vViewPosition, normal,
    vec2(strataHx - strataH, strataHy - strataH) * bumpScale, faceDirection);
#endif
`;

/**
 * Creates an owned static-geometry WebGL material using caller-owned baked maps.
 * Coordinates project on (z,y), (x,z), (x,y); coverage weights blend linear color
 * and scalar channels. Requires valid nonzero geometry normals. No geometry or
 * texture is changed by this factory; dispose textures separately.
 * WebGL1 sRGB sampling requires EXT_sRGB. Cloning/serialization does not retain
 * the compile hook: call this factory again for another configured material.
 */
export function createThreeTriplanarMaterial(
  textures: ThreeTriplanarTextures,
  options: ThreeTriplanarMaterialOptions = {},
): MeshStandardMaterial {
  if (
    !textures ||
    typeof textures !== "object" ||
    Array.isArray(textures) ||
    !options ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    fail("textures and options must be objects");
  }
  // Capture bindings, never the mutable caller descriptor or texture ownership.
  textures = {
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    bumpMap: textures.bumpMap,
    metalnessMap: textures.metalnessMap,
  };
  texture(textures.map, "map", true);
  texture(textures.roughnessMap, "roughnessMap", false);
  texture(textures.bumpMap, "bumpMap", false);
  if (textures.metalnessMap !== undefined) texture(textures.metalnessMap, "metalnessMap", false);
  const sharpness = float(options.sharpness ?? 4, "sharpness");
  if (Math.fround(sharpness) <= 0) fail("sharpness must be positive");
  const roughness = unit(options.roughness ?? 1, "roughness");
  const metalness = unit(options.metalness ?? 0, "metalness");
  const bumpScale = float(options.bumpScale ?? 1, "bumpScale");
  const flipV = options.flipV ?? true;
  if (typeof flipV !== "boolean") fail("flipV must be boolean");
  const side = options.side ?? FrontSide;
  if (![FrontSide, BackSide, DoubleSide].includes(side)) fail("side is invalid");
  const input = options.fieldTransform ?? new Matrix4();
  if (!(input as Matrix4 & { isMatrix4?: boolean })?.isMatrix4 || input.elements.length !== 16) {
    fail("fieldTransform must be a Matrix4");
  }
  for (const value of input.elements) float(value, "fieldTransform coefficient");
  const matrix = new Matrix4().fromArray(input.elements);
  const e = matrix.elements;
  if (e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1) fail("fieldTransform must be affine");
  const quantized = new Matrix4().fromArray(e.map(Math.fround));
  if (matrix.determinant() === 0 || quantized.determinant() === 0)
    fail("fieldTransform must be invertible in Float32");
  const normal = new Matrix3().getNormalMatrix(matrix);
  for (const value of normal.elements) float(value, "field normal coefficient");
  if (new Matrix3().fromArray(normal.elements.map(Math.fround)).determinant() === 0) {
    fail("field normal transform must be invertible in Float32");
  }
  const material = new MeshStandardMaterial({
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    bumpMap: textures.bumpMap,
    metalnessMap: textures.metalnessMap ?? null,
    color: options.color ?? "#ffffff",
    roughness,
    metalness,
    bumpScale,
    side,
  });
  const hasMetalness = textures.metalnessMap !== undefined;
  material.customProgramCacheKey = () =>
    `strata-procedural:triplanar:1:metalness=${hasMetalness ? 1 : 0}`;
  material.onBeforeCompile = (shader, renderer) => {
    if (!(renderer as typeof renderer & { isWebGLRenderer?: boolean })?.isWebGLRenderer) {
      fail("requires WebGLRenderer");
    }
    if (legacySrgb(textures.map) && renderer.capabilities.isWebGL2) {
      fail("legacy sRGB texture uploads require WebGL1 with EXT_sRGB");
    }
    if (
      !renderer.capabilities.isWebGL2 &&
      textures.map.colorSpace === SRGBColorSpace &&
      !renderer.extensions.has("EXT_sRGB")
    )
      fail("WebGL1 sRGB textures require EXT_sRGB");
    requireStandardFragmentLayout(shader.fragmentShader);
    const vertexShader = applyShaderPatches(shader.vertexShader, [
      { anchor: "#include <common>", replacement: `#include <common>\n${VERTEX}` },
      {
        anchor: "#include <begin_vertex>",
        replacement:
          "#include <begin_vertex>\nvStrataFieldPosition = (strataFieldTransform * vec4(position, 1.0)).xyz;\nvStrataFieldNormal = strataFieldNormalTransform * normal;",
      },
    ]);
    const fragmentShader = applyShaderPatches(shader.fragmentShader, [
      {
        anchor: "#include <common>",
        replacement: `#include <common>\n${FRAGMENT}\n${hasMetalness ? "uniform sampler2D strataTriMetalness;" : ""}`,
      },
      { anchor: "#include <map_fragment>", replacement: COLOR },
      { anchor: "#include <roughnessmap_fragment>", replacement: ROUGHNESS },
      {
        anchor: "#include <metalnessmap_fragment>",
        replacement: `float metalnessFactor = metalness;\n${hasMetalness ? METALNESS : ""}`,
      },
      { anchor: "#include <normal_fragment_maps>", replacement: BUMP },
    ]);
    const uniforms = {
      strataFieldTransform: { value: matrix.clone() },
      strataFieldNormalTransform: { value: normal.clone() },
      strataTriMap: { value: textures.map },
      strataTriRoughness: { value: textures.roughnessMap },
      strataTriBump: { value: textures.bumpMap },
      strataTriSharpness: { value: sharpness },
      strataTriFlipV: { value: flipV ? 1 : 0 },
      ...(hasMetalness ? { strataTriMetalness: { value: textures.metalnessMap } } : {}),
    };
    shader.vertexShader = vertexShader;
    shader.fragmentShader = fragmentShader;
    Object.assign(shader.uniforms, uniforms);
  };
  return material;
}
