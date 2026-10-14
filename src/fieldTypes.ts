import type { ScalarFieldSample } from "./surfaceFields.js";

/** A deterministic scalar sampler in caller-declared XZ coordinates. */
export type ScalarField2D = (x: number, z: number) => number;
/** A constant scalar or deterministic coordinate sampler. */
export type ScalarField2DInput = number | ScalarField2D;
/** A value and derivative sampled in a caller-declared scalar coordinate. */
export type ScalarProfileSampler = (coordinate: number) => ScalarFieldSample;
