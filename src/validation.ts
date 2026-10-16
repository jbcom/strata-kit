/** Internal runtime validation shared by renderer-neutral procedural modules. */

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

// Read the intrinsic kind across realms rather than an overridable own tag.
const typedArrayName = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)?.get;

export function isUint8ArrayView(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && typedArrayName?.call(value) === "Uint8Array";
}

export function requireFiniteNumber(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${operation}: ${name} must be finite`);
}

export function requirePositiveFiniteNumber(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${operation}: ${name} must be a positive finite number`);
  }
}

export function requireFiniteVector3(operation: string, name: string, value: Vector3Like): void {
  requireFiniteNumber(operation, `${name}.x`, value.x);
  requireFiniteNumber(operation, `${name}.y`, value.y);
  requireFiniteNumber(operation, `${name}.z`, value.z);
}
