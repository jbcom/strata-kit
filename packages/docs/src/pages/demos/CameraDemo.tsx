import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Typography, Paper, Stack, ToggleButton, ToggleButtonGroup, Button, Chip } from '@mui/material';
import * as THREE from 'three';

import {
  FollowCamera,
  OrbitCamera,
  FPSCamera,
  CinematicCamera,
  CameraShake,
  FollowCameraRef,
  OrbitCameraRef,
  FPSCameraRef,
  CinematicCameraRef,
  CameraShakeRef,
} from '@jbcom/strata';

type CameraMode = 'follow' | 'orbit' | 'fps' | 'cinematic';

function MovingTarget() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.position.x = Math.sin(t * 0.5) * 5;
      meshRef.current.position.z = Math.cos(t * 0.5) * 5;
      meshRef.current.rotation.y = t;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 1, 0]} castShadow>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color="#d4af37" metalness={0.5} roughness={0.3} />
    </mesh>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#2d4a3e" />
      </mesh>
      <gridHelper args={[50, 50, '#444', '#333']} position={[0, 0.01, 0]} />
      
      {[[-8, 3], [8, -5], [-5, -8], [10, 6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1, z]} castShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color={['#e74c3c', '#3498db', '#2ecc71', '#9b59b6'][i]} />
        </mesh>
      ))}
    </>
  );
}

function Scene({ 
  cameraMode, 
  shakeRef,
  cinematicPath,
}: { 
  cameraMode: CameraMode; 
  shakeRef: React.RefObject<CameraShakeRef>;
  cinematicPath: THREE.Vector3[];
}) {
  const targetRef = useRef<THREE.Group>(null);
  const followRef = useRef<FollowCameraRef>(null);
  const orbitRef = useRef<OrbitCameraRef>(null);
  const fpsRef = useRef<FPSCameraRef>(null);
  const cinematicRef = useRef<CinematicCameraRef>(null);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

      <Ground />
      
      <group ref={targetRef}>
        <MovingTarget />
      </group>

      {cameraMode === 'follow' && (
        <FollowCamera
          ref={followRef}
          target={targetRef as any}
          offset={[0, 5, 10]}
          smoothTime={0.3}
          lookAheadDistance={2}
        />
      )}

      {cameraMode === 'orbit' && (
        <OrbitCamera
          ref={orbitRef}
          target={[0, 1, 0]}
          minDistance={5}
          maxDistance={30}
          autoRotate={false}
          enableDamping={true}
        />
      )}

      {cameraMode === 'fps' && (
        <FPSCamera
          ref={fpsRef}
          position={[0, 1.7, 10]}
          sensitivity={0.002}
          headBobEnabled={true}
          movementSpeed={5}
        />
      )}

      {cameraMode === 'cinematic' && (
        <CinematicCamera
          ref={cinematicRef}
          path={cinematicPath}
          duration={8}
          loop={true}
          lookAt={new THREE.Vector3(0, 1, 0)}
          autoPlay={true}
        />
      )}

      <CameraShake
        ref={shakeRef}
        intensity={1}
        decay={1.5}
        maxYaw={0.1}
        maxPitch={0.1}
      />
    </>
  );
}

export default function CameraDemo() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const shakeRef = useRef<CameraShakeRef>(null);

  const cinematicPath = [
    new THREE.Vector3(15, 8, 15),
    new THREE.Vector3(0, 12, 20),
    new THREE.Vector3(-15, 6, 10),
    new THREE.Vector3(-10, 3, -10),
    new THREE.Vector3(10, 5, -15),
    new THREE.Vector3(20, 8, 0),
  ];

  const handleShake = () => {
    shakeRef.current?.addTrauma(0.5);
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas shadows>
          <Scene 
            cameraMode={cameraMode} 
            shakeRef={shakeRef}
            cinematicPath={cinematicPath}
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
            Camera Systems
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Multiple camera modes with smooth transitions, trauma-based shake, and cinematic paths.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="FollowCamera" size="small" variant="outlined" color="primary" />
            <Chip label="OrbitCamera" size="small" variant="outlined" color="primary" />
            <Chip label="FPSCamera" size="small" variant="outlined" color="primary" />
            <Chip label="CameraShake" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Camera Mode
              </Typography>
              <ToggleButtonGroup
                value={cameraMode}
                exclusive
                onChange={(_, v) => v && setCameraMode(v)}
                size="small"
                fullWidth
                sx={{ flexWrap: 'wrap' }}
              >
                <ToggleButton value="orbit">Orbit</ToggleButton>
                <ToggleButton value="follow">Follow</ToggleButton>
                <ToggleButton value="fps">FPS</ToggleButton>
                <ToggleButton value="cinematic">Cinematic</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Button variant="outlined" color="primary" onClick={handleShake}>
              Trigger Camera Shake
            </Button>

            {cameraMode === 'fps' && (
              <Typography variant="caption" color="warning.main">
                Click to lock pointer. Use WASD to move, mouse to look.
              </Typography>
            )}
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
{`import { 
  FollowCamera, OrbitCamera, FPSCamera, 
  CinematicCamera, CameraShake 
} from '@jbcom/strata';

<FollowCamera target={targetRef} offset={[0, 5, 10]} />
<OrbitCamera target={[0, 1, 0]} autoRotate={true} />
<FPSCamera position={[0, 1.7, 0]} headBobEnabled />
<CameraShake ref={shakeRef} intensity={1} />

// Trigger shake on impact
shakeRef.current.addTrauma(0.5);`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses FollowCamera, OrbitCamera, FPSCamera, CinematicCamera, CameraShake from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
