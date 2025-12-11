import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Stack, ToggleButton, ToggleButtonGroup, Chip, Slider, Button, Alert } from '@mui/material';
import * as THREE from 'three';

import { AudioProvider, AudioListener, AudioEnvironment, PositionalAudio, AmbientAudio, AudioZone } from '@jbcom/strata';

type EnvironmentPreset = 'forest' | 'cave' | 'city';

const environmentConfigs: Record<EnvironmentPreset, {
  type: 'outdoor' | 'indoor' | 'cave';
  reverbDecay?: number;
  ambientColor: string;
  groundColor: string;
}> = {
  forest: {
    type: 'outdoor',
    reverbDecay: 0.3,
    ambientColor: '#1a3d1a',
    groundColor: '#2d4a27',
  },
  cave: {
    type: 'cave',
    reverbDecay: 2.5,
    ambientColor: '#1a1a2e',
    groundColor: '#333344',
  },
  city: {
    type: 'outdoor',
    reverbDecay: 0.1,
    ambientColor: '#2a2a3a',
    groundColor: '#444455',
  },
};

function SoundSource({ 
  position, 
  color, 
  label 
}: { 
  position: [number, number, number]; 
  color: string; 
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((state) => {
    if (meshRef.current) {
      pulseRef.current = Math.sin(state.clock.elapsedTime * 4) * 0.1 + 1;
      meshRef.current.scale.setScalar(pulseRef.current);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>
      {[1, 2, 3].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[i * 0.8, i * 0.8 + 0.05, 32]} />
          <meshBasicMaterial 
            color={color} 
            transparent 
            opacity={0.3 - i * 0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function ListenerIndicator() {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
      meshRef.current.position.y = 0.5;
    }
  });

  return (
    <mesh ref={meshRef}>
      <coneGeometry args={[0.3, 0.5, 8]} />
      <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.3} />
    </mesh>
  );
}

function Ground({ color }: { color: string }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <gridHelper args={[50, 25, '#666', '#444']} position={[0, 0.01, 0]} />
    </>
  );
}

function SceneContent({ environment }: { environment: EnvironmentPreset }) {
  const config = environmentConfigs[environment];

  return (
    <>
      <color attach="background" args={[config.ambientColor]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />

      <Ground color={config.groundColor} />

      <SoundSource position={[-8, 1, -8]} color="#e74c3c" label="Sound 1" />
      <SoundSource position={[8, 1, -8]} color="#3498db" label="Sound 2" />
      <SoundSource position={[0, 1, 8]} color="#2ecc71" label="Sound 3" />

      <AudioZone
        position={[-10, 0, 10]}
        geometry="sphere"
        radius={5}
        debug={true}
      />

      <ListenerIndicator />

      <OrbitControls 
        target={[0, 0, 0]} 
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={30}
      />
    </>
  );
}

function Scene({ environment, masterVolume }: { environment: EnvironmentPreset; masterVolume: number }) {
  const config = environmentConfigs[environment];

  return (
    <AudioProvider maxSounds={16} enableHRTF={true}>
      <AudioListener />
      <AudioEnvironment 
        type={config.type}
        reverbDecay={config.reverbDecay}
      />
      <SceneContent environment={environment} />
    </AudioProvider>
  );
}

export default function AudioDemo() {
  const [environment, setEnvironment] = useState<EnvironmentPreset>('forest');
  const [masterVolume, setMasterVolume] = useState(0.7);
  const [audioEnabled, setAudioEnabled] = useState(false);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [0, 10, 15], fov: 60 }} shadows>
          <Scene environment={environment} masterVolume={masterVolume} />
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
            maxWidth: 360,
          }}
        >
          <Typography variant="h6" color="primary.main" gutterBottom>
            Spatial Audio System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            3D positioned sound sources with distance attenuation and environment-based reverb effects.
          </Typography>

          <Alert severity="info" sx={{ mb: 2, fontSize: '0.75rem' }}>
            Orbit the camera to hear spatial audio changes. Sound sources are positioned at colored spheres.
          </Alert>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="AudioProvider" size="small" variant="outlined" color="primary" />
            <Chip label="PositionalAudio" size="small" variant="outlined" color="primary" />
            <Chip label="AudioEnvironment" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Environment Preset
              </Typography>
              <ToggleButtonGroup
                value={environment}
                exclusive
                onChange={(_, v) => v && setEnvironment(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="forest">Forest</ToggleButton>
                <ToggleButton value="cave">Cave</ToggleButton>
                <ToggleButton value="city">City</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Master Volume: {(masterVolume * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={masterVolume}
                onChange={(_, v) => setMasterVolume(v as number)}
                min={0}
                max={1}
                step={0.1}
                size="small"
              />
            </Box>

            <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', p: 1.5, borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Sound Sources:
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip size="small" label="Red" sx={{ bgcolor: '#e74c3c' }} />
                <Chip size="small" label="Blue" sx={{ bgcolor: '#3498db' }} />
                <Chip size="small" label="Green" sx={{ bgcolor: '#2ecc71' }} />
              </Stack>
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
            maxWidth: 440,
          }}
        >
          <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
{`import { 
  AudioProvider, AudioListener, PositionalAudio, 
  AudioEnvironment 
} from '@jbcom/strata';

<AudioProvider maxSounds={16} enableHRTF>
  <AudioListener />
  <AudioEnvironment type="cave" reverbDecay={2.5} />
  
  <PositionalAudio
    url="/sounds/ambient.mp3"
    position={[5, 1, 0]}
    refDistance={2}
    maxDistance={20}
    loop
    autoplay
  />
</AudioProvider>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses AudioProvider, AudioListener, PositionalAudio, AudioEnvironment, AudioZone from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
