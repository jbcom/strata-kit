import type {} from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Material } from 'three';

import type { HeightfieldMesh } from './terrain.js';
import { createThreeHeightfieldGeometry } from './three.js';

/** Props for the opt-in React Three Fiber heightfield view. */
export interface StrataHeightfieldProps {
  mesh: HeightfieldMesh;
  material?: Material;
}

/** An opt-in R3F view over a pure, precomputed heightfield. */
export function StrataHeightfield({ mesh, material }: StrataHeightfieldProps) {
  const geometry = useMemo(() => createThreeHeightfieldGeometry(mesh), [mesh]);
  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);
  return <mesh geometry={geometry} material={material} />;
}
