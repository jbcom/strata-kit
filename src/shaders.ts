export { applyShaderPatches, replaceOrThrow } from "./shaderPatches.js";

/** GLSL 3D value-noise helpers parameterized by an explicit seed scalar. */
export const seededSurfaceNoiseGlsl = /* glsl */ `
float strataKitHash(vec3 point, float seed) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7)) + seed * 19.19) * 43758.5453123);
}
float strataKitNoise(vec3 point, float seed) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = strataKitHash(cell, seed);
  float b = strataKitHash(cell + vec3(1.0, 0.0, 0.0), seed);
  float c = strataKitHash(cell + vec3(0.0, 1.0, 0.0), seed);
  float d = strataKitHash(cell + vec3(1.0, 1.0, 0.0), seed);
  float e = strataKitHash(cell + vec3(0.0, 0.0, 1.0), seed);
  float f = strataKitHash(cell + vec3(1.0, 0.0, 1.0), seed);
  float g = strataKitHash(cell + vec3(0.0, 1.0, 1.0), seed);
  float h = strataKitHash(cell + vec3(1.0, 1.0, 1.0), seed);
  float lower = mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  float upper = mix(mix(e, f, local.x), mix(g, h, local.x), local.y);
  return mix(lower, upper, local.z);
}
`;
