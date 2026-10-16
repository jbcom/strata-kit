/** Integer-v1 paired stochastic sampling; see docs/THIRD_PARTY_NOTICES.md. */
export const hexTilingGlsl = /* glsl */ `
#ifndef STRATA_HEX_TILING_INTEGER_V1_INCLUDED
#define STRATA_HEX_TILING_INTEGER_V1_INCLUDED

struct StrataHexConfig {
  uint seedKey;
  float tileScale;
  float rotationStrength;
  float offsetScale;
  float luminanceInfluence;
  float gainExponent;
  int normalChannels;
  float inputNormalYSign;
};
struct StrataHexResult {
  vec4 surface;
  vec2 normalXY;
  vec3 weights;
};
struct StrataHexPlan {
  vec2 uv;
  vec2 dx;
  vec2 dy;
  vec2 cs;
};

uint strataHexHash(ivec2 cell, uint key, uint domain) {
  uint h = key ^ (uint(cell.x) * 374761393u)
    ^ (domain * 668265263u) ^ (uint(cell.y) * 2147483647u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return h ^ (h >> 16u);
}
float strataHexUnit(ivec2 cell, uint key, uint domain) {
  return float(strataHexHash(cell, key, domain) & 0x00ffffffu) / 16777216.0;
}
vec2 strataHexRotate(vec2 row, vec2 cs) {
  return vec2(row.x * cs.x - row.y * cs.y,
              row.x * cs.y + row.y * cs.x);
}
vec2 strataHexTransportNormal(vec2 decoded, vec2 cs) {
  return vec2(cs.x * decoded.x + cs.y * decoded.y,
              -cs.y * decoded.x + cs.x * decoded.y);
}
float strataHexGain(float x, float exponent) {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  if (x == 0.5) return 0.5;
  if (x < 0.5) return 0.5 * pow(2.0 * x, exponent);
  return 1.0 - 0.5 * pow(2.0 * (1.0 - x), exponent);
}

void strataHexPlans(vec2 uv, vec2 dx, vec2 dy, StrataHexConfig cfg,
                    out StrataHexPlan plans[3], out vec3 base) {
  vec2 t = uv / cfg.tileScale;
  vec2 grid = vec2(3.464101552963257 * t.x - 2.0 * t.y, 4.0 * t.y);
  ivec2 anchor = ivec2(floor(grid));
  vec2 local = grid - vec2(anchor);
  float residual = (1.0 - local.x) - local.y;
  ivec2 cells[3];
  if (residual > 0.0) {
    cells[0] = anchor;
    cells[1] = anchor + ivec2(0, 1);
    cells[2] = anchor + ivec2(1, 0);
    base = vec3(residual, local.y, local.x);
  } else {
    cells[0] = anchor + ivec2(1, 1);
    cells[1] = anchor + ivec2(1, 0);
    cells[2] = anchor + ivec2(0, 1);
    base = vec3(-residual, 1.0 - local.y, 1.0 - local.x);
  }
  base /= (base.x + base.y) + base.z;
  float amplitude = cfg.tileScale * cfg.offsetScale;
  for (int i = 0; i < 3; i++) {
    ivec2 cell = cells[i];
    float hu = strataHexUnit(cell, cfg.seedKey, 0u);
    float hv = strataHexUnit(cell, cfg.seedKey, 1u);
    float hr = strataHexUnit(cell, cfg.seedKey, 2u);
    float theta = (hr * 6.2831854820251465 - 3.1415927410125732)
      * cfg.rotationStrength;
    vec2 cs = vec2(cos(theta), sin(theta));
    vec2 centre = vec2(
      ((float(cell.x) + 0.5 * float(cell.y)) * 0.28867512941360474) * cfg.tileScale,
      (0.25 * float(cell.y)) * cfg.tileScale);
    vec2 rotated = strataHexRotate(uv - centre, cs);
    plans[i].uv = (rotated + centre) + vec2(hu * amplitude, hv * amplitude);
    // Derivatives already measure texture UV per pixel: only rotate them.
    plans[i].dx = strataHexRotate(dx, cs);
    plans[i].dy = strataHexRotate(dy, cs);
    plans[i].cs = cs;
  }
}

StrataHexResult strataHexBlend(vec4 surfaces[3], vec4 normals[3],
                               StrataHexPlan plans[3], vec3 base,
                               StrataHexConfig cfg) {
  vec3 gains;
  vec2 transported[3];
  for (int i = 0; i < 3; i++) {
    vec4 color = surfaces[i];
    vec4 encoded = normals[i];
    float ny = cfg.normalChannels == 0 ? encoded.g : encoded.a;
    vec2 decoded = vec2(2.0 * encoded.r - 1.0,
      (2.0 * ny - 1.0) * cfg.inputNormalYSign);
    transported[i] = strataHexTransportNormal(decoded, plans[i].cs);
    float luminance = (color.r * 0.29899999499320984
      + color.g * 0.5870000123977661) + color.b * 0.11400000005960464;
    float factor = (1.0 - cfg.luminanceInfluence)
      + (2.0 * cfg.luminanceInfluence) * luminance;
    gains[i] = strataHexGain(base[i] * factor, cfg.gainExponent);
  }
  float sum = (gains.x + gains.y) + gains.z;
  vec3 weights = sum > 0.0 ? gains / sum : base;
  StrataHexResult result;
  result.weights = weights;
  result.surface = (surfaces[0] * weights.x + surfaces[1] * weights.y)
    + surfaces[2] * weights.z;
  result.normalXY = (transported[0] * weights.x + transported[1] * weights.y)
    + transported[2] * weights.z;
  return result;
}

StrataHexResult strataSampleHex2D(sampler2D surfaceSampler, sampler2D normalSampler,
                                vec2 uv, vec2 dx, vec2 dy, StrataHexConfig cfg) {
  StrataHexPlan plans[3];
  vec3 base;
  strataHexPlans(uv, dx, dy, cfg, plans, base);
  vec4 surfaces[3];
  vec4 normals[3];
  for (int i = 0; i < 3; i++) {
    surfaces[i] = textureGrad(surfaceSampler, plans[i].uv, plans[i].dx, plans[i].dy);
    normals[i] = textureGrad(normalSampler, plans[i].uv, plans[i].dx, plans[i].dy);
  }
  return strataHexBlend(surfaces, normals, plans, base, cfg);
}
StrataHexResult strataSampleHexArray(sampler2DArray surfaceSampler,
                                   sampler2DArray normalSampler, int layer,
                                   vec2 uv, vec2 dx, vec2 dy, StrataHexConfig cfg) {
  StrataHexPlan plans[3];
  vec3 base;
  strataHexPlans(uv, dx, dy, cfg, plans, base);
  vec4 surfaces[3];
  vec4 normals[3];
  for (int i = 0; i < 3; i++) {
    vec3 at = vec3(plans[i].uv, float(layer));
    surfaces[i] = textureGrad(surfaceSampler, at, plans[i].dx, plans[i].dy);
    normals[i] = textureGrad(normalSampler, at, plans[i].dx, plans[i].dy);
  }
  return strataHexBlend(surfaces, normals, plans, base, cfg);
}
#endif
`;
