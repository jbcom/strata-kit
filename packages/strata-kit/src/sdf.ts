/** Renderer-neutral signed-distance primitives and field operations. */

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

export function opUnion(left: number, right: number): number {
  requirePair('opUnion', left, right);
  return Math.min(left, right);
}

export function opIntersection(left: number, right: number): number {
  requirePair('opIntersection', left, right);
  return Math.max(left, right);
}

export function opSubtraction(left: number, right: number): number {
  requirePair('opSubtraction', left, right);
  return Math.max(left, -right);
}

export function opSmoothUnion(left: number, right: number, radius: number): number {
  requirePair('opSmoothUnion', left, right);
  requirePositiveFinite('opSmoothUnion', 'radius', radius);
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

export function opSmoothSubtraction(left: number, right: number, radius: number): number {
  requirePair('opSmoothSubtraction', left, right);
  requirePositiveFinite('opSmoothSubtraction', 'radius', radius);
  const blend = Math.max(radius - Math.abs(-left - right), 0) / radius;
  return Math.max(left, -right) + blend * blend * radius * 0.25;
}

export function sdSphere(point: Vec3, center: Vec3, radius: number): number {
  requireVec3('sdSphere', 'point', point);
  requireVec3('sdSphere', 'center', center);
  requirePositiveFinite('sdSphere', 'radius', radius);
  return Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) - radius;
}

export function sdPlane(point: Vec3, height = 0): number {
  requireVec3('sdPlane', 'point', point);
  requireFinite('sdPlane', 'height', height);
  return point.y - height;
}

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
