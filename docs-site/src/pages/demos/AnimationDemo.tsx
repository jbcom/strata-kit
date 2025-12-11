import { useRef, useState, Suspense, useCallback, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { Box, Typography, Paper, Stack, ToggleButtonGroup, ToggleButton, Slider } from '@mui/material';
import * as THREE from 'three';

import {
    IKChain,
    IKLimb,
    LookAt,
    HeadTracker,
    TailPhysics,
    BreathingAnimation,
    BlinkController,
    SpringBone,
} from '@jbcom/strata';
import type { IKChainRef, TailPhysicsRef, HeadTrackerRef } from '@jbcom/strata';

function RoboticArm({ target }: { target: THREE.Vector3 }) {
    const ikRef = useRef<IKChainRef>(null);
    const boneLengths = useMemo(() => [0.5, 0.4, 0.3, 0.2], []);
    const [positions, setPositions] = useState<THREE.Vector3[]>([]);

    useFrame(() => {
        if (ikRef.current) {
            const result = ikRef.current.getResult();
            if (result) {
                setPositions(result.positions);
            }
        }
    });

    return (
        <group position={[0, 2, 0]}>
            <mesh>
                <boxGeometry args={[0.3, 0.2, 0.3]} />
                <meshStandardMaterial color="#444" />
            </mesh>

            <IKChain
                ref={ikRef}
                boneLengths={boneLengths}
                target={target}
                solver="fabrik"
                visualize
                visualColor="#00aaff"
                visualRadius={0.08}
            />

            {positions.length > 1 && (
                <Line
                    points={positions}
                    color="#00aaff"
                    lineWidth={2}
                    dashed={false}
                />
            )}

            <mesh position={target.toArray()}>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color="#ff4400" emissive="#ff4400" emissiveIntensity={0.5} />
            </mesh>
        </group>
    );
}

function IKLimbDemo({ target }: { target: THREE.Vector3 }) {
    const poleTarget = useMemo(() => new THREE.Vector3(0, 0, -1), []);

    return (
        <group position={[-3, 2, 0]}>
            <mesh>
                <boxGeometry args={[0.2, 0.2, 0.2]} />
                <meshStandardMaterial color="#666" />
            </mesh>

            <IKLimb
                upperLength={0.6}
                lowerLength={0.5}
                target={target}
                poleTarget={poleTarget}
                visualize
                visualColor="#44ff88"
            />

            <mesh position={target.toArray()}>
                <sphereGeometry args={[0.08, 16, 16]} />
                <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={0.5} />
            </mesh>
        </group>
    );
}

function AnimatedCreature() {
    const headRef = useRef<HeadTrackerRef>(null);
    const tailRef = useRef<TailPhysicsRef>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const leftEyeRef = useRef<THREE.Mesh>(null);
    const rightEyeRef = useRef<THREE.Mesh>(null);
    const timeRef = useRef(0);

    useFrame((_, delta) => {
        timeRef.current += delta;

        if (bodyRef.current) {
            bodyRef.current.position.x = Math.sin(timeRef.current * 0.5) * 2;
            bodyRef.current.rotation.y = Math.sin(timeRef.current * 0.3) * 0.3;
        }
    });

    return (
        <group ref={bodyRef} position={[3, 1, 0]}>
            <BreathingAnimation amplitude={0.03} frequency={0.8} axis="scale">
                <mesh>
                    <sphereGeometry args={[0.5, 32, 32]} />
                    <meshStandardMaterial color="#8844ff" />
                </mesh>

                <BlinkController
                    blinkDuration={0.12}
                    minInterval={2}
                    maxInterval={5}
                    leftEyeRef={leftEyeRef}
                    rightEyeRef={rightEyeRef}
                >
                    <HeadTracker
                        ref={headRef}
                        followMouse
                        maxAngle={Math.PI / 3}
                        speed={4}
                    >
                        <group position={[0, 0.2, 0.3]}>
                            <mesh ref={leftEyeRef} position={[-0.15, 0, 0.1]}>
                                <sphereGeometry args={[0.12, 16, 16]} />
                                <meshStandardMaterial color="white" />
                            </mesh>
                            <mesh position={[-0.15, 0, 0.18]}>
                                <sphereGeometry args={[0.06, 16, 16]} />
                                <meshStandardMaterial color="black" />
                            </mesh>

                            <mesh ref={rightEyeRef} position={[0.15, 0, 0.1]}>
                                <sphereGeometry args={[0.12, 16, 16]} />
                                <meshStandardMaterial color="white" />
                            </mesh>
                            <mesh position={[0.15, 0, 0.18]}>
                                <sphereGeometry args={[0.06, 16, 16]} />
                                <meshStandardMaterial color="black" />
                            </mesh>
                        </group>
                    </HeadTracker>
                </BlinkController>
            </BreathingAnimation>

            <group position={[0, -0.3, -0.4]} rotation={[0.3, 0, 0]}>
                <TailPhysics
                    ref={tailRef}
                    segmentCount={8}
                    segmentLength={0.15}
                    config={{ stiffness: 80, damping: 6, mass: 0.5 }}
                    visualize
                    visualColor="#aa44ff"
                    visualRadius={0.04}
                />
            </group>
        </group>
    );
}

function SpringPendulum({ config }: { config: { stiffness: number; damping: number } }) {
    const pendulumRef = useRef<THREE.Group>(null);
    const timeRef = useRef(0);

    useFrame((_, delta) => {
        timeRef.current += delta;
        if (pendulumRef.current) {
            pendulumRef.current.position.x = Math.sin(timeRef.current * 2) * 0.5;
        }
    });

    return (
        <group position={[0, 3, -3]}>
            <mesh>
                <boxGeometry args={[0.2, 0.1, 0.2]} />
                <meshStandardMaterial color="#666" />
            </mesh>

            <group ref={pendulumRef}>
                <SpringBone config={config}>
                    <mesh position={[0, -0.5, 0]}>
                        <sphereGeometry args={[0.15, 16, 16]} />
                        <meshStandardMaterial color="#ff6644" />
                    </mesh>
                    <Line
                        points={[[0, 0, 0], [0, -0.5, 0]]}
                        color="#888"
                        lineWidth={2}
                    />
                </SpringBone>
            </group>
        </group>
    );
}

function MouseTarget({ onUpdate }: { onUpdate: (pos: THREE.Vector3) => void }) {
    const { camera, size } = useThree();
    const targetRef = useRef(new THREE.Vector3());

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const x = (event.clientX / size.width) * 2 - 1;
            const y = -(event.clientY / size.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
            raycaster.ray.intersectPlane(plane, targetRef.current);

            targetRef.current.z = 0;
            onUpdate(targetRef.current.clone());
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [camera, size, onUpdate]);

    return null;
}

function Scene({ springConfig }: { springConfig: { stiffness: number; damping: number } }) {
    const [mouseTarget, setMouseTarget] = useState(new THREE.Vector3(0, 1, 0));
    const [limbTarget, setLimbTarget] = useState(new THREE.Vector3(-3, 1, 0));

    const handleMouseUpdate = useCallback((pos: THREE.Vector3) => {
        setMouseTarget(pos);
        setLimbTarget(new THREE.Vector3(pos.x - 3, pos.y, pos.z));
    }, []);

    return (
        <>
            <MouseTarget onUpdate={handleMouseUpdate} />

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
            <pointLight position={[-5, 5, -5]} intensity={0.5} color="#aaddff" />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color="#2a3a4a" />
            </mesh>

            <RoboticArm target={mouseTarget} />
            <IKLimbDemo target={limbTarget} />
            <AnimatedCreature />
            <SpringPendulum config={springConfig} />

            <OrbitControls makeDefault minDistance={3} maxDistance={20} />
        </>
    );
}

function AnimationDemo() {
    const [demoType, setDemoType] = useState<'all' | 'ik' | 'spring' | 'creature'>('all');
    const [stiffness, setStiffness] = useState(150);
    const [damping, setDamping] = useState(8);

    const springConfig = useMemo(() => ({
        stiffness,
        damping
    }), [stiffness, damping]);

    return (
        <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Paper sx={{ p: 2, m: 2, background: 'rgba(10,10,15,0.9)' }}>
                <Typography variant="h4" sx={{ color: '#d4af37', mb: 2 }}>
                    Procedural Animation Demo
                </Typography>
                <Typography variant="body2" sx={{ color: '#aaa', mb: 2 }}>
                    Move your mouse to control the IK targets. The robotic arm and limb follow the cursor, 
                    while the creature's head tracks the mouse and its tail responds to movement with spring physics.
                </Typography>

                <Stack direction="row" spacing={4} alignItems="center" flexWrap="wrap">
                    <Box>
                        <Typography variant="caption" sx={{ color: '#888' }}>Demo View</Typography>
                        <ToggleButtonGroup
                            value={demoType}
                            exclusive
                            onChange={(_, value) => value && setDemoType(value)}
                            size="small"
                        >
                            <ToggleButton value="all">All</ToggleButton>
                            <ToggleButton value="ik">IK Only</ToggleButton>
                            <ToggleButton value="spring">Spring</ToggleButton>
                            <ToggleButton value="creature">Creature</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ minWidth: 200 }}>
                        <Typography variant="caption" sx={{ color: '#888' }}>
                            Spring Stiffness: {stiffness}
                        </Typography>
                        <Slider
                            value={stiffness}
                            onChange={(_, v) => setStiffness(v as number)}
                            min={20}
                            max={500}
                            size="small"
                        />
                    </Box>

                    <Box sx={{ minWidth: 200 }}>
                        <Typography variant="caption" sx={{ color: '#888' }}>
                            Spring Damping: {damping}
                        </Typography>
                        <Slider
                            value={damping}
                            onChange={(_, v) => setDamping(v as number)}
                            min={1}
                            max={30}
                            size="small"
                        />
                    </Box>
                </Stack>
            </Paper>

            <Box sx={{ flex: 1, minHeight: 0 }}>
                <Canvas
                    shadows
                    camera={{ position: [5, 5, 8], fov: 50 }}
                    gl={{ antialias: true }}
                >
                    <Suspense fallback={null}>
                        <Scene springConfig={springConfig} />
                    </Suspense>
                </Canvas>
            </Box>

            <Paper sx={{ p: 2, m: 2, background: 'rgba(10,10,15,0.9)' }}>
                <Stack direction="row" spacing={4} justifyContent="center">
                    <Box textAlign="center">
                        <Typography variant="subtitle2" sx={{ color: '#00aaff' }}>FABRIK Chain</Typography>
                        <Typography variant="caption" sx={{ color: '#888' }}>4-bone robotic arm</Typography>
                    </Box>
                    <Box textAlign="center">
                        <Typography variant="subtitle2" sx={{ color: '#44ff88' }}>Two-Bone IK</Typography>
                        <Typography variant="caption" sx={{ color: '#888' }}>Arm/leg solver</Typography>
                    </Box>
                    <Box textAlign="center">
                        <Typography variant="subtitle2" sx={{ color: '#8844ff' }}>Spring Dynamics</Typography>
                        <Typography variant="caption" sx={{ color: '#888' }}>Tail & breathing</Typography>
                    </Box>
                    <Box textAlign="center">
                        <Typography variant="subtitle2" sx={{ color: '#ff6644' }}>Head Tracking</Typography>
                        <Typography variant="caption" sx={{ color: '#888' }}>Mouse following</Typography>
                    </Box>
                </Stack>
            </Paper>
        </Box>
    );
}

export default AnimationDemo;
