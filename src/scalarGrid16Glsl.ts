/** Numeric RG8 decode and sample-index interpolation; allocation and world mapping are external. */
export const scalarGrid16Glsl = /* glsl */ `
float strataDecodeScalar16(vec2 rg) {
  return (rg.r * 65280.0 + rg.g * 255.0) / 65535.0;
}

float strataSampleScalarGrid16(
  sampler2D data, ivec2 size, vec2 sampleIndex, float minimum, float range
) {
  vec2 index = clamp(sampleIndex, vec2(0.0), vec2(size - 1));
  ivec2 first = min(ivec2(floor(index)), max(ivec2(0), size - 2));
  ivec2 last = min(first + 1, size - 1);
  vec2 weight = index - vec2(first);
  float a = strataDecodeScalar16(texelFetch(data, first, 0).rg);
  float b = strataDecodeScalar16(texelFetch(data, ivec2(last.x, first.y), 0).rg);
  float c = strataDecodeScalar16(texelFetch(data, ivec2(first.x, last.y), 0).rg);
  float d = strataDecodeScalar16(texelFetch(data, last, 0).rg);
  float normalized = mix(mix(a, b, weight.x), mix(c, d, weight.x), weight.y);
  return minimum + normalized * range;
}
`;
