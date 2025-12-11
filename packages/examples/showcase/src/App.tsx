import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stars, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

import {
  ProceduralSky,
  Water,
  VolumetricFog,
  GPUParticles,
  ProceduralClouds,
} from '@jbcom/strata';

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#D4845C" wireframe />
    </mesh>
  );
}

function Terrain() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200, 128, 128]} />
      <meshStandardMaterial 
        color="#2d4a3e" 
        wireframe={false}
        roughness={0.9}
      />
    </mesh>
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
      
      <Terrain />
      
      <Suspense fallback={<LoadingFallback />}>
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
      <Controls />
    </div>
  );
}
