import { useRef, useState, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Html } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Box, Typography, Paper, Stack, Button, Chip } from '@mui/material';
import * as THREE from 'three';
import type { RapierRigidBody } from '@react-three/rapier';

import { 
  CharacterController, 
  Destructible,
  Buoyancy,
  characterPresets,
} from '@jbcom/strata';
import type { CharacterControllerRef, DestructibleRef } from '@jbcom/strata';

function Ground() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#3a4a5a" />
      </mesh>
    </RigidBody>
  );
}

function Platform({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" position={position}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[6, 0.5, 6]} />
        <meshStandardMaterial color="#5a6a7a" />
      </mesh>
    </RigidBody>
  );
}

function Ramp({ position, rotation }: { position: [number, number, number], rotation: [number, number, number] }) {
  return (
    <RigidBody type="fixed" position={position} rotation={rotation}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[4, 0.3, 8]} />
        <meshStandardMaterial color="#6a5a4a" />
      </mesh>
    </RigidBody>
  );
}

function WaterPool() {
  return (
    <group position={[15, -0.5, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial 
          color="#0066aa" 
          transparent 
          opacity={0.6}
        />
      </mesh>
      <RigidBody type="fixed">
        <mesh position={[0, -0.5, 0]}>
          <boxGeometry args={[10, 1, 10]} />
          <meshStandardMaterial color="#004488" />
        </mesh>
      </RigidBody>
    </group>
  );
}

interface SpawnedBox {
  id: number;
  position: [number, number, number];
  color: string;
  type: 'dynamic' | 'destructible' | 'buoyant';
}

function SpawnedObject({ box, onDestroy }: { box: SpawnedBox; onDestroy: () => void }) {
  const destructibleRef = useRef<DestructibleRef>(null);

  if (box.type === 'destructible') {
    return (
      <Destructible
        ref={destructibleRef}
        position={box.position}
        size={[1, 1, 1]}
        config={{ health: 30, shardCount: 8 }}
        onBreak={onDestroy}
      >
        <mesh castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={box.color} />
        </mesh>
      </Destructible>
    );
  }

  if (box.type === 'buoyant') {
    return (
      <Buoyancy
        position={box.position}
        config={{ waterLevel: 0, buoyancyForce: 18 }}
        mass={5}
      >
        <mesh castShadow>
          <boxGeometry args={[1, 0.5, 1.5]} />
          <meshStandardMaterial color={box.color} />
        </mesh>
      </Buoyancy>
    );
  }

  return (
    <RigidBody position={box.position} type="dynamic" colliders="cuboid">
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={box.color} />
      </mesh>
    </RigidBody>
  );
}

function CharacterVisual() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.3, 1.2]} />
        <meshStandardMaterial color="#d4af37" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.25]} />
        <meshStandardMaterial color="#e8c547" metalness={0.2} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Scene({ 
  spawnedBoxes,
  onRemoveBox,
  characterPreset,
  grounded,
  onGroundedChange,
}: { 
  spawnedBoxes: SpawnedBox[];
  onRemoveBox: (id: number) => void;
  characterPreset: keyof typeof characterPresets;
  grounded: boolean;
  onGroundedChange: (g: boolean) => void;
}) {
  const characterRef = useRef<CharacterControllerRef>(null);
  const presetConfig = characterPresets[characterPreset];

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[20, 30, 20]} 
        intensity={1.2} 
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <Sky sunPosition={[100, 50, 100]} />

      <Ground />
      <Platform position={[-8, 2, -8]} />
      <Platform position={[8, 4, -8]} />
      <Ramp position={[0, 1, -5]} rotation={[-0.3, 0, 0]} />
      <WaterPool />

      <CharacterController
        ref={characterRef}
        position={[0, 3, 5]}
        config={presetConfig.config}
        enableInput
        sprintMultiplier={1.6}
        onGroundedChange={onGroundedChange}
        onJump={() => console.log('Jumped!')}
        onLand={(v) => console.log(`Landed with velocity: ${v.toFixed(2)}`)}
      >
        <CharacterVisual />
      </CharacterController>

      {spawnedBoxes.map(box => (
        <SpawnedObject 
          key={box.id} 
          box={box} 
          onDestroy={() => onRemoveBox(box.id)}
        />
      ))}

      <RigidBody type="fixed" position={[-15, 1.5, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[0.5, 3, 10]} />
          <meshStandardMaterial color="#4a5a6a" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" position={[25, 1.5, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[0.5, 3, 10]} />
          <meshStandardMaterial color="#4a5a6a" />
        </mesh>
      </RigidBody>

      <OrbitControls 
        target={[0, 2, 0]} 
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={30}
      />
    </>
  );
}

function PhysicsLoading() {
  return (
    <Html center>
      <div style={{
        background: 'rgba(0,0,0,0.8)',
        color: '#d4af37',
        padding: '20px 40px',
        borderRadius: 8,
        fontSize: 18,
      }}>
        Loading Physics...
      </div>
    </Html>
  );
}

export default function PhysicsDemo() {
  const [spawnedBoxes, setSpawnedBoxes] = useState<SpawnedBox[]>([]);
  const [spawnType, setSpawnType] = useState<'dynamic' | 'destructible' | 'buoyant'>('dynamic');
  const [characterPreset, setCharacterPreset] = useState<keyof typeof characterPresets>('fps');
  const [grounded, setGrounded] = useState(true);
  const boxIdRef = useRef(0);

  const spawnBox = useCallback(() => {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    let x = (Math.random() - 0.5) * 10;
    let z = (Math.random() - 0.5) * 10;
    
    if (spawnType === 'buoyant') {
      x = 15 + (Math.random() - 0.5) * 6;
      z = (Math.random() - 0.5) * 6;
    }

    const newBox: SpawnedBox = {
      id: boxIdRef.current++,
      position: [x, 8, z],
      color,
      type: spawnType,
    };
    
    setSpawnedBoxes(prev => [...prev, newBox]);
  }, [spawnType]);

  const removeBox = useCallback((id: number) => {
    setSpawnedBoxes(prev => prev.filter(b => b.id !== id));
  }, []);

  const resetScene = useCallback(() => {
    setSpawnedBoxes([]);
  }, []);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas 
          camera={{ position: [15, 12, 15], fov: 50 }} 
          shadows
          onCreated={({ gl }) => {
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <Suspense fallback={<PhysicsLoading />}>
            <Physics gravity={[0, -20, 0]} debug={false}>
              <Scene 
                spawnedBoxes={spawnedBoxes}
                onRemoveBox={removeBox}
                characterPreset={characterPreset}
                grounded={grounded}
                onGroundedChange={setGrounded}
              />
            </Physics>
          </Suspense>
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
            Physics System Demo
          </Typography>
          
          <Typography variant="body2" color="text.secondary" paragraph>
            Use WASD or Arrow keys to move. Space to jump. Shift to sprint.
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip 
              label={grounded ? 'Grounded' : 'Airborne'}
              color={grounded ? 'success' : 'warning'}
              size="small"
            />
            <Chip 
              label={`Objects: ${spawnedBoxes.length}`}
              variant="outlined"
              size="small"
            />
          </Stack>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Character Preset
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
            {(Object.keys(characterPresets) as Array<keyof typeof characterPresets>).map(preset => (
              <Button
                key={preset}
                size="small"
                variant={characterPreset === preset ? 'contained' : 'outlined'}
                onClick={() => setCharacterPreset(preset)}
                sx={{ textTransform: 'capitalize', mb: 0.5 }}
              >
                {preset}
              </Button>
            ))}
          </Stack>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Spawn Object Type
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button
              size="small"
              variant={spawnType === 'dynamic' ? 'contained' : 'outlined'}
              onClick={() => setSpawnType('dynamic')}
            >
              Dynamic
            </Button>
            <Button
              size="small"
              variant={spawnType === 'destructible' ? 'contained' : 'outlined'}
              onClick={() => setSpawnType('destructible')}
            >
              Destructible
            </Button>
            <Button
              size="small"
              variant={spawnType === 'buoyant' ? 'contained' : 'outlined'}
              onClick={() => setSpawnType('buoyant')}
            >
              Buoyant
            </Button>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              color="primary"
              onClick={spawnBox}
            >
              Spawn Box
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={resetScene}
            >
              Reset
            </Button>
          </Stack>
        </Paper>

        <Paper
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            p: 1.5,
            bgcolor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: 'primary.dark',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Platform at (-8, 2, -8) • Ramp ahead • Water pool on the right
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
