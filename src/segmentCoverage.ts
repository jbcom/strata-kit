/** Renderer-neutral finite-segment geometry and analytic scalar band coverage. */

import { requireFiniteNumber } from "./validation.js";

/** A nearest-point sample of a finite segment in caller-defined 2D coordinates. */
export interface SegmentSample2D {
  /** Fresh coordinate tuple; a clamped sample copies the supplied endpoint exactly. */
  nearest: readonly [number, number];
  /** Unit direction from start to end, or exactly [0, 0] for coincident endpoints. */
  tangent: readonly [number, number];
  /** Clamped segment fraction in [0, 1]. */
  t: number;
  /** Nonnegative Euclidean distance from the point to nearest. */
  distance: number;
  /** Nonnegative segment length in the caller's coordinate unit. */
  length: number;
  /** Clamped distance along the segment, equal to t * length. */
  along: number;
}

/** Separate edge smoothing and width attenuation for an unsigned-distance band. */
export interface BandCoverageSample {
  /** Maximum of the requested half-width and half of the full pixel footprint. */
  effectiveHalfWidth: number;
  /** Reversed cubic smoothstep across the effective band's edge. */
  edgeCoverage: number;
  /** Requested half-width / effectiveHalfWidth, or zero when both are zero. */
  widthCoverage: number;
  /** Product of edgeCoverage and widthCoverage, in [0, 1]. */
  coverage: number;
}

function copyTuple(
  operation: string,
  name: string,
  tuple: readonly [number, number],
): [number, number] {
  if (!Array.isArray(tuple) || tuple.length !== 2) {
    throw new Error(`${operation}: ${name} must be a tuple of exactly two finite numbers`);
  }
  const x = tuple[0];
  const y = tuple[1];
  requireFiniteNumber(operation, `${name}[0]`, x);
  requireFiniteNumber(operation, `${name}[1]`, y);
  return [x, y];
}

function finite(operation: string, name: string, value: number): number {
  requireFiniteNumber(operation, name, value);
  return value;
}

/** Normalize using scaled components, including when the magnitude is subnormal. */
function unitDirection(x: number, y: number): [number, number] {
  const scale = Math.max(Math.abs(x), Math.abs(y));
  if (scale === 0) return [0, 0];
  const scaledX = x / scale;
  const scaledY = y / scale;
  const scaledLength = Math.hypot(scaledX, scaledY);
  return [scaledX / scaledLength, scaledY / scaledLength];
}

/**
 * Samples the nearest point on a finite segment without squaring its length.
 *
 * Inputs must be arrays of exactly two finite numbers in the same coordinate space and unit.
 * Every input is copied and neither inputs nor outputs are cached. Projection is clamped before
 * division by length, so arbitrarily short nonzero segments retain their direction; there is no
 * epsilon length threshold. The unit tangent uses scaled components even for subnormal lengths.
 * Coincident endpoints produce a fresh copy of start, tangent [0, 0], and zero t, length and along.
 * A point exactly equal to a supplied endpoint returns that endpoint exactly with t zero or one,
 * preserving endpoint identity without an epsilon comparison or projection roundoff.
 *
 * The calculation uses JavaScript floating-point arithmetic. Finite inputs whose differences,
 * length, projection, nearest point or point distance cannot be represented finitely throw;
 * this function does not rescale the caller's coordinate system or promise exact predicates.
 */
export function sampleSegment2D(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): SegmentSample2D {
  const operation = "sampleSegment2D";
  const [px, py] = copyTuple(operation, "point", point);
  const [sx, sy] = copyTuple(operation, "start", start);
  const [ex, ey] = copyTuple(operation, "end", end);
  const dx = finite(operation, "end[0] - start[0]", ex - sx);
  const dy = finite(operation, "end[1] - start[1]", ey - sy);
  const length = finite(operation, "length", Math.hypot(dx, dy));
  const offsetX = finite(operation, "point[0] - start[0]", px - sx);
  const offsetY = finite(operation, "point[1] - start[1]", py - sy);

  if (length === 0) {
    const distance = finite(operation, "distance", Math.hypot(offsetX, offsetY));
    return { nearest: [sx, sy], tangent: [0, 0], t: 0, distance, length: 0, along: 0 };
  }

  const tangent = unitDirection(dx, dy);
  if (px === sx && py === sy) {
    return { nearest: [sx, sy], tangent, t: 0, distance: 0, length, along: 0 };
  }
  if (px === ex && py === ey) {
    return { nearest: [ex, ey], tangent, t: 1, distance: 0, length, along: length };
  }
  const projection = finite(operation, "projection", offsetX * tangent[0] + offsetY * tangent[1]);
  const clampedProjection = Math.max(0, Math.min(length, projection));
  const t = finite(operation, "t", clampedProjection / length);
  const nearest: [number, number] =
    clampedProjection === 0
      ? [sx, sy]
      : clampedProjection === length
        ? [ex, ey]
        : [
            finite(operation, "nearest[0]", sx + t * dx),
            finite(operation, "nearest[1]", sy + t * dy),
          ];
  const distanceX = finite(operation, "point[0] - nearest[0]", px - nearest[0]);
  const distanceY = finite(operation, "point[1] - nearest[1]", py - nearest[1]);
  const distance = finite(operation, "distance", Math.hypot(distanceX, distanceY));
  const along = finite(operation, "along", t * length);
  return { nearest, tangent, t, distance, length, along };
}

/**
 * Projects a full one-pixel parallelogram onto a normalized caller-supplied direction.
 *
 * perPixelX and perPixelY are caller-computed coordinate changes per screen pixel, in the same
 * space and unit. The returned full width is abs(dot(unitDirection, perPixelX)) plus
 * abs(dot(unitDirection, perPixelY)). Direction magnitude does not affect the result.
 * Exactly zero direction uses the larger diagonal length of that parallelogram as a conservative
 * diameter, including sheared pixels. Exactly zero derivatives return zero. No derivative,
 * projection, coordinate mapping or screen resolution is inferred here.
 *
 * Inputs must be arrays of exactly two finite numbers. Unrepresentable intermediate projections,
 * diagonal differences/sums or resulting widths throw instead of returning infinity or NaN.
 */
export function projectPixelFootprint2D(
  direction: readonly [number, number],
  perPixelX: readonly [number, number],
  perPixelY: readonly [number, number],
): number {
  const operation = "projectPixelFootprint2D";
  const [nx, ny] = copyTuple(operation, "direction", direction);
  const [xx, xy] = copyTuple(operation, "perPixelX", perPixelX);
  const [yx, yy] = copyTuple(operation, "perPixelY", perPixelY);
  if (nx === 0 && ny === 0) {
    const plusX = finite(operation, "perPixelX[0] + perPixelY[0]", xx + yx);
    const plusY = finite(operation, "perPixelX[1] + perPixelY[1]", xy + yy);
    const minusX = finite(operation, "perPixelX[0] - perPixelY[0]", xx - yx);
    const minusY = finite(operation, "perPixelX[1] - perPixelY[1]", xy - yy);
    return finite(
      operation,
      "footprint",
      Math.max(Math.hypot(plusX, plusY), Math.hypot(minusX, minusY)),
    );
  }
  const [ux, uy] = unitDirection(nx, ny);
  const projectedX = finite(operation, "projected perPixelX", ux * xx + uy * xy);
  const projectedY = finite(operation, "projected perPixelY", ux * yx + uy * yy);
  return finite(operation, "footprint", Math.abs(projectedX) + Math.abs(projectedY));
}

/**
 * Samples analytic coverage for a band at a nonnegative unsigned distance.
 *
 * All arguments must be finite and nonnegative, in one caller-defined length unit. footprint is
 * a full projected pixel width. The effective half-width is max(halfWidth, footprint / 2), and
 * the edge transition radius is max(feather, footprint / 2). The edge uses reversed cubic
 * smoothstep; width attenuation preserves a shrinking band's contribution without a visibility
 * floor. This is a local analytic filter, not exact area integration or a compositing policy.
 *
 * With zero feather and footprint, the edge is exactly 1 inside, 0.5 on, and 0 outside the edge.
 * Exactly zero requested half-width always yields zero total coverage, including at the centre.
 * A zero effective half-width has zero widthCoverage. There is no hidden epsilon or minimum width.
 */
export function sampleBandCoverage(
  distance: number,
  halfWidth: number,
  feather: number,
  footprint = 0,
): BandCoverageSample {
  const operation = "sampleBandCoverage";
  for (const [name, value] of [
    ["distance", distance],
    ["halfWidth", halfWidth],
    ["feather", feather],
    ["footprint", footprint],
  ] as const) {
    requireFiniteNumber(operation, name, value);
    if (value < 0) throw new Error(`${operation}: ${name} must be nonnegative`);
  }
  const effectiveHalfWidth = Math.max(halfWidth, footprint / 2);
  const edgeRadius = Math.max(feather, footprint / 2);
  const widthCoverage = effectiveHalfWidth > 0 ? halfWidth / effectiveHalfWidth : 0;
  const delta = distance - effectiveHalfWidth;
  let edgeCoverage: number;
  if (edgeRadius === 0) {
    edgeCoverage = delta < 0 ? 1 : delta === 0 ? 0.5 : 0;
  } else if (delta <= -edgeRadius) {
    edgeCoverage = 1;
  } else if (delta >= edgeRadius) {
    edgeCoverage = 0;
  } else {
    const x = 0.5 + 0.5 * (delta / edgeRadius);
    edgeCoverage = 1 - x * x * (3 - 2 * x);
  }
  return {
    effectiveHalfWidth,
    edgeCoverage,
    widthCoverage,
    coverage: edgeCoverage * widthCoverage,
  };
}
