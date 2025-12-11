import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Slider, Stack, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import * as THREE from 'three';

import { Rain, Snow, Lightning, WeatherSystem, ProceduralSky } from '@jbcom/strata';

type WeatherPreset = 'clear' | 'rain' | 'snow' | 'storm';

const presets: Record<WeatherPreset, { type: string; intensity: number; temperature: number; lightning: boolean }> = {
  clear: { type: 'clear', intensity: 0, temperature: 20, lightning: false },
  rain: { type: 'rain', intensity: 0.7, temperature: 15, lightning: false },
  snow: { type: 'snow', intensity: 0.8, temperature: -5, lightning: false },
  storm: { type: 'storm', intensity: 1, temperature: 12, lightning: true },
};

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#2d4a3e" />
    </mesh>
  );
}

function Buildings() {
  return (
    <group>
      {[[-5, 0, -5], [5, 0, -8], [-8, 0, 3], [6, 0, 5], [0, 0, -12]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, 2 + i * 0.5, z]} castShadow>
          <boxGeometry args={[3, 4 + i, 3]} />
          <meshStandardMaterial color="#4a4a5a" />
        </mesh>
      ))}
    </group>
  );
}

function Scene({
  preset,
  intensity,
  windStrength,
}: {
  preset: WeatherPreset;
  intensity: number;
  windStrength: number;
}) {
  const config = presets[preset];
  const wind = useMemo(() => new THREE.Vector3(windStrength, 0, windStrength * 0.3), [windStrength]);
  
  const sunAngle = preset === 'storm' ? 30 : preset === 'rain' ? 45 : 60;

  return (
    <>
      <ProceduralSky timeOfDay={{ sunAngle }} />
      
      <ambientLight intensity={preset === 'storm' ? 0.1 : preset === 'rain' ? 0.3 : 0.5} />
      <directionalLight
        position={[20, 30, 10]}
        intensity={preset === 'storm' ? 0.2 : preset === 'rain' ? 0.5 : 1}
        castShadow
      />

      <Ground />
      <Buildings />

      {(preset === 'rain' || preset === 'storm') && (
        <Rain
          count={Math.floor(10000 * intensity)}
          areaSize={50}
          height={30}
          intensity={intensity}
          wind={wind}
          color={0xaaccff}
        />
      )}

      {preset === 'snow' && (
        <Snow
          count={Math.floor(5000 * intensity)}
          areaSize={50}
          height={30}
          intensity={intensity}
          wind={wind.clone().multiplyScalar(0.5)}
          color={0xffffff}
        />
      )}

      {preset === 'storm' && (
        <Lightning
          active={true}
          frequency={0.1 * intensity}
          flashIntensity={2}
        />
      )}

      <OrbitControls target={[0, 2, 0]} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export default function WeatherDemo() {
  const [preset, setPreset] = useState<WeatherPreset>('rain');
  const [intensity, setIntensity] = useState(0.7);
  const [windStrength, setWindStrength] = useState(0.5);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [15, 10, 15], fov: 60 }} shadows>
          <Scene preset={preset} intensity={intensity} windStrength={windStrength} />
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
            Weather System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            GPU-instanced weather effects including rain, snow, and lightning with dynamic wind.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="Rain" size="small" variant="outlined" color="primary" />
            <Chip label="Snow" size="small" variant="outlined" color="primary" />
            <Chip label="Lightning" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Weather Preset
              </Typography>
              <ToggleButtonGroup
                value={preset}
                exclusive
                onChange={(_, v) => v && setPreset(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="clear">Clear</ToggleButton>
                <ToggleButton value="rain">Rain</ToggleButton>
                <ToggleButton value="snow">Snow</ToggleButton>
                <ToggleButton value="storm">Storm</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Intensity: {(intensity * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={intensity}
                onChange={(_, v) => setIntensity(v as number)}
                min={0.1}
                max={1}
                step={0.1}
                size="small"
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Wind Strength: {windStrength.toFixed(1)}
              </Typography>
              <Slider
                value={windStrength}
                onChange={(_, v) => setWindStrength(v as number)}
                min={0}
                max={2}
                step={0.1}
                size="small"
              />
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
            maxWidth: 400,
          }}
        >
          <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
{`import { Rain, Snow, Lightning } from '@jbcom/strata';

<Rain
  count={10000}
  intensity={0.7}
  wind={new THREE.Vector3(0.5, 0, 0.2)}
/>

<Snow count={5000} intensity={0.8} />

<Lightning active={true} frequency={0.1} />`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses Rain, Snow, Lightning, WeatherSystem from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
