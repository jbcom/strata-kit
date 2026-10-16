/** Complete two-nearest lattice search with caller-owned cell appearance. */
import { type Seed, seedToUint32 } from "./noise.js";
import { sampleSeededLattice } from "./noiseLattice.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

/** Pure integer-cell placement; both normalized offsets include the endpoints. */
export type LatticeSiteSampler2D = (ix: number, iz: number) => readonly [number, number];

export type JitteredCellField2DOptions = (
  | { seed: Seed; site?: never }
  | { site: LatticeSiteSampler2D; seed?: never }
) & { cellSize?: number; jitter?: number };

export interface CellSite2D {
  ix: number;
  iz: number;
  distance: number;
}

/** Fresh mutable records; identities describe lattice cells, not unique positions. */
export interface JitteredCellSample2D {
  nearest: CellSite2D;
  runnerUp: CellSite2D;
  gap: number;
}

const OPERATION = "createJitteredCellField2D";

function normalizedCoordinate(name: string, value: number, cellSize: number): number {
  requireFiniteNumber(OPERATION, name, value);
  const normalized = value / cellSize;
  requireFiniteNumber(OPERATION, `normalized ${name}`, normalized);
  if (Math.abs(normalized) >= 2 ** 52)
    throw new Error(`${OPERATION}: normalized ${name} magnitude must be below 2**52`);
  if (value !== 0 && normalized === 0)
    throw new Error(`${OPERATION}: normalized ${name} must not underflow to zero`);
  return normalized;
}

function unitOffset(name: string, value: number): number {
  requireFiniteNumber(OPERATION, name, value);
  if (value < 0 || value > 1) throw new Error(`${OPERATION}: ${name} must be in [0,1]`);
  return value;
}

/**
 * Fixed 25-site complete search for jitter in [0,1]. Rank normalized Euclidean
 * distances, break exact ties by (iz,ix), then scale distances into caller units.
 * The returned difference is an unsigned indicator, not a Voronoi distance field.
 * Callbacks are borrowed and must be deterministic and independent of call order.
 */
export function createJitteredCellField2D(
  options: JitteredCellField2DOptions,
): (x: number, z: number) => JitteredCellSample2D {
  if (!options || typeof options !== "object")
    throw new Error(`${OPERATION}: options must be a non-null object`);
  const hasSeed = Object.hasOwn(options, "seed");
  const hasSite = Object.hasOwn(options, "site");
  if (hasSeed === hasSite) throw new Error(`${OPERATION}: supply exactly one of seed or site`);
  const { cellSize = 1, jitter = 1 } = options;
  requirePositiveFiniteNumber(OPERATION, "cellSize", cellSize);
  unitOffset("jitter", jitter);
  let site: LatticeSiteSampler2D | undefined;
  let key = 0;
  if (hasSeed) key = seedToUint32(options.seed as Seed);
  else {
    site = options.site;
    if (typeof site !== "function") throw new Error(`${OPERATION}: site must be callable`);
  }
  const inset = (1 - jitter) / 2;
  return (x, z) => {
    // Validate both coordinates before borrowing any placement callback.
    const qx = normalizedCoordinate("x", x, cellSize);
    const qz = normalizedCoordinate("z", z, cellSize);
    const homeX = Math.floor(qx),
      homeZ = Math.floor(qz);
    // Floor fractions erase a tiny negative displacement: -1e-20 - (-1) === 1.
    // Nearest-integer anchors keep both local residuals within half a cell.
    const anchorX = Math.round(qx),
      anchorZ = Math.round(qz);
    const residualX = qx - anchorX,
      residualZ = qz - anchorZ;
    let firstDistance = Infinity,
      secondDistance = Infinity;
    let firstX = 0,
      firstZ = 0,
      secondX = 0,
      secondZ = 0;
    // Row-major traversal plus strict comparisons preserves lexicographic ties.
    for (let iz = homeZ - 2; iz <= homeZ + 2; iz++) {
      for (let ix = homeX - 2; ix <= homeX + 2; ix++) {
        let u: number, v: number;
        if (site) {
          let pair: readonly [number, number];
          try {
            pair = site(ix, iz);
          } catch (cause) {
            throw new Error(`${OPERATION}: site callback failed`, { cause });
          }
          if (!Array.isArray(pair) || pair.length !== 2)
            throw new Error(`${OPERATION}: site must return a two-number array`);
          const [first, second] = pair;
          u = unitOffset("site[0]", first);
          v = unitOffset("site[1]", second);
        } else {
          u = (sampleSeededLattice(key, ix, 0, iz) + 1) / 2;
          v = (sampleSeededLattice(key, ix, 1, iz) + 1) / 2;
        }
        const dx = ix - anchorX + (inset + jitter * u) - residualX;
        const dz = iz - anchorZ + (inset + jitter * v) - residualZ;
        const distance = Math.hypot(dx, dz);
        if (distance < firstDistance) {
          secondDistance = firstDistance;
          secondX = firstX;
          secondZ = firstZ;
          firstDistance = distance;
          firstX = ix;
          firstZ = iz;
        } else if (distance < secondDistance) {
          secondDistance = distance;
          secondX = ix;
          secondZ = iz;
        }
      }
    }
    const nearest = { ix: firstX, iz: firstZ, distance: firstDistance * cellSize };
    const runnerUp = { ix: secondX, iz: secondZ, distance: secondDistance * cellSize };
    const gap = runnerUp.distance - nearest.distance;
    requireFiniteNumber(OPERATION, "nearest distance", nearest.distance);
    requireFiniteNumber(OPERATION, "runner-up distance", runnerUp.distance);
    requireFiniteNumber(OPERATION, "gap", gap);
    return { nearest, runnerUp, gap };
  };
}
