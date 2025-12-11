import React, { useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
    Box,
    Typography,
    Slider,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Paper,
    Divider,
    Chip,
} from '@mui/material';
import * as THREE from 'three';
import {
    ToonMesh,
    HologramMesh,
    DissolveMesh,
    Forcefield,
    GradientMesh,
    GlitchMesh,
    CrystalMesh,
} from '@jbcom/strata';
import DemoLayout from '../../components/DemoLayout';

type ShaderType = 'toon' | 'hologram' | 'dissolve' | 'forcefield' | 'gradient' | 'glitch' | 'crystal';

const shaderDescriptions: Record<ShaderType, string> = {
    toon: 'Cell-shaded look with quantized lighting and optional outlines',
    hologram: 'Sci-fi hologram effect with scanlines and flickering',
    dissolve: 'Dissolve effect using 3D noise with glowing edges',
    forcefield: 'Energy shield with hexagonal pattern and fresnel glow',
    gradient: 'Two or three color gradient with multiple directions',
    glitch: 'Digital glitch effect with scanlines and RGB shift',
    crystal: 'Crystal/gem effect with rainbow refraction',
};

function RotatingGeometry({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null);
    
    useFrame((state, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.3;
        }
    });

    return <group ref={groupRef}>{children}</group>;
}

interface ShaderDemoProps {
    shaderType: ShaderType;
    toonLevels: number;
    hologramScanlines: number;
    dissolveProgress: number;
    gradientDirection: 'vertical' | 'horizontal' | 'radial';
    glitchIntensity: number;
    rainbowIntensity: number;
}

function ShaderDemo({
    shaderType,
    toonLevels,
    hologramScanlines,
    dissolveProgress,
    gradientDirection,
    glitchIntensity,
    rainbowIntensity,
}: ShaderDemoProps) {
    return (
        <>
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <pointLight position={[-5, 5, -5]} intensity={0.5} color="#ff8866" />

            <RotatingGeometry>
                {shaderType === 'toon' && (
                    <ToonMesh
                        position={[0, 0, 0]}
                        color={0xff6688}
                        levels={toonLevels}
                        rimColor={0x4488ff}
                        rimPower={2}
                        outlineColor={0x000000}
                        outlineWidth={0.03}
                        showOutline={true}
                    >
                        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
                    </ToonMesh>
                )}

                {shaderType === 'hologram' && (
                    <HologramMesh
                        position={[0, 0, 0]}
                        color={0x00ffff}
                        scanlineIntensity={0.5}
                        scanlineDensity={hologramScanlines}
                        flickerSpeed={1}
                        fresnelPower={2}
                        alpha={0.8}
                        animate
                    >
                        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
                    </HologramMesh>
                )}

                {shaderType === 'dissolve' && (
                    <DissolveMesh
                        position={[0, 0, 0]}
                        color={0xffffff}
                        edgeColor={0xff6600}
                        progress={dissolveProgress}
                        edgeWidth={0.08}
                        noiseScale={3}
                    >
                        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
                    </DissolveMesh>
                )}

                {shaderType === 'forcefield' && (
                    <Forcefield
                        position={[0, 0, 0]}
                        radius={1.5}
                        color={0x00ffff}
                        secondaryColor={0x0088ff}
                        fresnelPower={3}
                        pulseSpeed={1}
                        hexagonScale={10}
                        alpha={0.6}
                        animate
                    />
                )}

                {shaderType === 'gradient' && (
                    <GradientMesh
                        position={[0, 0, 0]}
                        colorStart={0xff6b35}
                        colorMiddle={0xf7931e}
                        colorEnd={0xffd700}
                        direction={gradientDirection}
                        useThreeColors={true}
                    >
                        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
                    </GradientMesh>
                )}

                {shaderType === 'glitch' && (
                    <GlitchMesh
                        position={[0, 0, 0]}
                        color={0xffffff}
                        glitchIntensity={glitchIntensity}
                        scanlineIntensity={0.3}
                        rgbShiftAmount={0.01}
                        animate
                    >
                        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
                    </GlitchMesh>
                )}

                {shaderType === 'crystal' && (
                    <CrystalMesh
                        position={[0, 0, 0]}
                        color={0xffffff}
                        fresnelPower={4}
                        rainbowIntensity={rainbowIntensity}
                        animate
                    >
                        <icosahedronGeometry args={[1.2, 1]} />
                    </CrystalMesh>
                )}
            </RotatingGeometry>
        </>
    );
}

function CodePreview({ shaderType }: { shaderType: ShaderType }) {
    const codeExamples: Record<ShaderType, string> = {
        toon: `import { ToonMesh } from '@jbcom/strata';

<ToonMesh
  color={0xff6688}
  levels={4}
  rimColor={0x4488ff}
  rimPower={2}
  showOutline={true}
>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
</ToonMesh>`,
        hologram: `import { HologramMesh } from '@jbcom/strata';

<HologramMesh
  color={0x00ffff}
  scanlineIntensity={0.5}
  scanlineDensity={100}
  flickerSpeed={1}
  animate
>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
</HologramMesh>`,
        dissolve: `import { DissolveMesh } from '@jbcom/strata';

<DissolveMesh
  color={0xffffff}
  edgeColor={0xff6600}
  progress={0.5}
  edgeWidth={0.08}
  noiseScale={3}
>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
</DissolveMesh>`,
        forcefield: `import { Forcefield } from '@jbcom/strata';

<Forcefield
  radius={1.5}
  color={0x00ffff}
  secondaryColor={0x0088ff}
  fresnelPower={3}
  pulseSpeed={1}
  hexagonScale={10}
  animate
/>`,
        gradient: `import { GradientMesh } from '@jbcom/strata';

<GradientMesh
  colorStart={0xff6b35}
  colorMiddle={0xf7931e}
  colorEnd={0xffd700}
  direction="vertical"
  useThreeColors={true}
>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
</GradientMesh>`,
        glitch: `import { GlitchMesh } from '@jbcom/strata';

<GlitchMesh
  color={0xffffff}
  glitchIntensity={0.1}
  scanlineIntensity={0.3}
  rgbShiftAmount={0.01}
  animate
>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
</GlitchMesh>`,
        crystal: `import { CrystalMesh } from '@jbcom/strata';

<CrystalMesh
  color={0xffffff}
  fresnelPower={4}
  rainbowIntensity={0.4}
  animate
>
  <icosahedronGeometry args={[1.2, 1]} />
</CrystalMesh>`,
    };

    return (
        <Box
            sx={{
                bgcolor: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 1,
                p: 2,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#00ff88',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
                maxHeight: 200,
            }}
        >
            {codeExamples[shaderType]}
        </Box>
    );
}

export default function ShadersDemo() {
    const [shaderType, setShaderType] = useState<ShaderType>('toon');
    const [toonLevels, setToonLevels] = useState(4);
    const [hologramScanlines, setHologramScanlines] = useState(100);
    const [dissolveProgress, setDissolveProgress] = useState(0.3);
    const [gradientDirection, setGradientDirection] = useState<'vertical' | 'horizontal' | 'radial'>('vertical');
    const [glitchIntensity, setGlitchIntensity] = useState(0.1);
    const [rainbowIntensity, setRainbowIntensity] = useState(0.4);

    return (
        <DemoLayout title="Shader Library">
            <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
                <Paper
                    sx={{
                        width: 350,
                        p: 3,
                        bgcolor: 'rgba(10, 10, 15, 0.9)',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        overflow: 'auto',
                    }}
                >
                    <Typography variant="h6" color="primary">
                        Shader Effects
                    </Typography>

                    <FormControl fullWidth>
                        <InputLabel>Shader Type</InputLabel>
                        <Select
                            value={shaderType}
                            label="Shader Type"
                            onChange={(e) => setShaderType(e.target.value as ShaderType)}
                        >
                            <MenuItem value="toon">Toon / Cell Shading</MenuItem>
                            <MenuItem value="hologram">Hologram</MenuItem>
                            <MenuItem value="dissolve">Dissolve</MenuItem>
                            <MenuItem value="forcefield">Forcefield</MenuItem>
                            <MenuItem value="gradient">Gradient</MenuItem>
                            <MenuItem value="glitch">Glitch</MenuItem>
                            <MenuItem value="crystal">Crystal</MenuItem>
                        </Select>
                    </FormControl>

                    <Typography variant="body2" color="text.secondary">
                        {shaderDescriptions[shaderType]}
                    </Typography>

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                    <Typography variant="subtitle2" color="primary">
                        Parameters
                    </Typography>

                    {shaderType === 'toon' && (
                        <Box>
                            <Typography gutterBottom>Shading Levels: {toonLevels}</Typography>
                            <Slider
                                value={toonLevels}
                                onChange={(_, v) => setToonLevels(v as number)}
                                min={2}
                                max={8}
                                step={1}
                                marks
                            />
                        </Box>
                    )}

                    {shaderType === 'hologram' && (
                        <Box>
                            <Typography gutterBottom>Scanline Density: {hologramScanlines}</Typography>
                            <Slider
                                value={hologramScanlines}
                                onChange={(_, v) => setHologramScanlines(v as number)}
                                min={20}
                                max={200}
                                step={10}
                            />
                        </Box>
                    )}

                    {shaderType === 'dissolve' && (
                        <Box>
                            <Typography gutterBottom>Dissolve Progress: {dissolveProgress.toFixed(2)}</Typography>
                            <Slider
                                value={dissolveProgress}
                                onChange={(_, v) => setDissolveProgress(v as number)}
                                min={0}
                                max={1}
                                step={0.01}
                            />
                        </Box>
                    )}

                    {shaderType === 'gradient' && (
                        <FormControl fullWidth>
                            <InputLabel>Direction</InputLabel>
                            <Select
                                value={gradientDirection}
                                label="Direction"
                                onChange={(e) => setGradientDirection(e.target.value as 'vertical' | 'horizontal' | 'radial')}
                            >
                                <MenuItem value="vertical">Vertical</MenuItem>
                                <MenuItem value="horizontal">Horizontal</MenuItem>
                                <MenuItem value="radial">Radial</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    {shaderType === 'glitch' && (
                        <Box>
                            <Typography gutterBottom>Glitch Intensity: {glitchIntensity.toFixed(2)}</Typography>
                            <Slider
                                value={glitchIntensity}
                                onChange={(_, v) => setGlitchIntensity(v as number)}
                                min={0}
                                max={0.3}
                                step={0.01}
                            />
                        </Box>
                    )}

                    {shaderType === 'crystal' && (
                        <Box>
                            <Typography gutterBottom>Rainbow Intensity: {rainbowIntensity.toFixed(2)}</Typography>
                            <Slider
                                value={rainbowIntensity}
                                onChange={(_, v) => setRainbowIntensity(v as number)}
                                min={0}
                                max={1}
                                step={0.05}
                            />
                        </Box>
                    )}

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                    <Typography variant="subtitle2" color="primary">
                        Code Example
                    </Typography>

                    <CodePreview shaderType={shaderType} />

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        <Chip label="THREE.ShaderMaterial" size="small" variant="outlined" />
                        <Chip label="React Three Fiber" size="small" variant="outlined" />
                        <Chip label="GLSL" size="small" variant="outlined" />
                    </Box>
                </Paper>

                <Box sx={{ flex: 1, borderRadius: 2, overflow: 'hidden' }}>
                    <Canvas
                        camera={{ position: [0, 0, 5], fov: 50 }}
                        gl={{
                            antialias: true,
                            toneMapping: THREE.ACESFilmicToneMapping,
                            toneMappingExposure: 1,
                        }}
                    >
                        <color attach="background" args={['#0a0a0f']} />
                        <Suspense fallback={null}>
                            <ShaderDemo
                                shaderType={shaderType}
                                toonLevels={toonLevels}
                                hologramScanlines={hologramScanlines}
                                dissolveProgress={dissolveProgress}
                                gradientDirection={gradientDirection}
                                glitchIntensity={glitchIntensity}
                                rainbowIntensity={rainbowIntensity}
                            />
                            <OrbitControls
                                enablePan={false}
                                minDistance={3}
                                maxDistance={10}
                            />
                        </Suspense>
                    </Canvas>
                </Box>
            </Box>
        </DemoLayout>
    );
}
