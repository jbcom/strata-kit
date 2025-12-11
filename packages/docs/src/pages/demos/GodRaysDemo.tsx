import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Slider, Stack, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import * as THREE from 'three';

import { GodRays, VolumetricSpotlight, VolumetricPointLight, ProceduralSky } from '@jbcom/strata';

type LightingPreset = 'cathedral' | 'forest' | 'underwater' | 'dusty';

const presetConfigs: Record<LightingPreset, {
  godRaysColor: number;
  godRaysIntensity: number;
  spotlightColor: number;
  ambientColor: number;
  fogColor: string;
  fogDensity: number;
}> = {
  cathedral: {
    godRaysColor: 0xfff5e6,
    godRaysIntensity: 1.2,
    spotlightColor: 0xffffcc,
    ambientColor: 0x1a1a2e,
    fogColor: '#1a1a2e',
    fogDensity: 0.02,
  },
  forest: {
    godRaysColor: 0xaaffaa,
    godRaysIntensity: 0.8,
    spotlightColor: 0x88ff88,
    ambientColor: 0x0d1f0d,
    fogColor: '#0d1f0d',
    fogDensity: 0.03,
  },
  underwater: {
    godRaysColor: 0x66aaff,
    godRaysIntensity: 0.6,
    spotlightColor: 0x44aaff,
    ambientColor: 0x001122,
    fogColor: '#001133',
    fogDensity: 0.05,
  },
  dusty: {
    godRaysColor: 0xffcc66,
    godRaysIntensity: 1.5,
    spotlightColor: 0xffaa44,
    ambientColor: 0x2a1a0a,
    fogColor: '#2a1a0a',
    fogDensity: 0.04,
  },
};

function Pillars() {
  return (
    <group>
      {[[-8, 0, -8], [8, 0, -8], [-8, 0, 8], [8, 0, 8]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, 5, z]} castShadow>
          <cylinderGeometry args={[0.8, 1, 10, 16]} />
          <meshStandardMaterial color="#666" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ 
  preset, 
  sunAngle, 
  intensity,
  showSpotlight,
  showPointLight,
}: { 
  preset: LightingPreset; 
  sunAngle: number;
  intensity: number;
  showSpotlight: boolean;
  showPointLight: boolean;
}) {
  const config = presetConfigs[preset];
  
  const lightPosition = useMemo(() => {
    const x = Math.cos((sunAngle * Math.PI) / 180) * 80;
    const y = Math.sin((sunAngle * Math.PI) / 180) * 80;
    return new THREE.Vector3(x, y, 0);
  }, [sunAngle]);

  return (
    <>
      <color attach="background" args={[config.ambientColor]} />
      <fog attach="fog" args={[config.fogColor, 10, 80]} />
      
      <ambientLight intensity={0.1} color={config.ambientColor} />
      <directionalLight 
        position={[lightPosition.x, lightPosition.y, lightPosition.z]} 
        intensity={0.5} 
        color={config.godRaysColor}
        castShadow
      />

      <GodRays
        lightPosition={lightPosition}
        color={config.godRaysColor}
        intensity={config.godRaysIntensity * intensity}
        decay={0.95}
        density={1.0}
        samples={50}
        exposure={1.0}
        sunAltitude={sunAngle}
      />

      {showSpotlight && (
        <VolumetricSpotlight
          position={[0, 15, 0]}
          target={[0, 0, 0]}
          color={config.spotlightColor}
          intensity={0.8 * intensity}
          angle={Math.PI / 6}
          distance={20}
          dustDensity={0.5}
        />
      )}

      {showPointLight && (
        <VolumetricPointLight
          position={[-5, 3, 5]}
          color={0xffaa66}
          intensity={0.6 * intensity}
          radius={8}
          dustDensity={0.4}
          flicker={0.1}
        />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>

      <Pillars />

      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[4, 4, 4]} />
        <meshStandardMaterial color="#555" roughness={0.7} metalness={0.3} />
      </mesh>

      <OrbitControls target={[0, 3, 0]} maxPolarAngle={Math.PI / 2} />
    </>
  );
}

export default function GodRaysDemo() {
  const [preset, setPreset] = useState<LightingPreset>('cathedral');
  const [sunAngle, setSunAngle] = useState(35);
  const [intensity, setIntensity] = useState(1);
  const [showSpotlight, setShowSpotlight] = useState(true);
  const [showPointLight, setShowPointLight] = useState(true);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [15, 10, 15], fov: 60 }} shadows>
          <Scene 
            preset={preset} 
            sunAngle={sunAngle} 
            intensity={intensity}
            showSpotlight={showSpotlight}
            showPointLight={showPointLight}
          />
        </Canvas>

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
            Volumetric Lighting
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            God rays, volumetric spotlights, and point lights with dust particle simulation.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="GodRays" size="small" variant="outlined" color="primary" />
            <Chip label="VolumetricSpotlight" size="small" variant="outlined" color="primary" />
            <Chip label="VolumetricPointLight" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Preset
              </Typography>
              <ToggleButtonGroup
                value={preset}
                exclusive
                onChange={(_, v) => v && setPreset(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="cathedral">Cathedral</ToggleButton>
                <ToggleButton value="forest">Forest</ToggleButton>
                <ToggleButton value="underwater">Water</ToggleButton>
                <ToggleButton value="dusty">Dusty</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Sun Angle: {sunAngle}°
              </Typography>
              <Slider
                value={sunAngle}
                onChange={(_, v) => setSunAngle(v as number)}
                min={10}
                max={80}
                size="small"
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Intensity: {intensity.toFixed(1)}
              </Typography>
              <Slider
                value={intensity}
                onChange={(_, v) => setIntensity(v as number)}
                min={0.1}
                max={2}
                step={0.1}
                size="small"
              />
            </Box>

            <Stack direction="row" spacing={1}>
              <ToggleButton
                value="spotlight"
                selected={showSpotlight}
                onChange={() => setShowSpotlight(!showSpotlight)}
                size="small"
              >
                Spotlight
              </ToggleButton>
              <ToggleButton
                value="pointlight"
                selected={showPointLight}
                onChange={() => setShowPointLight(!showPointLight)}
                size="small"
              >
                Point Light
              </ToggleButton>
            </Stack>
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
{`import { GodRays, VolumetricSpotlight } from '@jbcom/strata';

<GodRays
  lightPosition={[80, 50, 0]}
  color={0xfff5e6}
  intensity={1.2}
  samples={50}
/>

<VolumetricSpotlight
  position={[0, 15, 0]}
  target={[0, 0, 0]}
  dustDensity={0.5}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses GodRays, VolumetricSpotlight, VolumetricPointLight from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
