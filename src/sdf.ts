/** Renderer-neutral signed-distance primitives and field operations. */

/** A finite three-dimensional coordinate. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function requireFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${operation}: ${name} must be finite`);
}

function requirePositiveFinite(operation: string, name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${operation}: ${name} must be a positive finite number`);
  }
}

function requireVec3(operation: string, name: string, value: Vec3): void {
  requireFinite(operation, `${name}.x`, value.x);
  requireFinite(operation, `${name}.y`, value.y);
  requireFinite(operation, `${name}.z`, value.z);
}

function requirePair(operation: string, left: number, right: number): void {
  requireFinite(operation, 'left', left);
  requireFinite(operation, 'right', right);
}

/** Returns the minimum signed distance from two finite fields. */
export function opUnion(left: number, right: number): number {
  requirePair('opUnion', left, right);
  return Math.min(left, right);
}

/** Returns the intersection of two finite signed-distance fields. */
export function opIntersection(left: number, right: number): number {
  requirePair('opIntersection', left, right);
  return Math.max(left, right);
}

/** Subtracts the right finite signed-distance field from the left. */
export function opSubtraction(left: number, right: number): number {
  requirePair('opSubtraction', left, right);
  return Math.max(left, -right);
}

/** Smoothly unions finite fields using a positive finite blend radius. */
export function opSmoothUnion(left: number, right: number, radius: number): number {
  requirePair('opSmoothUnion', left, right);
  requirePositiveFinite('opSmoothUnion', 'radius', radius);
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

/** Smoothly subtracts finite fields using a positive finite blend radius. */
export function opSmoothSubtraction(left: number, right: number, radius: number): number {
  requirePair('opSmoothSubtraction', left, right);
  requirePositiveFinite('opSmoothSubtraction', 'radius', radius);
  const blend = Math.max(radius - Math.abs(-left - right), 0) / radius;
  return Math.max(left, -right) + blend * blend * radius * 0.25;
}

/** Measures signed distance from a finite point to a positive-radius sphere. */
export function sdSphere(point: Vec3, center: Vec3, radius: number): number {
  requireVec3('sdSphere', 'point', point);
  requireVec3('sdSphere', 'center', center);
  requirePositiveFinite('sdSphere', 'radius', radius);
  return Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) - radius;
}

/** Measures signed distance from a finite point to a horizontal plane. */
export function sdPlane(point: Vec3, height = 0): number {
  requireVec3('sdPlane', 'point', point);
  requireFinite('sdPlane', 'height', height);
  return point.y - height;
}

/** Measures signed distance from a point to an axis-aligned finite box. */
export function sdBox(point: Vec3, center: Vec3, halfExtents: Vec3): number {
  requireVec3('sdBox', 'point', point);
  requireVec3('sdBox', 'center', center);
  requirePositiveFinite('sdBox', 'halfExtents.x', halfExtents.x);
  requirePositiveFinite('sdBox', 'halfExtents.y', halfExtents.y);
  requirePositiveFinite('sdBox', 'halfExtents.z', halfExtents.z);
  const qx = Math.abs(point.x - center.x) - halfExtents.x;
  const qy = Math.abs(point.y - center.y) - halfExtents.y;
  const qz = Math.abs(point.z - center.z) - halfExtents.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}
