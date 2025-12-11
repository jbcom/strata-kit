import { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Stack, ToggleButton, ToggleButtonGroup, Chip, Switch, FormControlLabel } from '@mui/material';
import * as THREE from 'three';
import * as YUKA from 'yuka';

import { YukaEntityManager, YukaVehicle, YukaPath, YukaVehicleRef } from '@jbcom/strata';

function AgentMesh({ color, scale = 1 }: { color: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.3, 0.4, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.5, 0.4]}>
        <coneGeometry args={[0.15, 0.3, 8]} />
        <meshStandardMaterial color="#fff" />
      </mesh>
    </group>
  );
}

function PatrolAgent({ waypoints, color }: { waypoints: [number, number, number][]; color: string }) {
  const vehicleRef = useRef<YukaVehicleRef>(null);
  const pathRef = useRef<YUKA.Path | null>(null);

  useEffect(() => {
    if (!vehicleRef.current) return;
    
    const path = new YUKA.Path();
    path.loop = true;
    waypoints.forEach(([x, y, z]) => path.add(new YUKA.Vector3(x, y, z)));
    pathRef.current = path;

    const followPath = new YUKA.FollowPathBehavior(path, 0.5);
    followPath.active = true;
    vehicleRef.current.addBehavior(followPath);

    const onPath = new YUKA.OnPathBehavior(path, 2);
    vehicleRef.current.addBehavior(onPath);

    return () => {
      vehicleRef.current?.clearBehaviors();
    };
  }, [waypoints]);

  return (
    <>
      <YukaVehicle ref={vehicleRef} maxSpeed={3} position={waypoints[0]}>
        <AgentMesh color={color} />
      </YukaVehicle>
      <YukaPath waypoints={waypoints} loop visible color={color} />
    </>
  );
}

function FlockingAgent({ 
  index, 
  totalAgents, 
  vehicles,
  allVehiclesReady,
}: { 
  index: number; 
  totalAgents: number; 
  vehicles: React.MutableRefObject<(YUKA.Vehicle | null)[]>;
  allVehiclesReady: boolean;
}) {
  const vehicleRef = useRef<YukaVehicleRef>(null);
  const behaviorsAddedRef = useRef(false);
  const angle = useMemo(() => (index / totalAgents) * Math.PI * 2, [index, totalAgents]);
  const radius = useMemo(() => 3 + (index * 0.5), [index]);
  const startPos = useMemo<[number, number, number]>(() => [
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ], [angle, radius]);

  useEffect(() => {
    if (!vehicleRef.current) return;
    
    const vehicle = vehicleRef.current.vehicle;
    vehicles.current[index] = vehicle;

    return () => {
      vehicles.current[index] = null;
      vehicleRef.current?.clearBehaviors();
    };
  }, [index, vehicles]);

  useEffect(() => {
    if (!vehicleRef.current || !allVehiclesReady || behaviorsAddedRef.current) return;
    
    const vehicle = vehicleRef.current.vehicle;
    
    const neighbors = vehicles.current.filter((v): v is YUKA.Vehicle => v !== null && v !== vehicle);
    
    if (neighbors.length === 0) return;
    
    vehicle.neighborhoodRadius = 5;
    
    const alignment = new YUKA.AlignmentBehavior();
    alignment.weight = 0.8;
    vehicleRef.current.addBehavior(alignment);

    const cohesion = new YUKA.CohesionBehavior();
    cohesion.weight = 0.4;
    vehicleRef.current.addBehavior(cohesion);

    const separation = new YUKA.SeparationBehavior();
    separation.weight = 1.2;
    vehicleRef.current.addBehavior(separation);

    const wander = new YUKA.WanderBehavior();
    wander.weight = 0.3;
    wander.radius = 1;
    wander.distance = 2;
    wander.jitter = 0.5;
    vehicleRef.current.addBehavior(wander);
    
    behaviorsAddedRef.current = true;
  }, [allVehiclesReady, vehicles]);

  useFrame(() => {
    if (!vehicleRef.current || !allVehiclesReady) return;
    
    const vehicle = vehicleRef.current.vehicle;
    const neighbors = vehicles.current.filter((v): v is YUKA.Vehicle => v !== null && v !== vehicle);
    
    vehicle.neighbors.length = 0;
    for (const neighbor of neighbors) {
      const distance = vehicle.position.distanceTo(neighbor.position);
      if (distance < vehicle.neighborhoodRadius) {
        vehicle.neighbors.push(neighbor);
      }
    }
    
    if (vehicle.position.length() > 20) {
      vehicle.velocity.multiplyScalar(0.95);
      const toCenter = vehicle.position.clone().negate().normalize();
      vehicle.position.add(toCenter.multiplyScalar(0.1));
    }
  });

  return (
    <YukaVehicle ref={vehicleRef} maxSpeed={2} maxForce={3} position={startPos}>
      <AgentMesh color="#3498db" scale={0.6} />
    </YukaVehicle>
  );
}

function FlockingGroup({ count }: { count: number }) {
  const vehicles = useRef<(YUKA.Vehicle | null)[]>(new Array(count).fill(null));
  const [allVehiclesReady, setAllVehiclesReady] = useState(false);
  const frameCountRef = useRef(0);

  useFrame(() => {
    if (allVehiclesReady) return;
    
    frameCountRef.current++;
    if (frameCountRef.current > 10) {
      const allReady = vehicles.current.filter(v => v !== null).length === count;
      if (allReady) {
        setAllVehiclesReady(true);
      }
    }
  });

  return (
    <group position={[10, 0, -10]}>
      {Array.from({ length: count }).map((_, i) => (
        <FlockingAgent 
          key={i} 
          index={i} 
          totalAgents={count} 
          vehicles={vehicles}
          allVehiclesReady={allVehiclesReady}
        />
      ))}
    </group>
  );
}

function SeekingAgent({ targetPosition }: { targetPosition: THREE.Vector3 }) {
  const vehicleRef = useRef<YukaVehicleRef>(null);

  useEffect(() => {
    if (!vehicleRef.current) return;

    const seek = new YUKA.SeekBehavior(new YUKA.Vector3(
      targetPosition.x, 
      targetPosition.y, 
      targetPosition.z
    ));
    vehicleRef.current.addBehavior(seek);

    const arrive = new YUKA.ArriveBehavior(new YUKA.Vector3(
      targetPosition.x, 
      targetPosition.y, 
      targetPosition.z
    ), 3, 0.5);
    vehicleRef.current.addBehavior(arrive);

    return () => {
      vehicleRef.current?.clearBehaviors();
    };
  }, [targetPosition]);

  return (
    <YukaVehicle ref={vehicleRef} maxSpeed={4} position={[-10, 0, 10]}>
      <AgentMesh color="#9b59b6" />
    </YukaVehicle>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#2d4a3e" />
      </mesh>
      <gridHelper args={[50, 25, '#444', '#333']} position={[0, 0.01, 0]} />
    </>
  );
}

function TargetMarker({ position }: { position: THREE.Vector3 }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 2;
      meshRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
    }
  });

  return (
    <mesh ref={meshRef} position={[position.x, 0.5, position.z]}>
      <octahedronGeometry args={[0.5]} />
      <meshStandardMaterial color="#e74c3c" emissive="#e74c3c" emissiveIntensity={0.5} />
    </mesh>
  );
}

function Scene({ 
  showPatrol, 
  showFlocking, 
  showSeeking,
  seekTarget,
}: { 
  showPatrol: boolean; 
  showFlocking: boolean; 
  showSeeking: boolean;
  seekTarget: THREE.Vector3;
}) {
  const patrolWaypoints1: [number, number, number][] = [
    [-15, 0, -15],
    [-15, 0, -5],
    [-5, 0, -5],
    [-5, 0, -15],
  ];

  const patrolWaypoints2: [number, number, number][] = [
    [15, 0, 5],
    [15, 0, 15],
    [5, 0, 15],
    [5, 0, 5],
  ];

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[20, 30, 10]} intensity={1} castShadow />

      <Ground />

      <YukaEntityManager>
        {showPatrol && (
          <>
            <PatrolAgent waypoints={patrolWaypoints1} color="#2ecc71" />
            <PatrolAgent waypoints={patrolWaypoints2} color="#f1c40f" />
          </>
        )}

        {showFlocking && <FlockingGroup count={8} />}

        {showSeeking && (
          <>
            <SeekingAgent targetPosition={seekTarget} />
            <TargetMarker position={seekTarget} />
          </>
        )}
      </YukaEntityManager>

      <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export default function AIDemo() {
  const [showPatrol, setShowPatrol] = useState(true);
  const [showFlocking, setShowFlocking] = useState(true);
  const [showSeeking, setShowSeeking] = useState(true);
  const [seekTarget, setSeekTarget] = useState(new THREE.Vector3(0, 0, 0));

  const handleTargetChange = () => {
    setSeekTarget(new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      0,
      (Math.random() - 0.5) * 20
    ));
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [25, 20, 25], fov: 50 }} shadows>
          <Scene 
            showPatrol={showPatrol}
            showFlocking={showFlocking}
            showSeeking={showSeeking}
            seekTarget={seekTarget}
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
            YukaJS AI System
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            AI agents with steering behaviors: patrolling guards, flocking birds, and seeking behavior.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="YukaVehicle" size="small" variant="outlined" color="primary" />
            <Chip label="YukaPath" size="small" variant="outlined" color="primary" />
            <Chip label="Steering" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={1}>
            <FormControlLabel
              control={<Switch checked={showPatrol} onChange={(e) => setShowPatrol(e.target.checked)} size="small" />}
              label={<Typography variant="body2" color="text.secondary">Patrol Agents (Green/Yellow)</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={showFlocking} onChange={(e) => setShowFlocking(e.target.checked)} size="small" />}
              label={<Typography variant="body2" color="text.secondary">Flocking Agents (Blue)</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={showSeeking} onChange={(e) => setShowSeeking(e.target.checked)} size="small" />}
              label={<Typography variant="body2" color="text.secondary">Seeking Agent (Purple)</Typography>}
            />

            <ToggleButton
              value="target"
              onClick={handleTargetChange}
              size="small"
              sx={{ mt: 1 }}
            >
              Randomize Seek Target
            </ToggleButton>
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
{`import { YukaEntityManager, YukaVehicle, YukaPath } from '@jbcom/strata';
import * as YUKA from 'yuka';

<YukaEntityManager>
  <YukaVehicle ref={vehicleRef} maxSpeed={3}>
    <AgentMesh />
  </YukaVehicle>
</YukaEntityManager>

// Add steering behaviors
const followPath = new YUKA.FollowPathBehavior(path);
vehicleRef.current.addBehavior(followPath);`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses YukaEntityManager, YukaVehicle, YukaPath from @jbcom/strata - Powered by YukaJS
        </Typography>
      </Box>
    </Box>
  );
}
