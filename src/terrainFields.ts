import type { ScalarField2D, ScalarField2DInput, ScalarProfileSampler } from "./fieldTypes.js";
import { requireFiniteNumber } from "./validation.js";

export type { ScalarField2D, ScalarField2DInput } from "./fieldTypes.js";

/** Ordered arithmetic; blend weights must remain within zero and one. */
export type ScalarField2DLayer =
  | { operation: "add"; field: ScalarField2DInput; gain?: number }
  | { operation: "multiply"; field: ScalarField2DInput }
  | { operation: "blend"; field: ScalarField2DInput; weight: ScalarField2DInput };

export interface DirectionalField2DOptions {
  direction: readonly [number, number];
  wavelength: number;
  profile: ScalarProfileSampler;
  /** Ordered length offsets, applied before division by wavelength. */
  displacement?: readonly ScalarField2DInput[];
  /** Cycle offset, applied after division by wavelength. */
  phase?: ScalarField2DInput;
}

export interface SmoothMask2DOptions {
  shape:
    | { kind: "radial"; center: readonly [number, number] }
    | {
        kind: "box-max";
        center: readonly [number, number];
        halfExtents: readonly [number, number];
      };
  /** Distinct increasing or decreasing transition edges. */
  edges: readonly [number, number];
}

function pair(operation: string, name: string, input: readonly [number, number]): [number, number] {
  if (!Array.isArray(input) || input.length !== 2)
    throw new Error(`${operation}: ${name} must contain two finite numbers`);
  requireFiniteNumber(operation, `${name}[0]`, input[0]);
  requireFiniteNumber(operation, `${name}[1]`, input[1]);
  return [input[0], input[1]];
}

function inputField(operation: string, name: string, input: ScalarField2DInput): ScalarField2D {
  if (typeof input === "number") {
    requireFiniteNumber(operation, name, input);
    return () => input;
  }
  if (typeof input !== "function")
    throw new Error(`${operation}: ${name} must be a number or function`);
  return (x, z) => {
    const value = input(x, z);
    requireFiniteNumber(operation, `${name} sample`, value);
    return value;
  };
}

function coordinates(operation: string, x: number, z: number): void {
  requireFiniteNumber(operation, "x", x);
  requireFiniteNumber(operation, "z", z);
}

/** Copies a bounded ordered recipe; callbacks remain caller-owned pure samplers. */
export function composeScalarField2D(
  base: ScalarField2DInput,
  layers: readonly ScalarField2DLayer[],
): ScalarField2D {
  const operation = "composeScalarField2D";
  const initial = inputField(operation, "base", base);
  if (!Array.isArray(layers) || layers.length > 64)
    throw new Error(`${operation}: layers must be an array of at most 64 entries`);
  const owned = Array.from(layers, (layer, index) => {
    if (!layer || typeof layer !== "object")
      throw new Error(`${operation}: layer ${index} is invalid`);
    const field = inputField(operation, `layers[${index}].field`, layer.field);
    if (layer.operation === "add") {
      const gain = layer.gain === undefined ? 1 : layer.gain;
      requireFiniteNumber(operation, `layers[${index}].gain`, gain);
      return (value: number, x: number, z: number) => value + field(x, z) * gain;
    }
    if (layer.operation === "multiply")
      return (value: number, x: number, z: number) => value * field(x, z);
    if (layer.operation === "blend") {
      const weightField = inputField(operation, `layers[${index}].weight`, layer.weight);
      return (value: number, x: number, z: number) => {
        const target = field(x, z);
        const weight = weightField(x, z);
        if (weight < 0 || weight > 1)
          throw new Error(`${operation}: blend weight must be between 0 and 1`);
        return value * (1 - weight) + target * weight;
      };
    }
    throw new Error(`${operation}: layer ${index} has an unknown operation`);
  });
  return (x, z) => {
    coordinates(operation, x, z);
    let value = initial(x, z);
    for (let index = 0; index < owned.length; index += 1) {
      value = owned[index](value, x, z);
      requireFiniteNumber(operation, `layer ${index} result`, value);
    }
    return value;
  };
}

/** Applies diagonal scale then translation without changing the source sampler. */
export function transformScalarField2D(
  field: ScalarField2D,
  options: { scale?: readonly [number, number]; offset?: readonly [number, number] } = {},
): ScalarField2D {
  const operation = "transformScalarField2D";
  if (typeof field !== "function") throw new Error(`${operation}: field must be a function`);
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new Error(`${operation}: options must be an object`);
  const [sx, sz] = pair(operation, "scale", options.scale === undefined ? [1, 1] : options.scale);
  const [ox, oz] = pair(
    operation,
    "offset",
    options.offset === undefined ? [0, 0] : options.offset,
  );
  const sample = inputField(operation, "field", field);
  return (x, z) => {
    coordinates(operation, x, z);
    const px = x * sx + ox;
    const pz = z * sz + oz;
    coordinates(operation, px, pz);
    return sample(px, pz);
  };
}

/** Samples a profile along a copied unit direction, with ordered domain displacement. */
export function createDirectionalField2D(options: DirectionalField2DOptions): ScalarField2D {
  const operation = "createDirectionalField2D";
  if (!options || typeof options !== "object")
    throw new Error(`${operation}: options must be an object`);
  const [dx, dz] = pair(operation, "direction", options.direction);
  if (Math.abs(Math.hypot(dx, dz) - 1) > 1e-12)
    throw new Error(`${operation}: direction must have unit length`);
  const wavelength = options.wavelength;
  requireFiniteNumber(operation, "wavelength", wavelength);
  if (wavelength <= 0) throw new Error(`${operation}: wavelength must be positive`);
  const profile = options.profile;
  if (typeof profile !== "function") throw new Error(`${operation}: profile must be a function`);
  const displacement = options.displacement === undefined ? [] : options.displacement;
  if (!Array.isArray(displacement) || displacement.length > 32)
    throw new Error(`${operation}: displacement must contain at most 32 entries`);
  const owned = Array.from(displacement, (field, index) =>
    inputField(operation, `displacement[${index}]`, field),
  );
  const phase = inputField(operation, "phase", options.phase === undefined ? 0 : options.phase);
  return (x, z) => {
    coordinates(operation, x, z);
    let coordinate = x * dx + z * dz;
    requireFiniteNumber(operation, "projection", coordinate);
    for (const field of owned) {
      coordinate += field(x, z);
      requireFiniteNumber(operation, "displaced coordinate", coordinate);
    }
    coordinate = coordinate / wavelength + phase(x, z);
    requireFiniteNumber(operation, "profile coordinate", coordinate);
    const sample = profile(coordinate);
    if (!sample || typeof sample !== "object")
      throw new Error(`${operation}: profile must return a scalar sample`);
    requireFiniteNumber(operation, "profile value", sample.value);
    requireFiniteNumber(operation, "profile derivative", sample.derivative);
    return sample.value;
  };
}

/** Smooth radial or box-max contour mask; box-max is not Euclidean signed distance. */
export function createSmoothMask2D(options: SmoothMask2DOptions): ScalarField2D {
  const operation = "createSmoothMask2D";
  if (!options || typeof options !== "object")
    throw new Error(`${operation}: options must be an object`);
  const shape = options.shape;
  if (!shape || (shape.kind !== "radial" && shape.kind !== "box-max"))
    throw new Error(`${operation}: shape must be radial or box-max`);
  const kind = shape.kind;
  const [cx, cz] = pair(operation, "center", shape.center);
  const [start, end] = pair(operation, "edges", options.edges);
  const span = end - start;
  requireFiniteNumber(operation, "edge span", span);
  if (span === 0) throw new Error(`${operation}: edges must be distinct`);
  const [hx, hz] =
    shape.kind === "box-max" ? pair(operation, "halfExtents", shape.halfExtents) : [0, 0];
  if (kind === "box-max" && (hx <= 0 || hz <= 0))
    throw new Error(`${operation}: halfExtents must be positive`);
  return (x, z) => {
    coordinates(operation, x, z);
    const px = x - cx;
    const pz = z - cz;
    coordinates(operation, px, pz);
    const contour =
      kind === "radial" ? Math.hypot(px, pz) : Math.max(Math.abs(px) - hx, Math.abs(pz) - hz);
    requireFiniteNumber(operation, "contour", contour);
    const ratio = (contour - start) / span;
    requireFiniteNumber(operation, "transition coordinate", ratio);
    const t = Math.min(1, Math.max(0, ratio));
    return t * t * (3 - 2 * t);
  };
}
