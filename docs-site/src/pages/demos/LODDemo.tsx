import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Stack, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import * as THREE from 'three';

import { LODMesh, LODGroup, LODMeshRef } from '@jbcom/strata';

type QualityProfile = 'performance' | 'quality' | 'mobile';

const distanceProfiles: Record<QualityProfile, number[]> = {
  performance: [10, 20, 40],
  quality: [20, 40, 80],
  mobile: [5, 15, 30],
};

function createLODGeometries() {
  return {
    high: new THREE.IcosahedronGeometry(1, 4),
    medium: new THREE.IcosahedronGeometry(1, 2),
    low: new THREE.IcosahedronGeometry(1, 1),
    billboard: new THREE.PlaneGeometry(2, 2),
  };
}

function LODObject({ 
  position, 
  profile,
  onLevelChange,
}: { 
  position: [number, number, number]; 
  profile: QualityProfile;
  onLevelChange?: (level: number, distance: number) => void;
}) {
  const meshRef = useRef<LODMeshRef>(null);
  const { camera } = useThree();
  
  const geometries = useMemo(() => createLODGeometries(), []);
  const distances = distanceProfiles[profile];
  
  const levels = useMemo(() => [
    { distance: 0, geometry: geometries.high },
    { distance: distances[0], geometry: geometries.medium },
    { distance: distances[1], geometry: geometries.low },
    { distance: distances[2], geometry: geometries.billboard },
  ], [geometries, distances]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4af37',
    metalness: 0.5,
    roughness: 0.3,
  }), []);

  useFrame(() => {
    if (meshRef.current && onLevelChange) {
      const distance = meshRef.current.getDistance();
      onLevelChange(meshRef.current.currentLevel, distance);
    }
  });

  return (
    <LODMesh
      ref={meshRef}
      levels={levels}
      baseMaterial={material}
      position={position}
      transitionDuration={0.3}
      fadeMode="instant"
      onLevelChange={(level) => {
        if (meshRef.current && onLevelChange) {
          onLevelChange(level, meshRef.current.getDistance());
        }
      }}
    />
  );
}

function LODIndicator({ level, distance }: { level: number; distance: number }) {
  const levelNames = ['High Detail', 'Medium Detail', 'Low Detail', 'Billboard'];
  const levelColors = ['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'];
  
  return (
    <Paper
      sx={{
        position: 'absolute',
        top: 16,
        right: 16,
        p: 2,
        bgcolor: 'rgba(0,0,0,0.85)',
        border: '1px solid',
        borderColor: levelColors[level],
      }}
    >
      <Typography variant="subtitle2" sx={{ color: levelColors[level] }}>
        {levelNames[level]}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Distance: {distance.toFixed(1)}m
      </Typography>
    </Paper>
  );
}

function Scene({ profile, onLevelChange }: { profile: QualityProfile; onLevelChange: (level: number, distance: number) => void }) {
  const objectPositions: [number, number, number][] = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let x = -20; x <= 20; x += 8) {
      for (let z = -40; z <= 0; z += 8) {
        positions.push([x, 1, z]);
      }
    }
    return positions;
  }, []);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#2d4a3e" />
      </mesh>

      <gridHelper args={[100, 50, '#444', '#333']} position={[0, 0.01, 0]} />

      {objectPositions.map((pos, i) => (
        <LODObject
          key={i}
          position={pos}
          profile={profile}
          onLevelChange={i === Math.floor(objectPositions.length / 2) ? onLevelChange : undefined}
        />
      ))}

      <OrbitControls target={[0, 1, -20]} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export default function LODDemo() {
  const [profile, setProfile] = useState<QualityProfile>('quality');
  const [currentLevel, setCurrentLevel] = useState(0);
  const [currentDistance, setCurrentDistance] = useState(0);

  const handleLevelChange = (level: number, distance: number) => {
    setCurrentLevel(level);
    setCurrentDistance(distance);
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [0, 8, 15], fov: 60 }}>
          <Scene profile={profile} onLevelChange={handleLevelChange} />
        </Canvas>

        <LODIndicator level={currentLevel} distance={currentDistance} />

        <Paper
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            p: 2,
            bgcolor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: 'primary.dark',
            maxWidth: 340,
          }}
        >
          <Typography variant="h6" color="primary.main" gutterBottom>
            LOD System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Level of Detail system automatically switches mesh complexity based on distance from camera.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="LODMesh" size="small" variant="outlined" color="primary" />
            <Chip label="LODGroup" size="small" variant="outlined" color="primary" />
            <Chip label="Impostor" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Quality Profile
              </Typography>
              <ToggleButtonGroup
                value={profile}
                exclusive
                onChange={(_, v) => v && setProfile(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="performance">Performance</ToggleButton>
                <ToggleButton value="quality">Quality</ToggleButton>
                <ToggleButton value="mobile">Mobile</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                LOD Distances: {distanceProfiles[profile].join('m, ')}m
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            p: 2,
            bgcolor: 'rgba(0,0,0,0.85)',
            maxWidth: 420,
          }}
        >
          <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
{`import { LODMesh, LODGroup } from '@jbcom/strata';

<LODMesh
  levels={[
    { distance: 0, geometry: highDetailGeo },
    { distance: 20, geometry: mediumDetailGeo },
    { distance: 40, geometry: lowDetailGeo },
  ]}
  baseMaterial={material}
  fadeMode="crossfade"
  onLevelChange={(level) => console.log(level)}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses LODMesh, LODGroup, Impostor from @jbcom/strata - Distance-based detail management
        </Typography>
      </Box>
    </Box>
  );
}
