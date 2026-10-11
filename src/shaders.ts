/** GLSL chunks are scoped to the material that opts into them. */
export const seededSurfaceNoiseGlsl = `
float strataKitHash(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float strataKitNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = strataKitHash(cell);
  float b = strataKitHash(cell + vec3(1.0, 0.0, 0.0));
  float c = strataKitHash(cell + vec3(0.0, 1.0, 0.0));
  float d = strataKitHash(cell + vec3(1.0, 1.0, 0.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}
`;
