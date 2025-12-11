import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Stack, Chip } from '@mui/material';
import * as THREE from 'three';

import { Joystick3D, GroundSwitch, PressurePlate, WallButton, InputAxis } from '@jbcom/strata';

function ControlledCube({ joystickAxis }: { joystickAxis: InputAxis }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const velocity = useRef({ x: 0, z: 0 });

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    
    const targetX = joystickAxis.x * 0.2;
    const targetZ = joystickAxis.y * 0.2;
    
    velocity.current.x += (targetX - velocity.current.x) * delta * 5;
    velocity.current.z += (targetZ - velocity.current.z) * delta * 5;
    
    meshRef.current.position.x += velocity.current.x;
    meshRef.current.position.z += velocity.current.z;
    
    meshRef.current.position.x = Math.max(-8, Math.min(8, meshRef.current.position.x));
    meshRef.current.position.z = Math.max(-8, Math.min(8, meshRef.current.position.z));
    
    meshRef.current.rotation.x += velocity.current.z * 0.5;
    meshRef.current.rotation.z -= velocity.current.x * 0.5;
  });

  return (
    <mesh ref={meshRef} position={[0, 1, 0]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#d4af37" metalness={0.5} roughness={0.3} />
    </mesh>
  );
}

function IndicatorLight({ on, position, color }: { on: boolean; position: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial 
        color={color} 
        emissive={color}
        emissiveIntensity={on ? 2 : 0}
      />
    </mesh>
  );
}

function Scene({ 
  onJoystickChange,
  onSwitchChange,
  onPlateChange,
  onButtonPress,
  switchState,
  plateState,
}: { 
  onJoystickChange: (axis: InputAxis) => void;
  onSwitchChange: (value: number) => void;
  onPlateChange: (pressed: boolean) => void;
  onButtonPress: () => void;
  switchState: number;
  plateState: boolean;
}) {
  const [joystickAxis, setJoystickAxis] = useState<InputAxis>({ x: 0, y: 0 });

  const handleJoystickAxis = (axis: InputAxis) => {
    setJoystickAxis(axis);
    onJoystickChange(axis);
  };

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <pointLight position={[0, 8, 0]} intensity={0.5} color="#ffcc77" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2d3a4a" />
      </mesh>

      <ControlledCube joystickAxis={joystickAxis} />

      <Joystick3D
        position={[-6, 0, 6]}
        size={1.2}
        baseColor="#333"
        knobColor="#ff6600"
        onAxisChange={handleJoystickAxis}
        maxTilt={Math.PI / 5}
      />

      <GroundSwitch
        position={[0, 0, 6]}
        axis="z"
        throwDistance={0.6}
        material="brass"
        onAxisChange={(axis) => onSwitchChange(axis.y)}
      />

      <PressurePlate
        position={[6, 0, 6]}
        size={[2, 0.15, 2]}
        color="#aa4444"
        activeColor="#44aa44"
        onActivate={() => onPlateChange(true)}
        onDeactivate={() => onPlateChange(false)}
      />

      <group position={[0, 3, -8]}>
        <mesh receiveShadow>
          <boxGeometry args={[16, 6, 0.5]} />
          <meshStandardMaterial color="#555" />
        </mesh>
        
        <WallButton
          position={[0, 0, 0.3]}
          size={0.8}
          color="#e74c3c"
          pressedColor="#27ae60"
          onPress={onButtonPress}
        />
        
        <IndicatorLight on={switchState > 0.5} position={[-4, 1, 0.5]} color="#3498db" />
        <IndicatorLight on={switchState < -0.5} position={[-4, -1, 0.5]} color="#e74c3c" />
        <IndicatorLight on={plateState} position={[4, 0, 0.5]} color="#2ecc71" />
      </group>

      <OrbitControls target={[0, 2, 0]} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export default function InputDemo() {
  const [joystickAxis, setJoystickAxis] = useState<InputAxis>({ x: 0, y: 0 });
  const [switchState, setSwitchState] = useState(0);
  const [plateState, setPlateState] = useState(false);
  const [buttonPresses, setButtonPresses] = useState(0);

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [12, 10, 12], fov: 50 }} shadows>
          <Scene 
            onJoystickChange={setJoystickAxis}
            onSwitchChange={setSwitchState}
            onPlateChange={setPlateState}
            onButtonPress={() => setButtonPresses(p => p + 1)}
            switchState={switchState}
            plateState={plateState}
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
            3D Input System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Interactive 3D controls: joystick controls the cube, switches and buttons trigger events.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="Joystick3D" size="small" variant="outlined" color="primary" />
            <Chip label="GroundSwitch" size="small" variant="outlined" color="primary" />
            <Chip label="PressurePlate" size="small" variant="outlined" color="primary" />
            <Chip label="WallButton" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Joystick X:</Typography>
              <Typography variant="caption" color="primary.main">{joystickAxis.x.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Joystick Y:</Typography>
              <Typography variant="caption" color="primary.main">{joystickAxis.y.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Switch:</Typography>
              <Typography variant="caption" color={switchState > 0.5 ? 'success.main' : switchState < -0.5 ? 'error.main' : 'text.secondary'}>
                {switchState > 0.5 ? 'UP' : switchState < -0.5 ? 'DOWN' : 'CENTER'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Pressure Plate:</Typography>
              <Typography variant="caption" color={plateState ? 'success.main' : 'text.secondary'}>
                {plateState ? 'PRESSED' : 'Released'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Button Presses:</Typography>
              <Typography variant="caption" color="primary.main">{buttonPresses}</Typography>
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
{`import { Joystick3D, GroundSwitch, PressurePlate } from '@jbcom/strata';

<Joystick3D
  position={[0, 0, 0]}
  onAxisChange={(axis) => {
    console.log(axis.x, axis.y);
  }}
/>

<PressurePlate
  onActivate={() => console.log('Pressed!')}
  onDeactivate={() => console.log('Released')}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses Joystick3D, GroundSwitch, PressurePlate, WallButton from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
