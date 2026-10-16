/** Renderer-neutral scalar profiles and differential relief frames. */

import type { Vec3 } from './sdf.js';
export { createPeriodicRidgeProfile, sampleCosineProfile } from './periodicProfiles.js';
export type { ScalarProfileSampler } from './fieldTypes.js';
export { createMonotoneCubicProfile, sampleMonotoneCubicProfile } from './monotoneProfiles.js';
export type { MonotoneCubicProfile, MonotoneCubicProfilePoint } from './monotoneProfiles.js';
import { requireFiniteNumber, requireFiniteVector3 } from './validation.js';

/** The maximum knot count accepted by the bounded GLSL evaluator. */
export const MAX_CUBIC_HERMITE_PROFILE_KNOTS = 8;

/** A scalar value and its derivative with respect to the caller's coordinate. */
export interface ScalarFieldSample {
  /** Scalar value in the caller's declared unit, such as metres. */
  value: number;
  /** Change in {@link value} per one unit of the caller's coordinate. */
  derivative: number;
}

/** One C1-continuous cubic-Hermite knot in caller-defined coordinate and value units. */
export interface CubicHermiteProfileKnot extends ScalarFieldSample {
  /** Strictly increasing caller-defined coordinate. */
  coordinate: number;
}

/** A validated, immutable piecewise cubic scalar profile. */
export interface CubicHermiteProfile {
  readonly knots: readonly CubicHermiteProfileKnot[];
}

/** Fixed-size data suitable for the matching GLSL uniform arrays. */
export interface CubicHermiteProfileUniforms {
  readonly coordinates: Float32Array;
  readonly values: Float32Array;
  readonly derivatives: Float32Array;
  readonly knotCount: number;
}

/** Surface Jacobian columns in one caller-selected evaluation space. */
export interface SurfaceDifferentials {
  /** dP/du: position change per one u-coordinate unit. */
  du: Vec3;
  /** dP/dv: position change per one v-coordinate unit. */
  dv: Vec3;
}

/** Height derivatives expressed in the same u/v coordinates as {@link SurfaceDifferentials}. */
export interface ReliefDerivatives {
  /** dH/du in evaluation-space length per u-coordinate unit. */
  du: number;
  /** dH/dv in evaluation-space length per v-coordinate unit. */
  dv: number;
}

/** Derivatives of a caller-owned scalar projection q(u, v). */
export interface ScalarCoordinateDerivatives {
  /** dq/du in the caller's surface coordinates. */
  du: number;
  /** dq/dv in the caller's surface coordinates. */
  dv: number;
}

/** A scalar profile's height and its chain-rule derivatives over a surface. */
export interface ProjectedReliefSample {
  /** Height in the scalar profile's declared value unit. */
  height: number;
  /** Height derivatives over the caller's surface coordinates. */
  derivatives: ReliefDerivatives;
}

/** An orthonormal first-order shading frame for local scalar relief. */
export interface ReliefFrame {
  tangent: Vec3;
  bitangent: Vec3;
  normal: Vec3;
}

function requireKnot(operation: string, knot: CubicHermiteProfileKnot, index: number): void {
  requireFiniteNumber(operation, `knots[${index}].coordinate`, knot.coordinate);
  requireFiniteNumber(operation, `knots[${index}].value`, knot.value);
  requireFiniteNumber(operation, `knots[${index}].derivative`, knot.derivative);
}

/**
 * Validates a C1 piecewise cubic profile.
 *
 * The evaluator clamps outside the endpoint range. Endpoint derivatives must therefore be zero,
 * so the clamped result remains C1-continuous at both ends.
 */
export function createCubicHermiteProfile(
  inputKnots: readonly CubicHermiteProfileKnot[]
): CubicHermiteProfile {
  if (inputKnots.length < 2 || inputKnots.length > MAX_CUBIC_HERMITE_PROFILE_KNOTS) {
    throw new Error(
      `createCubicHermiteProfile: knots must contain 2 to ${MAX_CUBIC_HERMITE_PROFILE_KNOTS} entries`
    );
  }
  const knots = inputKnots.map((knot, index) => {
    requireKnot('createCubicHermiteProfile', knot, index);
    if (index > 0 && knot.coordinate <= inputKnots[index - 1].coordinate) {
      throw new Error('createCubicHermiteProfile: knot coordinates must be strictly increasing');
    }
    return { coordinate: knot.coordinate, value: knot.value, derivative: knot.derivative };
  });
  if (knots[0].derivative !== 0 || knots.at(-1)?.derivative !== 0) {
    throw new Error(
      'createCubicHermiteProfile: endpoint derivatives must be zero for clamped C1 continuity'
    );
  }
  const ownedKnots = Object.freeze(knots.map((knot) => Object.freeze(knot)));
  return Object.freeze({ knots: ownedKnots });
}

function sampleSegment(
  left: CubicHermiteProfileKnot,
  right: CubicHermiteProfileKnot,
  coordinate: number
): ScalarFieldSample {
  const span = right.coordinate - left.coordinate;
  const t = (coordinate - left.coordinate) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  const value =
    (2 * t3 - 3 * t2 + 1) * left.value +
    (t3 - 2 * t2 + t) * span * left.derivative +
    (-2 * t3 + 3 * t2) * right.value +
    (t3 - t2) * span * right.derivative;
  const derivative =
    ((6 * t2 - 6 * t) * left.value) / span +
    (3 * t2 - 4 * t + 1) * left.derivative +
    ((-6 * t2 + 6 * t) * right.value) / span +
    (3 * t2 - 2 * t) * right.derivative;
  return { value, derivative };
}

/** Samples a clamped C1 cubic profile and its analytic derivative without texture lookup. */
export function sampleCubicHermiteProfile(
  profile: CubicHermiteProfile,
  coordinate: number
): ScalarFieldSample {
  requireFiniteNumber('sampleCubicHermiteProfile', 'coordinate', coordinate);
  const { knots } = profile;
  if (coordinate <= knots[0].coordinate) return { value: knots[0].value, derivative: 0 };
  const finalKnot = knots.at(-1);
  if (!finalKnot) throw new Error('sampleCubicHermiteProfile: profile must contain knots');
  if (coordinate >= finalKnot.coordinate) return { value: finalKnot.value, derivative: 0 };
  for (let index = 0; index < knots.length - 1; index += 1) {
    if (coordinate <= knots[index + 1].coordinate) {
      return sampleSegment(knots[index], knots[index + 1], coordinate);
    }
  }
  throw new Error('sampleCubicHermiteProfile: no profile segment found');
}

/**
 * Applies the chain rule from a caller-owned scalar projection q(u, v) to a sampled profile.
 *
 * This module never chooses q: it can be a UV, rest-position projection, atlas coordinate, or
 * another consumer-defined scalar field. The returned derivatives have the profile's height unit
 * per surface-coordinate unit, ready for {@link deriveReliefFrame}.
 */
export function projectScalarProfileDerivative(
  sample: ScalarFieldSample,
  coordinateDerivatives: ScalarCoordinateDerivatives
): ProjectedReliefSample {
  requireFiniteNumber('projectScalarProfileDerivative', 'sample.value', sample.value);
  requireFiniteNumber('projectScalarProfileDerivative', 'sample.derivative', sample.derivative);
  requireFiniteNumber(
    'projectScalarProfileDerivative',
    'coordinateDerivatives.du',
    coordinateDerivatives.du
  );
  requireFiniteNumber(
    'projectScalarProfileDerivative',
    'coordinateDerivatives.dv',
    coordinateDerivatives.dv
  );
  return {
    height: sample.value,
    derivatives: {
      du: sample.derivative * coordinateDerivatives.du,
      dv: sample.derivative * coordinateDerivatives.dv,
    },
  };
}

/** Packs a profile into the exact fixed-width arrays consumed by {@link surfaceFieldsGlsl}. */
export function toCubicHermiteProfileUniforms(
  profile: CubicHermiteProfile
): CubicHermiteProfileUniforms {
  const coordinates = new Float32Array(MAX_CUBIC_HERMITE_PROFILE_KNOTS);
  const values = new Float32Array(MAX_CUBIC_HERMITE_PROFILE_KNOTS);
  const derivatives = new Float32Array(MAX_CUBIC_HERMITE_PROFILE_KNOTS);
  const last = profile.knots.at(-1);
  if (!last) throw new Error('toCubicHermiteProfileUniforms: profile must contain knots');
  for (let index = 0; index < MAX_CUBIC_HERMITE_PROFILE_KNOTS; index += 1) {
    const knot = profile.knots[index] ?? last;
    coordinates[index] = knot.coordinate;
    values[index] = knot.value;
    derivatives[index] = knot.derivative;
  }
  return { coordinates, values, derivatives, knotCount: profile.knots.length };
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function add(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale(vector: Vec3, amount: number): Vec3 {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function normalize(operation: string, vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error(`${operation}: surface differentials must span a finite non-zero area`);
  }
  return scale(vector, 1 / length);
}

/**
 * Builds an orthonormal first-order relief frame using the caller's surface Jacobian.
 *
 * It uses dP + N * dH, the local bump/relief approximation. It does not model H * dN, so it is
 * not the exact tangent frame of P + HN on curved geometry and must not be used to claim a
 * physically displaced-surface normal. Consumers that displace curved geometry need their own
 * curvature-aware differential path.
 *
 * Every input and the returned frame live in the same evaluation space. A caller may use rest
 * object space, posed space, or world space, but must pass dP/du and dP/dv for that exact space.
 * For skinned or otherwise non-affine deformation, a global normal matrix is insufficient: supply
 * the local posed Jacobian. This function intentionally does not sample an atlas, project anatomy,
 * skin a point, or compose a normal map; consumers retain those policies and use this frame there.
 */
export function deriveReliefFrame(
  differentials: SurfaceDifferentials,
  derivatives: ReliefDerivatives
): ReliefFrame {
  requireFiniteVector3('deriveReliefFrame', 'differentials.du', differentials.du);
  requireFiniteVector3('deriveReliefFrame', 'differentials.dv', differentials.dv);
  requireFiniteNumber('deriveReliefFrame', 'derivatives.du', derivatives.du);
  requireFiniteNumber('deriveReliefFrame', 'derivatives.dv', derivatives.dv);

  const baseNormal = normalize('deriveReliefFrame', cross(differentials.du, differentials.dv));
  const reliefDu = add(differentials.du, scale(baseNormal, derivatives.du));
  const reliefDv = add(differentials.dv, scale(baseNormal, derivatives.dv));
  const normal = normalize('deriveReliefFrame', cross(reliefDu, reliefDv));
  const tangent = normalize('deriveReliefFrame', reliefDu);
  return { tangent, bitangent: normalize('deriveReliefFrame', cross(normal, tangent)), normal };
}

/**
 * GLSL ES 3.00 implementation paired with this module's profile packer and first-order relief-frame oracle.
 * `coordinate` is unitless or caller-defined; values use caller-defined height units, and the
 * derivative is height units per coordinate unit. `dPdu`, `dPdv`, and the result share one space.
 * Its relief frame uses dP + N * dH and intentionally omits H * dN on curved surfaces.
 */
export const surfaceFieldsGlsl = /* glsl */ `
const int STRATA_KIT_MAX_PROFILE_KNOTS = 8;

vec2 strataKitCubicHermiteSegment(
  float coordinate,
  float leftCoordinate,
  float leftValue,
  float leftDerivative,
  float rightCoordinate,
  float rightValue,
  float rightDerivative
) {
  float span = rightCoordinate - leftCoordinate;
  float t = (coordinate - leftCoordinate) / span;
  float t2 = t * t;
  float t3 = t2 * t;
  float value =
    (2.0 * t3 - 3.0 * t2 + 1.0) * leftValue +
    (t3 - 2.0 * t2 + t) * span * leftDerivative +
    (-2.0 * t3 + 3.0 * t2) * rightValue +
    (t3 - t2) * span * rightDerivative;
  float derivative =
    ((6.0 * t2 - 6.0 * t) * leftValue) / span +
    (3.0 * t2 - 4.0 * t + 1.0) * leftDerivative +
    ((-6.0 * t2 + 6.0 * t) * rightValue) / span +
    (3.0 * t2 - 2.0 * t) * rightDerivative;
  return vec2(value, derivative);
}

vec2 strataKitSampleCubicHermiteProfile(
  float coordinate,
  float coordinates[STRATA_KIT_MAX_PROFILE_KNOTS],
  float values[STRATA_KIT_MAX_PROFILE_KNOTS],
  float derivatives[STRATA_KIT_MAX_PROFILE_KNOTS],
  int knotCount
) {
  if (coordinate <= coordinates[0]) return vec2(values[0], 0.0);
  if (coordinate >= coordinates[knotCount - 1]) return vec2(values[knotCount - 1], 0.0);
  int segment = 0;
  for (int index = 0; index < STRATA_KIT_MAX_PROFILE_KNOTS - 1; index += 1) {
    if (index + 1 < knotCount && coordinate <= coordinates[index + 1]) {
      segment = index;
      break;
    }
  }
  return strataKitCubicHermiteSegment(
    coordinate,
    coordinates[segment], values[segment], derivatives[segment],
    coordinates[segment + 1], values[segment + 1], derivatives[segment + 1]
  );
}

// Returns height, dH/du, dH/dv after the caller supplies dq/du and dq/dv.
vec3 strataKitProjectProfileDerivative(vec2 profileSample, vec2 coordinateDerivatives) {
  return vec3(
    profileSample.x,
    profileSample.y * coordinateDerivatives.x,
    profileSample.y * coordinateDerivatives.y
  );
}

mat3 strataKitDeriveReliefFrame(vec3 dPdu, vec3 dPdv, vec2 dH) {
  vec3 baseNormal = normalize(cross(dPdu, dPdv));
  vec3 reliefDu = dPdu + baseNormal * dH.x;
  vec3 reliefDv = dPdv + baseNormal * dH.y;
  vec3 normal = normalize(cross(reliefDu, reliefDv));
  vec3 tangent = normalize(reliefDu);
  vec3 bitangent = normalize(cross(normal, tangent));
  return mat3(tangent, bitangent, normal);
}
`;
