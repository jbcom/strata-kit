import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stack, Switch, FormControlLabel, Typography, Button } from '@mui/material';
import * as THREE from 'three';
import * as YUKA from 'yuka';

import { YukaEntityManager, YukaVehicle, YukaPath, YukaVehicleRef } from '@jbcom/strata';
import DemoLayout from '../../components/DemoLayout';

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

  useEffect(() => {
    if (!vehicleRef.current) return;
    
    const path = new YUKA.Path();
    path.loop = true;
    waypoints.forEach(([x, y, z]) => path.add(new YUKA.Vector3(x, y, z)));

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
      const toCenter = new YUKA.Vector3(
        -vehicle.position.x,
        -vehicle.position.y,
        -vehicle.position.z
      ).normalize();
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
    </>
  );
}

const CODE_SAMPLE = `import { YukaEntityManager, YukaVehicle, YukaPath } from '@jbcom/strata';
import * as YUKA from 'yuka';

<YukaEntityManager>
  <YukaVehicle ref={vehicleRef} maxSpeed={3}>
    <AgentMesh />
  </YukaVehicle>
</YukaEntityManager>

// Add steering behaviors
const followPath = new YUKA.FollowPathBehavior(path);
vehicleRef.current.addBehavior(followPath);

// Flocking behaviors
const alignment = new YUKA.AlignmentBehavior();
const cohesion = new YUKA.CohesionBehavior();
const separation = new YUKA.SeparationBehavior();`;

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

  const controls = (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={
          <Switch 
            checked={showPatrol} 
            onChange={(e) => setShowPatrol(e.target.checked)} 
            size="small" 
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Patrol Agents (Green/Yellow)
          </Typography>
        }
      />
      <FormControlLabel
        control={
          <Switch 
            checked={showFlocking} 
            onChange={(e) => setShowFlocking(e.target.checked)} 
            size="small" 
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Flocking Agents (Blue)
          </Typography>
        }
      />
      <FormControlLabel
        control={
          <Switch 
            checked={showSeeking} 
            onChange={(e) => setShowSeeking(e.target.checked)} 
            size="small" 
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Seeking Agent (Purple)
          </Typography>
        }
      />
      <Button 
        variant="outlined" 
        size="small" 
        onClick={handleTargetChange}
        sx={{ mt: 1 }}
      >
        Randomize Seek Target
      </Button>
    </Stack>
  );

  return (
    <DemoLayout
      title="YukaJS AI System"
      description="AI agents with steering behaviors: patrolling guards, flocking birds, and seeking behavior. Powered by YukaJS game AI library."
      chips={['YukaVehicle', 'YukaPath', 'Steering', 'Flocking']}
      features={[
        'Path following with waypoints',
        'Flocking with alignment, cohesion, separation',
        'Seek and arrive behaviors',
        'Wandering with boundary constraints',
      ]}
      code={CODE_SAMPLE}
      controls={controls}
    >
      <Scene 
        showPatrol={showPatrol}
        showFlocking={showFlocking}
        showSeeking={showSeeking}
        seekTarget={seekTarget}
      />
    </DemoLayout>
  );
}
