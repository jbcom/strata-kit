import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    noise: 'src/noise.ts',
    sdf: 'src/sdf.ts',
    terrain: 'src/terrain.ts',
    materials: 'src/materials.ts',
    shaders: 'src/shaders.ts',
    three: 'src/three.ts',
    r3f: 'src/r3f.tsx',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'ES2022',
  external: ['three', 'react', '@react-three/fiber'],
});
