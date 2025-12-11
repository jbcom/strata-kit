import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Slider, Stack, ToggleButton, ToggleButtonGroup, Button } from '@mui/material';
import * as THREE from 'three';

import { ParticleEmitter, ParticleBurst, ParticleEmitterRef } from '@jbcom/strata';

type EffectType = 'fire' | 'smoke' | 'sparks' | 'magic';

function FireEmitter({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  return (
    <ParticleEmitter
      position={position}
      velocity={[0, 2, 0]}
      velocityVariance={[0.5, 1, 0.5]}
      maxParticles={500}
      emissionRate={100 * intensity}
      lifetime={1.5}
      lifetimeVariance={0.3}
      startColor={0xffaa00}
      endColor={0xff2200}
      startSize={0.3}
      endSize={0.05}
      startOpacity={1}
      endOpacity={0}
      shape="sphere"
      shapeParams={{ radius: 0.2 }}
      forces={{ gravity: new THREE.Vector3(0, 0.5, 0) }}
      blending={THREE.AdditiveBlending}
    />
  );
}

function SmokeEmitter({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  return (
    <ParticleEmitter
      position={position}
      velocity={[0, 1.5, 0]}
      velocityVariance={[0.3, 0.5, 0.3]}
      maxParticles={300}
      emissionRate={50 * intensity}
      lifetime={3}
      lifetimeVariance={0.5}
      startColor={0x444444}
      endColor={0x888888}
      startSize={0.2}
      endSize={0.8}
      startOpacity={0.6}
      endOpacity={0}
      shape="point"
      forces={{ gravity: new THREE.Vector3(0, 0.2, 0), wind: new THREE.Vector3(0.5, 0, 0) }}
      blending={THREE.NormalBlending}
    />
  );
}

function SparksEmitter({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  return (
    <ParticleEmitter
      position={position}
      velocity={[0, 3, 0]}
      velocityVariance={[2, 2, 2]}
      maxParticles={200}
      emissionRate={80 * intensity}
      lifetime={1}
      lifetimeVariance={0.2}
      startColor={0xffff00}
      endColor={0xff6600}
      startSize={0.08}
      endSize={0.02}
      startOpacity={1}
      endOpacity={0}
      shape="cone"
      shapeParams={{ angle: Math.PI / 4, radius: 0.1 }}
      forces={{ gravity: new THREE.Vector3(0, -5, 0) }}
      blending={THREE.AdditiveBlending}
    />
  );
}

function MagicEmitter({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <ParticleEmitter
        position={[1, 0, 0]}
        velocity={[0, 0.5, 0]}
        velocityVariance={[0.2, 0.2, 0.2]}
        maxParticles={200}
        emissionRate={40 * intensity}
        lifetime={2}
        lifetimeVariance={0.3}
        startColor={0x8800ff}
        endColor={0x00ffff}
        startSize={0.15}
        endSize={0.02}
        startOpacity={1}
        endOpacity={0}
        shape="sphere"
        shapeParams={{ radius: 0.1 }}
        blending={THREE.AdditiveBlending}
      />
      <ParticleEmitter
        position={[-1, 0, 0]}
        velocity={[0, 0.5, 0]}
        velocityVariance={[0.2, 0.2, 0.2]}
        maxParticles={200}
        emissionRate={40 * intensity}
        lifetime={2}
        lifetimeVariance={0.3}
        startColor={0x00ffff}
        endColor={0xff00ff}
        startSize={0.15}
        endSize={0.02}
        startOpacity={1}
        endOpacity={0}
        shape="sphere"
        shapeParams={{ radius: 0.1 }}
        blending={THREE.AdditiveBlending}
      />
    </group>
  );
}

function BurstController({ burstRef }: { burstRef: React.RefObject<any> }) {
  return null;
}

function Scene({ effect, intensity, showBurst }: { effect: EffectType; intensity: number; showBurst: number }) {
  const burstRef = useRef<ParticleEmitterRef>(null);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {effect === 'fire' && <FireEmitter position={[0, 0, 0]} intensity={intensity} />}
      {effect === 'smoke' && <SmokeEmitter position={[0, 0, 0]} intensity={intensity} />}
      {effect === 'sparks' && <SparksEmitter position={[0, 0, 0]} intensity={intensity} />}
      {effect === 'magic' && <MagicEmitter position={[0, 0, 0]} intensity={intensity} />}

      <ParticleBurst
        ref={burstRef}
        position={[0, 1, 0]}
        velocity={[0, 5, 0]}
        velocityVariance={[3, 3, 3]}
        count={50}
        trigger={showBurst}
        lifetime={1.5}
        startColor={0xffffff}
        endColor={0xffff00}
        startSize={0.2}
        endSize={0.05}
        forces={{ gravity: new THREE.Vector3(0, -8, 0) }}
        blending={THREE.AdditiveBlending}
      />

      <OrbitControls target={[0, 1, 0]} />
    </>
  );
}

export default function ParticleDemo() {
  const [effect, setEffect] = useState<EffectType>('fire');
  const [intensity, setIntensity] = useState(1);
  const [burstTrigger, setBurstTrigger] = useState(0);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [5, 3, 5], fov: 60 }}>
          <Scene effect={effect} intensity={intensity} showBurst={burstTrigger} />
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
            GPU Particle System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            High-performance particle effects using GPU instancing. Fire, smoke, sparks, and magic effects.
          </Typography>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Effect Type
              </Typography>
              <ToggleButtonGroup
                value={effect}
                exclusive
                onChange={(_, v) => v && setEffect(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="fire">Fire</ToggleButton>
                <ToggleButton value="smoke">Smoke</ToggleButton>
                <ToggleButton value="sparks">Sparks</ToggleButton>
                <ToggleButton value="magic">Magic</ToggleButton>
              </ToggleButtonGroup>
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

            <Button
              variant="outlined"
              color="primary"
              onClick={() => setBurstTrigger((prev) => prev + 1)}
            >
              Trigger Burst
            </Button>
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
{`import { ParticleEmitter, ParticleBurst } from '@jbcom/strata';

<ParticleEmitter
  position={[0, 0, 0]}
  velocity={[0, 2, 0]}
  emissionRate={100}
  startColor={0xffaa00}
  endColor={0xff2200}
  startSize={0.3}
  endSize={0.05}
  forces={{ gravity: new THREE.Vector3(0, 0.5, 0) }}
  blending={THREE.AdditiveBlending}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses ParticleEmitter, ParticleBurst from @jbcom/strata - GPU-instanced particle rendering
        </Typography>
      </Box>
    </Box>
  );
}
