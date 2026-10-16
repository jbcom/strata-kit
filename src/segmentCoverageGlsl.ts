/**
 * GLSL ES 3.00 counterparts of the renderer-neutral segment and band kernels.
 * Use highp floats and local coordinates. Inputs and intermediate differences,
 * lengths, projections and sums must remain finite normal Float32 values or zero;
 * subnormal preservation and bit identity with Float64 CPU arithmetic are not
 * promised. No derivatives are taken here: evaluate them in uniform control flow
 * before passing the two coordinate displacements per pixel to the footprint
 * helper. The caller chooses its projection direction and candidate segments.
 */
export const segmentCoverageGlsl = /* glsl */ `
struct StrataSegmentSample2D {
  vec2 nearest;
  vec2 tangent;
  float t;
  float distance;
  float length;
  float along;
};

struct StrataBandCoverageSample {
  float effectiveHalfWidth;
  float edgeCoverage;
  float widthCoverage;
  float coverage;
};

float strataSegmentCoverageHypot2(vec2 value) {
  float scale = max(abs(value.x), abs(value.y));
  if (scale == 0.0) return 0.0;
  return scale * length(value / scale);
}

vec2 strataSegmentCoverageUnit2(vec2 value) {
  float scale = max(abs(value.x), abs(value.y));
  if (scale == 0.0) return vec2(0.0);
  vec2 scaled = value / scale;
  return scaled / length(scaled);
}

StrataSegmentSample2D strataSampleSegment2D(vec2 point, vec2 start, vec2 end) {
  vec2 delta = end - start;
  float segmentLength = strataSegmentCoverageHypot2(delta);
  if (segmentLength == 0.0) {
    return StrataSegmentSample2D(
      start, vec2(0.0), 0.0,
      strataSegmentCoverageHypot2(point - start), 0.0, 0.0
    );
  }
  vec2 tangent = strataSegmentCoverageUnit2(delta);
  float t;
  if (all(equal(point, start))) {
    t = 0.0;
  } else if (all(equal(point, end))) {
    t = 1.0;
  } else {
    float projection = dot(point - start, tangent);
    t = projection <= 0.0 ? 0.0
      : projection >= segmentLength ? 1.0 : projection / segmentLength;
  }
  vec2 nearest = t == 0.0 ? start : t == 1.0 ? end : start + t * delta;
  return StrataSegmentSample2D(
    nearest, tangent, t, strataSegmentCoverageHypot2(point - nearest),
    segmentLength, t * segmentLength
  );
}

float strataProjectPixelFootprint2D(
  vec2 direction, vec2 perPixelX, vec2 perPixelY
) {
  if (max(abs(direction.x), abs(direction.y)) == 0.0) {
    return max(
      strataSegmentCoverageHypot2(perPixelX + perPixelY),
      strataSegmentCoverageHypot2(perPixelX - perPixelY)
    );
  }
  vec2 axis = strataSegmentCoverageUnit2(direction);
  return abs(dot(axis, perPixelX)) + abs(dot(axis, perPixelY));
}

StrataBandCoverageSample strataSampleBandCoverage(
  float distance, float halfWidth, float feather, float footprint
) {
  float halfPixel = footprint * 0.5;
  float effectiveHalfWidth = max(halfWidth, halfPixel);
  float edgeWidth = max(feather, halfPixel);
  float widthCoverage = effectiveHalfWidth > 0.0
    ? halfWidth / effectiveHalfWidth : 0.0;
  float delta = distance - effectiveHalfWidth;
  float edgeCoverage;
  if (edgeWidth == 0.0) {
    edgeCoverage = delta < 0.0 ? 1.0 : delta > 0.0 ? 0.0 : 0.5;
  } else if (delta <= -edgeWidth) {
    edgeCoverage = 1.0;
  } else if (delta >= edgeWidth) {
    edgeCoverage = 0.0;
  } else {
    float x = 0.5 + 0.5 * (delta / edgeWidth);
    edgeCoverage = 1.0 - x * x * (3.0 - 2.0 * x);
  }
  return StrataBandCoverageSample(
    effectiveHalfWidth, edgeCoverage, widthCoverage, edgeCoverage * widthCoverage
  );
}
`;
