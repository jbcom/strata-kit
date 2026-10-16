import { encodeSignedComponent8 } from "./signedVector8.js";
import { requireFiniteNumber, requirePositiveFiniteNumber } from "./validation.js";

/** Height-grid spacing, boundary behavior and channel orientation are caller-owned. */
export interface TangentNormalMapOptions {
  width: number;
  height: number;
  heights: ArrayLike<number>;
  spacingX: number;
  spacingY: number;
  edgeX: "wrap" | "clamp";
  edgeY: "wrap" | "clamp";
  normalYSign: -1 | 1;
  heightScale?: number;
}

const OPERATION = "bakeTangentNormalMap";
const MAX_PIXELS = 4_194_304;

// Divide before multiplying when possible. The alternate orders also admit
// finite slopes whose individual scale/span and difference/span overflow.
function scaledSlope(difference: number, scale: number, span: number): number {
  if (difference === 0) return 0;
  const a = Math.abs(difference);
  const b = Math.abs(scale);
  const large = Math.max(a, b);
  const small = Math.min(a, b);
  let magnitude = (large / span) * small;
  if (!Number.isFinite(magnitude)) magnitude = (small / span) * large;
  if (!Number.isFinite(magnitude)) magnitude = (a * b) / span;
  requireFiniteNumber(OPERATION, "height slope", magnitude);
  return difference < 0 !== scale < 0 ? -magnitude : magnitude;
}

/** Fresh RGBA8 tangent normals; takes one finite snapshot before any stencils. */
export function bakeTangentNormalMap(options: TangentNormalMapOptions): Uint8Array {
  if (options === null || typeof options !== "object") {
    throw new Error(`${OPERATION}: options must be an object`);
  }
  const {
    width,
    height,
    heights,
    spacingX,
    spacingY,
    edgeX,
    edgeY,
    normalYSign,
    heightScale = 1,
  } = options;
  const count = width * height;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(count) ||
    count > MAX_PIXELS
  ) {
    throw new Error(
      `${OPERATION}: positive integer dimensions must contain at most ${MAX_PIXELS} pixels`,
    );
  }
  requirePositiveFiniteNumber(OPERATION, "spacingX", spacingX);
  requirePositiveFiniteNumber(OPERATION, "spacingY", spacingY);
  requireFiniteNumber(OPERATION, "heightScale", heightScale);
  if ((edgeX !== "wrap" && edgeX !== "clamp") || (edgeY !== "wrap" && edgeY !== "clamp")) {
    throw new Error(`${OPERATION}: edgeX and edgeY must be wrap or clamp`);
  }
  if (normalYSign !== -1 && normalYSign !== 1) {
    throw new Error(`${OPERATION}: normalYSign must be -1 or 1`);
  }
  const length = heights?.length;
  if (length !== count) throw new Error(`${OPERATION}: heights.length must equal width*height`);
  const samples = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const value = heights[index];
    requireFiniteNumber(OPERATION, `heights[${index}]`, value);
    samples[index] = value;
  }
  const output = new Uint8Array(count * 4);

  function slope(before: number, after: number, steps: number, spacing: number): number {
    if (before === after || heightScale === 0) return 0;
    const difference = samples[after] - samples[before];
    const span = steps * spacing;
    requireFiniteNumber(OPERATION, "height difference", difference);
    requirePositiveFiniteNumber(OPERATION, "physical stencil span", span);
    return scaledSlope(difference, heightScale, span);
  }

  for (let row = 0; row < height; row += 1) {
    const below = edgeY === "wrap" ? (row + height - 1) % height : Math.max(0, row - 1);
    const above = edgeY === "wrap" ? (row + 1) % height : Math.min(height - 1, row + 1);
    for (let column = 0; column < width; column += 1) {
      const left = edgeX === "wrap" ? (column + width - 1) % width : Math.max(0, column - 1);
      const right = edgeX === "wrap" ? (column + 1) % width : Math.min(width - 1, column + 1);
      const sx = slope(
        row * width + left,
        row * width + right,
        edgeX === "wrap" ? 2 : right - left,
        spacingX,
      );
      const sy = slope(
        below * width + column,
        above * width + column,
        edgeY === "wrap" ? 2 : above - below,
        spacingY,
      );
      let x = -sx;
      let y = normalYSign * sy;
      let z = 1;
      let norm = Math.hypot(x, y, z);
      if (!Number.isFinite(norm)) {
        const largest = Math.max(Math.abs(x), Math.abs(y), 1);
        x /= largest;
        y /= largest;
        z /= largest;
        norm = Math.hypot(x, y, z);
      }
      const offset = (row * width + column) * 4;
      output[offset] = encodeSignedComponent8(x / norm);
      output[offset + 1] = encodeSignedComponent8(y / norm);
      output[offset + 2] = encodeSignedComponent8(z / norm);
      output[offset + 3] = 255;
    }
  }
  return output;
}
