/** Renderer-neutral signed-distance primitives and field operations. */

import {
  requireFiniteNumber,
  requireFiniteVector3,
  requirePositiveFiniteNumber,
} from './validation.js';

/** A finite three-dimensional coordinate. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function requirePair(operation: string, left: number, right: number): void {
  requireFiniteNumber(operation, 'left', left);
  requireFiniteNumber(operation, 'right', right);
}

function requireFiniteResult(operation: string, result: number): number {
  if (!Number.isFinite(result)) throw new Error(`${operation}: result must be finite`);
  return result;
}

/** Returns the minimum signed distance from two finite fields. */
export function opUnion(left: number, right: number): number {
  requirePair('opUnion', left, right);
  return requireFiniteResult('opUnion', Math.min(left, right));
}

/** Returns the intersection of two finite signed-distance fields. */
export function opIntersection(left: number, right: number): number {
  requirePair('opIntersection', left, right);
  return requireFiniteResult('opIntersection', Math.max(left, right));
}

/** Subtracts the right finite signed-distance field from the left. */
export function opSubtraction(left: number, right: number): number {
  requirePair('opSubtraction', left, right);
  return requireFiniteResult('opSubtraction', Math.max(left, -right));
}

/** Smoothly unions finite fields using a positive finite blend radius. */
export function opSmoothUnion(left: number, right: number, radius: number): number {
  requirePair('opSmoothUnion', left, right);
  requirePositiveFiniteNumber('opSmoothUnion', 'radius', radius);
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return requireFiniteResult(
    'opSmoothUnion',
    Math.min(left, right) - blend * blend * radius * 0.25
  );
}

/** Smoothly subtracts finite fields using a positive finite blend radius. */
export function opSmoothSubtraction(left: number, right: number, radius: number): number {
  requirePair('opSmoothSubtraction', left, right);
  requirePositiveFiniteNumber('opSmoothSubtraction', 'radius', radius);
  const blend = Math.max(radius - Math.abs(-left - right), 0) / radius;
  return requireFiniteResult(
    'opSmoothSubtraction',
    Math.max(left, -right) + blend * blend * radius * 0.25
  );
}

/** Measures signed distance from a finite point to a positive-radius sphere. */
export function sdSphere(point: Vec3, center: Vec3, radius: number): number {
  requireFiniteVector3('sdSphere', 'point', point);
  requireFiniteVector3('sdSphere', 'center', center);
  requirePositiveFiniteNumber('sdSphere', 'radius', radius);
  return requireFiniteResult(
    'sdSphere',
    Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) - radius
  );
}

/** Measures signed distance from a finite point to a horizontal plane. */
export function sdPlane(point: Vec3, height = 0): number {
  requireFiniteVector3('sdPlane', 'point', point);
  requireFiniteNumber('sdPlane', 'height', height);
  return requireFiniteResult('sdPlane', point.y - height);
}

/** Measures signed distance from a point to an axis-aligned finite box. */
export function sdBox(point: Vec3, center: Vec3, halfExtents: Vec3): number {
  requireFiniteVector3('sdBox', 'point', point);
  requireFiniteVector3('sdBox', 'center', center);
  requirePositiveFiniteNumber('sdBox', 'halfExtents.x', halfExtents.x);
  requirePositiveFiniteNumber('sdBox', 'halfExtents.y', halfExtents.y);
  requirePositiveFiniteNumber('sdBox', 'halfExtents.z', halfExtents.z);
  const qx = Math.abs(point.x - center.x) - halfExtents.x;
  const qy = Math.abs(point.y - center.y) - halfExtents.y;
  const qz = Math.abs(point.z - center.z) - halfExtents.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return requireFiniteResult('sdBox', outside + Math.min(Math.max(qx, qy, qz), 0));
}
