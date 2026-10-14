/** Shared integer lattice kernel; not a public package subpath. */
export function sampleSeededLattice(seed: number, x: number, y: number, z: number): number {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (((hash ^ (hash >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
