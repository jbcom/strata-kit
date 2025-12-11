import { useRef, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, Typography, Paper, Stack, ToggleButton, ToggleButtonGroup, Button, Chip } from '@mui/material';
import * as THREE from 'three';

import { Decal, Billboard, AnimatedBillboard, DecalPool, DecalPoolRef } from '@jbcom/strata';

type DecalType = 'bullet' | 'scorch' | 'paint';

function createDecalTexture(type: DecalType): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  
  ctx.clearRect(0, 0, 128, 128);
  
  if (type === 'bullet') {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(64, 64, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const len = 15 + Math.random() * 20;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(angle) * len, 64 + Math.sin(angle) * len);
      ctx.stroke();
    }
  } else if (type === 'scorch') {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 50);
    gradient.addColorStop(0, '#111');
    gradient.addColorStop(0.3, '#333');
    gradient.addColorStop(0.6, '#654');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = `hsl(${Math.random() * 360}, 80%, 50%)`;
    ctx.beginPath();
    ctx.arc(64, 64, 40 + Math.random() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function ClickableWall({ 
  position, 
  rotation, 
  onHit 
}: { 
  position: [number, number, number]; 
  rotation: [number, number, number]; 
  onHit: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}) {
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.face) {
      const normal = e.face.normal.clone();
      const worldNormal = normal.transformDirection(e.object.matrixWorld);
      onHit(e.point.clone(), worldNormal);
    }
  }, [onHit]);

  return (
    <mesh position={position} rotation={rotation} onClick={handleClick} receiveShadow>
      <boxGeometry args={[10, 8, 0.5]} />
      <meshStandardMaterial color="#555" roughness={0.8} />
    </mesh>
  );
}

function SpinningBillboard({ position }: { position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 50 : 25;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  return (
    <Billboard position={position} size={2} texture={texture} lockY={true} />
  );
}

function Scene({ decalType, decals, onAddDecal }: { 
  decalType: DecalType; 
  decals: Array<{ position: THREE.Vector3; normal: THREE.Vector3; type: DecalType; id: number }>;
  onAddDecal: (position: THREE.Vector3, normal: THREE.Vector3) => void;
}) {
  const textures = useMemo(() => ({
    bullet: createDecalTexture('bullet'),
    scorch: createDecalTexture('scorch'),
    paint: createDecalTexture('paint'),
  }), []);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <pointLight position={[0, 5, 5]} intensity={0.5} color="#ffaa00" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#2d4a3e" />
      </mesh>

      <ClickableWall position={[0, 4, -5]} rotation={[0, 0, 0]} onHit={onAddDecal} />
      <ClickableWall position={[-7, 4, 0]} rotation={[0, Math.PI / 2, 0]} onHit={onAddDecal} />
      <ClickableWall position={[7, 4, 0]} rotation={[0, -Math.PI / 2, 0]} onHit={onAddDecal} />

      {decals.map((decal) => (
        <Decal
          key={decal.id}
          position={decal.position}
          normal={decal.normal}
          size={0.8}
          texture={textures[decal.type]}
          fadeTime={10}
          rotation={Math.random() * Math.PI * 2}
        />
      ))}

      <SpinningBillboard position={[-4, 2, 3]} />
      <SpinningBillboard position={[4, 3, 2]} />
      <SpinningBillboard position={[0, 4, 4]} />

      <OrbitControls target={[0, 3, 0]} maxPolarAngle={Math.PI / 2} />
    </>
  );
}

export default function DecalsDemo() {
  const [decalType, setDecalType] = useState<DecalType>('bullet');
  const [decals, setDecals] = useState<Array<{ position: THREE.Vector3; normal: THREE.Vector3; type: DecalType; id: number }>>([]);
  const nextId = useRef(0);

  const handleAddDecal = useCallback((position: THREE.Vector3, normal: THREE.Vector3) => {
    setDecals(prev => [...prev, { position, normal, type: decalType, id: nextId.current++ }]);
  }, [decalType]);

  const handleClear = () => {
    setDecals([]);
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, position: 'relative' }}>
        <Canvas camera={{ position: [8, 6, 12], fov: 60 }} shadows>
          <Scene decalType={decalType} decals={decals} onAddDecal={handleAddDecal} />
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
            Decals & Billboards
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Click on walls to place decals. Billboards always face the camera.
          </Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip label="Decal" size="small" variant="outlined" color="primary" />
            <Chip label="Billboard" size="small" variant="outlined" color="primary" />
            <Chip label="DecalPool" size="small" variant="outlined" color="primary" />
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Decal Type
              </Typography>
              <ToggleButtonGroup
                value={decalType}
                exclusive
                onChange={(_, v) => v && setDecalType(v)}
                size="small"
                fullWidth
              >
                <ToggleButton value="bullet">Bullet</ToggleButton>
                <ToggleButton value="scorch">Scorch</ToggleButton>
                <ToggleButton value="paint">Paint</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Button variant="outlined" color="secondary" onClick={handleClear}>
              Clear Decals ({decals.length})
            </Button>

            <Typography variant="caption" color="info.main">
              Click on walls to place decals
            </Typography>
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
{`import { Decal, Billboard, DecalPool } from '@jbcom/strata';

<Decal
  position={hitPoint}
  normal={hitNormal}
  size={0.8}
  texture={bulletTexture}
  fadeTime={10}
/>

<Billboard 
  position={[0, 2, 0]} 
  texture={starTexture}
  lockY={true}
/>`}
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', py: 1, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Uses Decal, Billboard, AnimatedBillboard, DecalPool from @jbcom/strata
        </Typography>
      </Box>
    </Box>
  );
}
