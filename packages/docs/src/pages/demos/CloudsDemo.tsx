import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Slider, Stack, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import * as THREE from 'three';

import { CloudSky, CloudLayer, ProceduralSky } from '@jbcom/strata';

type CloudPreset = 'clear' | 'overcast' | 'stormy' | 'sunset';

const cloudConfigs: Record<CloudPreset, { layers: any[]; sunAngle: number; sunIntensity: number }> = {
  clear: {
    sunAngle: 70,
    sunIntensity: 1.2,
    layers: [
      { altitude: 100, density: 0.3, coverage: 0.2, scale: 8 },
      { altitude: 150, density: 0.2, coverage: 0.15, scale: 10 },
    ],
  },
  overcast: {
    sunAngle: 50,
    sunIntensity: 0.6,
    layers: [
      { altitude: 60, density: 0.9, coverage: 0.8, scale: 4 },
      { altitude: 80, density: 0.7, coverage: 0.7, scale: 5 },
      { altitude: 100, density: 0.5, coverage: 0.6, scale: 6 },
    ],
  },
  stormy: {
    sunAngle: 30,
    sunIntensity: 0.3,
    layers: [
      { altitude: 50, density: 1, coverage: 0.9, scale: 3, cloudColor: '#666677', shadowColor: '#334455' },
      { altitude: 70, density: 0.8, coverage: 0.85, scale: 4, cloudColor: '#555566', shadowColor: '#223344' },
      { altitude: 90, density: 0.6, coverage: 0.8, scale: 5, cloudColor: '#444455', shadowColor: '#112233' },
    ],
  },
  sunset: {
    sunAngle: 15,
    sunIntensity: 0.8,
    layers: [
      { altitude: 80, density: 0.5, coverage: 0.4, scale: 6, cloudColor: '#ffccaa', shadowColor: '#cc6644' },
      { altitude: 120, density: 0.4, coverage: 0.3, scale: 8, cloudColor: '#ffbb99', shadowColor: '#bb5533' },
      { altitude: 160, density: 0.3, coverage: 0.25, scale: 10, cloudColor: '#ffaa88', shadowColor: '#aa4422' },
    ],
  },
};

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#2d4a27" />
      </mesh>
      {[[-20, 0, -30], [30, 0, -20], [-10, 0, 40], [40, 0, 20]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, 3 + i * 2, z]} castShadow>
          <coneGeometry args={[5, 10 + i * 3, 8]} />
          <meshStandardMaterial color="#1a3d1a" />
        </mesh>
      ))}
    </>
  );
}

function Scene({ preset, timeOfDay, windSpeed }: { preset: CloudPreset; timeOfDay: number; windSpeed: number }) {
  const config = cloudConfigs[preset];
  
  const adjustedSunAngle = useMemo(() => {
    const baseAngle = config.sunAngle;
    const timeOffset = (timeOfDay - 0.5) * 60;
    return Math.max(5, Math.min(175, baseAngle + timeOffset));
  }, [config.sunAngle, timeOfDay]);

  return (
    <>
      <ProceduralSky timeOfDay={{ sunAngle: adjustedSunAngle }} />
      
      <CloudSky
        layers={config.layers}
        windSpeed={windSpeed}
        windDirection={[1, 0.3]}
        sunAngle={adjustedSunAngle}
        sunIntensity={config.sunIntensity}
        adaptToTimeOfDay={true}
      />

      <ambientLight intensity={0.2 + (adjustedSunAngle / 180) * 0.3} />
      <directionalLight
        position={[
          Math.cos((adjustedSunAngle * Math.PI) / 180) * 100,
          Math.sin((adjustedSunAngle * Math.PI) / 180) * 100,
          50,
        ]}
        intensity={config.sunIntensity * Math.max(0.2, Math.sin((adjustedSunAngle * Math.PI) / 180))}
        castShadow
      />

      <Ground />

      <OrbitControls target={[0, 20, 0]} maxPolarAngle={Math.PI / 2} minDistance={10} maxDistance={200} />
    </>
  );
}

export default function CloudsDemo() {
  const [preset, setPreset] = useState<CloudPreset>('overcast');
  const [timeOfDay, setTimeOfDay] = useState(0.5);
  const [windSpeed, setWindSpeed] = useState(0.01);

  const timeLabel = useMemo(() => {
    const hours = Math.floor(timeOfDay * 24);
    const period = hours < 12 ? 'AM' : 'PM';
    const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHour}:00 ${period}`;
  }, [timeOfDay]);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [0, 30, 80], fov: 60 }} shadows>
          <Scene preset={preset} timeOfDay={timeOfDay} windSpeed={windSpeed} />
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
            Procedural Clouds
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Multi-layer procedural cloud system with dynamic lighting adaptation and wind animation.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="CloudSky" size="small" variant="outlined" color="primary" />
            <Chip label="CloudLayer" size="small" variant="outlined" color="primary" />
            <Chip label="Day/Night" size="small" variant="outlined" color="primary" />
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
                <ToggleButton value="overcast">Overcast</ToggleButton>
                <ToggleButton value="stormy">Stormy</ToggleButton>
                <ToggleButton value="sunset">Sunset</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Time of Day: {timeLabel}
              </Typography>
              <Slider
                value={timeOfDay}
                onChange={(_, v) => setTimeOfDay(v as number)}
                min={0}
                max={1}
                step={0.01}
                size="small"
              />
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Wind Speed: {(windSpeed * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={windSpeed}
                onChange={(_, v) => setWindSpeed(v as number)}
                min={0}
                max={0.05}
                step={0.005}
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
            maxWidth: 420,
          }}
        >
          <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
{`import { CloudSky, CloudLayer } from '@jbcom/strata';

<CloudSky
  layers={[
    { altitude: 80, density: 0.8, coverage: 0.5 },
    { altitude: 120, density: 0.6, coverage: 0.4 },
  ]}
  windSpeed={0.01}
  sunAngle={60}
  adaptToTimeOfDay={true}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses CloudSky, CloudLayer from @jbcom/strata - Procedural cloud rendering with shader-based noise
        </Typography>
      </Box>
    </Box>
  );
}
