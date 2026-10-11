/** Renderer-neutral signed-distance primitives and field operations. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const opUnion = (left: number, right: number) => Math.min(left, right);
export const opIntersection = (left: number, right: number) => Math.max(left, right);
export const opSubtraction = (left: number, right: number) => Math.max(left, -right);

export function opSmoothUnion(left: number, right: number, radius: number): number {
  if (radius <= 0) throw new Error('opSmoothUnion: radius must be positive');
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

export function opSmoothSubtraction(left: number, right: number, radius: number): number {
  if (radius <= 0) throw new Error('opSmoothSubtraction: radius must be positive');
  const blend = Math.max(radius - Math.abs(-left - right), 0) / radius;
  return Math.max(left, -right) + blend * blend * radius * 0.25;
}

export function sdSphere(point: Vec3, center: Vec3, radius: number): number {
  if (radius <= 0) throw new Error('sdSphere: radius must be positive');
  return Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) - radius;
}

export function sdPlane(point: Vec3, height = 0): number {
  return point.y - height;
}

export function sdBox(point: Vec3, center: Vec3, halfExtents: Vec3): number {
  const qx = Math.abs(point.x - center.x) - halfExtents.x;
  const qy = Math.abs(point.y - center.y) - halfExtents.y;
  const qz = Math.abs(point.z - center.z) - halfExtents.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}
