import { Suspense, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float, Text3D, Center } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction, ChromaticAberrationEffect } from 'postprocessing';
import * as THREE from 'three';

import {
  ProceduralSky,
  Water,
  VolumetricFog,
  GPUParticles,
  ProceduralClouds,
  GrassInstances,
  EnhancedFog,
} from '@jbcom/strata';

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#D4845C" wireframe />
    </mesh>
  );
}

function AnimatedTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const geo = meshRef.current.geometry as THREE.PlaneGeometry;
      const positions = geo.attributes.position;
      const time = clock.getElapsedTime();
      
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const wave = Math.sin(x * 0.1 + time * 0.5) * Math.cos(y * 0.1 + time * 0.3) * 2;
        positions.setZ(i, wave);
      }
      positions.needsUpdate = true;
      geo.computeVertexNormals();
    }
  });
  
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
      <planeGeometry args={[100, 100, 64, 64]} />
      <meshStandardMaterial 
        color="#2d4a3e" 
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
}

function StrataShowcase() {
  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <ProceduralSky 
          sunPosition={[50, 30, 50]}
          turbidity={8}
          rayleigh={2}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <Water 
          position={[0, -1.5, 0]}
          size={100}
          color="#5B9EA6"
          opacity={0.8}
          waveAmplitude={0.2}
          waveFrequency={0.5}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <VolumetricFog 
          color="#181C22"
          density={0.02}
          height={10}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <GPUParticles
          count={500}
          position={[5, 2, -5]}
          color="#D4845C"
          size={0.1}
          speed={0.5}
          spread={3}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <ProceduralClouds
          position={[0, 20, 0]}
          count={8}
          opacity={0.7}
          scale={15}
        />
      </Suspense>
      
      <Suspense fallback={null}>
        <GrassInstances
          position={[0, -1.9, 0]}
          count={1000}
          spread={30}
          height={0.5}
          color="#3a5f4a"
        />
      </Suspense>
    </>
  );
}

function FeatureShowcase() {
  return (
    <>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh position={[0, 3, 0]} castShadow>
          <octahedronGeometry args={[1]} />
          <meshStandardMaterial 
            color="#D4845C" 
            emissive="#D4845C" 
            emissiveIntensity={0.3}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      </Float>
      
      <mesh position={[-5, 1, -5]} castShadow>
        <torusKnotGeometry args={[0.8, 0.3, 128, 32]} />
        <meshStandardMaterial 
          color="#5B9EA6" 
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      
      <mesh position={[5, 1, -5]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial 
          color="#C49A6C"
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const radius = 8 + Math.sin(i * 0.5) * 2;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              0.5 + Math.sin(i) * 0.5,
              Math.sin(angle) * radius
            ]}
            castShadow
          >
            <boxGeometry args={[0.5, 1 + Math.random(), 0.5]} />
            <meshStandardMaterial 
              color={i % 2 === 0 ? '#D4845C' : '#5B9EA6'}
              metalness={0.3}
              roughness={0.7}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[50, 50, 25]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
      
      <Stars radius={100} depth={50} count={5000} factor={4} fade speed={1} />
      
      <AnimatedTerrain />
      
      <Suspense fallback={<LoadingFallback />}>
        <StrataShowcase />
        <FeatureShowcase />
      </Suspense>
      
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
      
      <EffectComposer>
        <Bloom 
          intensity={0.5} 
          luminanceThreshold={0.8} 
          luminanceSmoothing={0.9} 
        />
        <Vignette offset={0.3} darkness={0.6} />
      </EffectComposer>
    </>
  );
}

function HUD() {
  return (
    <div style={{
      position: 'fixed',
      top: '1rem',
      left: '1rem',
      color: '#E8E6E3',
      fontFamily: "'Archivo', sans-serif",
      zIndex: 100,
    }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        background: 'linear-gradient(135deg, #D4845C 0%, #5B9EA6 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '0.5rem',
      }}>
        STRATA
      </h1>
      <p style={{
        fontSize: '0.75rem',
        color: '#9A9590',
        letterSpacing: '0.05em',
      }}>
        Procedural 3D Graphics for React Three Fiber
      </p>
    </div>
  );
}

function FeatureList() {
  const features = [
    'Procedural Sky',
    'Dynamic Water',
    'Volumetric Fog',
    'GPU Particles',
    'Procedural Clouds',
    'Instanced Grass',
    'Post-Processing',
  ];
  
  return (
    <div style={{
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      color: '#E8E6E3',
      fontFamily: "'Inter', sans-serif",
      zIndex: 100,
      background: 'rgba(16, 20, 24, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(212, 132, 92, 0.2)',
      borderRadius: '0.5rem',
      padding: '1rem',
    }}>
      <h3 style={{
        fontSize: '0.75rem',
        color: '#D4845C',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: '0.5rem',
      }}>
        Active Features
      </h3>
      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        fontSize: '0.75rem',
      }}>
        {features.map((feature, i) => (
          <li key={i} style={{
            padding: '0.25rem 0',
            color: '#9A9590',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ color: '#5B9EA6' }}>✓</span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Controls() {
  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      left: '1rem',
      right: '1rem',
      display: 'flex',
      justifyContent: 'center',
      gap: '0.5rem',
      zIndex: 100,
    }}>
      <div style={{
        background: 'rgba(16, 20, 24, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(212, 132, 92, 0.2)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1.5rem',
        color: '#9A9590',
        fontSize: '0.75rem',
      }}>
        Drag to orbit • Scroll to zoom • Shift+Drag to pan
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#101418' }}>
      <Canvas
        shadows
        camera={{ position: [15, 10, 15], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#101418']} />
        <fog attach="fog" args={['#101418', 30, 100]} />
        <Scene />
      </Canvas>
      <HUD />
      <FeatureList />
      <Controls />
    </div>
  );
}
