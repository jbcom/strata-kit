/** Stateless eccentric superellipse sections, independent of mesh sampling. */
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

export interface SuperellipseSection2D {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly power: number;
}

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

function checkedSection(
  operation: string,
  section: SuperellipseSection2D,
): readonly [number, number, number] {
  const { halfWidth, halfDepth, power } = section;
  requirePositiveFiniteNumber(operation, "halfWidth", halfWidth);
  requirePositiveFiniteNumber(operation, "halfDepth", halfDepth);
  requireFiniteNumber(operation, "power", power);
  if (power < 2) throw new Error(`${operation}: power must be >= 2`);
  return [halfWidth, halfDepth, power];
}

function signedPower(value: number, exponent: number, extent: number): number {
  const result = extent * Math.sign(value) * Math.abs(value) ** exponent;
  return result === 0 ? 0 : result;
}

/**
 * Fresh eccentric signed-power point; angle0 is +first, PI/2 is +second.
 * Named quarter-turn cardinals within [-TAU,TAU] have exact axes and positive zero.
 * Floating remainder limits large-angle phase accuracy; no arc metric is implied.
 * Subnormal products may round to zero, and high-power corners are ill-conditioned.
 */
export function superellipsePoint2D(
  section: SuperellipseSection2D,
  angle: number,
): readonly [number, number] {
  const operation = "superellipsePoint2D";
  const [halfWidth, halfDepth, power] = checkedSection(operation, section);
  requireFiniteNumber(operation, "angle", angle);
  // Keep the signed remainder: adding TAU would erase tiny negative offsets.
  const remainder = angle % TAU;
  const quadrant = Math.round(remainder / HALF_PI);
  const local = remainder - quadrant * HALF_PI;
  const cosine = Math.cos(local);
  const sine = Math.sin(local);
  let first: number;
  let second: number;
  switch (((quadrant % 4) + 4) % 4) {
    case 0:
      first = cosine;
      second = sine;
      break;
    case 1:
      first = -sine;
      second = cosine;
      break;
    case 2:
      first = -cosine;
      second = -sine;
      break;
    default:
      first = sine;
      second = -cosine;
  }
  return [signedPower(first, 2 / power, halfWidth), signedPower(second, 2 / power, halfDepth)];
}

/**
 * Unridged nonnegative second-axis extent at first-axis x, clamped outside.
 * No inset, extent floor, volume policy or normalized surface normal is chosen.
 */
export function superellipseHalfDepth2D(section: SuperellipseSection2D, x: number): number {
  const operation = "superellipseHalfDepth2D";
  const [halfWidth, halfDepth, power] = checkedSection(operation, section);
  requireFiniteNumber(operation, "x", x);
  const absoluteX = Math.abs(x);
  if (absoluteX === 0) return halfDepth;
  if (absoluteX >= halfWidth) return 0;
  const gap = (halfWidth - absoluteX) / halfWidth;
  // -Infinity here is safe saturation to q=1, including a rounded central gap=1.
  const q = -Math.expm1(power * Math.log1p(-gap));
  const result = halfDepth * q ** (1 / power);
  return result === 0 ? 0 : result;
}
