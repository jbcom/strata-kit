import type { ScalarProfileSampler } from './fieldTypes.js';
import type { ScalarFieldSample } from './surfaceFields.js';
import { requireFiniteNumber } from './validation.js';

function requireCoordinate(operation: string, coordinate: number): void {
  requireFiniteNumber(operation, 'coordinate', coordinate);
  if (Math.abs(coordinate) >= 2 ** 52) {
    throw new Error(`${operation}: coordinate magnitude must be less than 2**52`);
  }
}

/**
 * Creates a unit-period asymmetric ridge with a sinusoidal-power rise and cubic fall.
 * Derivatives are value per cycle. The periodic joins are C1 for risePower > 1;
 * curvature is not continuous at the wrap when 1 < risePower < 2.
 * Options are captured by value; the sampler has no mutable sampling state.
 */
export function createPeriodicRidgeProfile(options: {
  crest: number;
  risePower: number;
}): ScalarProfileSampler {
  const operation = 'createPeriodicRidgeProfile';
  if (typeof options !== 'object' || options === null) {
    throw new Error(`${operation}: options must contain crest and risePower`);
  }
  const { crest, risePower } = options;
  requireFiniteNumber(operation, 'crest', crest);
  requireFiniteNumber(operation, 'risePower', risePower);
  if (crest <= 0 || crest >= 1) {
    throw new Error(`${operation}: crest must be strictly between 0 and 1`);
  }
  if (risePower <= 1) throw new Error(`${operation}: risePower must be greater than 1`);
  const fallSpan = 1 - crest;
  requireFiniteNumber(operation, 'rise segment reciprocal', 1 / crest);
  requireFiniteNumber(operation, 'fall segment reciprocal', 1 / fallSpan);

  return (coordinate) => {
    requireCoordinate(operation, coordinate);
    const phase = coordinate - Math.floor(coordinate);
    if (phase === 0 || phase === 1) return { value: 0, derivative: 0 };
    if (phase === crest) return { value: 1, derivative: 0 };
    let value: number;
    let derivative: number;
    if (phase < crest) {
      const s = phase / crest;
      const angle = (s * Math.PI) / 2;
      const sine = Math.sin(angle);
      value = sine ** risePower;
      const poweredSlope = risePower * sine ** (risePower - 1);
      requireFiniteNumber(operation, 'rise powered slope', poweredSlope);
      const angularSlope = poweredSlope * Math.cos(angle) * Math.PI;
      requireFiniteNumber(operation, 'rise angular slope', angularSlope);
      derivative = angularSlope / (2 * crest);
    } else {
      const s = (phase - crest) / fallSpan;
      value = 1 - s * s * (3 - 2 * s);
      derivative = (-6 * s * (1 - s)) / fallSpan;
    }
    requireFiniteNumber(operation, 'value', value);
    requireFiniteNumber(operation, 'derivative', derivative);
    return { value, derivative };
  };
}

/** Samples cosine and its analytic derivative in cycles, without reducing its argument. */
export function sampleCosineProfile(coordinate: number): ScalarFieldSample {
  const operation = 'sampleCosineProfile';
  requireCoordinate(operation, coordinate);
  const angle = coordinate * Math.PI * 2;
  requireFiniteNumber(operation, 'angle', angle);
  const value = Math.cos(angle);
  const derivative = -Math.sin(angle) * Math.PI * 2;
  requireFiniteNumber(operation, 'value', value);
  requireFiniteNumber(operation, 'derivative', derivative);
  return { value, derivative };
}
