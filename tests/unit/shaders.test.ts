import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
    ShaderChunks,
    createTimeUniform,
    createProgressUniform,
    createColorUniform,
    createVector2Uniform,
    createVector3Uniform,
    composeShaderChunks,
    buildVertexShader,
    buildFragmentShader,
    noiseSnippet,
    lightingSnippet,
    colorSnippet,
    animationSnippet,
} from '../../src/core/shaders';
import {
    createToonMaterial,
    createHologramMaterial,
    createDissolveMaterial,
    createForcefieldMaterial,
    createGlitchMaterial,
    createCrystalMaterial,
    createOutlineMaterial,
    createGradientMaterial,
    createScanlineMaterial,
} from '../../src/shaders/materials';
import {
    toonPresets,
    hologramPresets,
    dissolvePresets,
    forcefieldPresets,
    glitchPresets,
    crystalPresets,
    gradientPresets,
    scanlinePresets,
    colorPalettes,
    getToonPreset,
    getHologramPreset,
    getDissolvePreset,
    getForcefieldPreset,
    getGlitchPreset,
    getCrystalPreset,
    getGradientPreset,
    getScanlinePreset,
    getColorPalette,
} from '../../src/presets/shaders';

describe('Core Shader Utilities', () => {
    describe('ShaderChunks', () => {
        it('should have noise chunks', () => {
            expect(ShaderChunks.noise).toBeDefined();
            expect(ShaderChunks.noise.rand).toContain('fract');
            expect(ShaderChunks.noise.simplex2D).toContain('simplex2D');
            expect(ShaderChunks.noise.simplex3D).toContain('simplex3D');
            expect(ShaderChunks.noise.perlin2D).toContain('perlin2D');
            expect(ShaderChunks.noise.worley).toContain('worley');
            expect(ShaderChunks.noise.fbm).toContain('fbm');
        });

        it('should have lighting chunks', () => {
            expect(ShaderChunks.lighting).toBeDefined();
            expect(ShaderChunks.lighting.toon).toContain('toonShading');
            expect(ShaderChunks.lighting.fresnel).toContain('fresnel');
            expect(ShaderChunks.lighting.rim).toContain('rimLight');
            expect(ShaderChunks.lighting.specular).toContain('blinnPhong');
        });

        it('should have UV chunks', () => {
            expect(ShaderChunks.uv).toBeDefined();
            expect(ShaderChunks.uv.triplanar).toContain('triplanarBlend');
            expect(ShaderChunks.uv.parallax).toContain('parallaxMapping');
            expect(ShaderChunks.uv.distortion).toContain('waveDistort');
        });

        it('should have color chunks', () => {
            expect(ShaderChunks.color).toBeDefined();
            expect(ShaderChunks.color.palette).toContain('palette');
            expect(ShaderChunks.color.gradient).toContain('gradient2');
            expect(ShaderChunks.color.posterize).toContain('posterize');
            expect(ShaderChunks.color.hsv).toContain('rgb2hsv');
        });

        it('should have animation chunks', () => {
            expect(ShaderChunks.animation).toBeDefined();
            expect(ShaderChunks.animation.time).toContain('pulse');
            expect(ShaderChunks.animation.easing).toContain('easeInQuad');
        });

        it('should have effects chunks', () => {
            expect(ShaderChunks.effects).toBeDefined();
            expect(ShaderChunks.effects.scanline).toContain('scanline');
            expect(ShaderChunks.effects.glitch).toContain('glitchOffset');
            expect(ShaderChunks.effects.hologram).toContain('hologramScanline');
            expect(ShaderChunks.effects.dissolve).toContain('dissolveEdge');
        });
    });

    describe('Uniform creators', () => {
        it('should create time uniform', () => {
            const uniform = createTimeUniform();
            expect(uniform.value).toBe(0);
        });

        it('should create progress uniform', () => {
            const uniform = createProgressUniform(0.5);
            expect(uniform.value).toBe(0.5);
        });

        it('should clamp progress uniform', () => {
            const uniformHigh = createProgressUniform(1.5);
            expect(uniformHigh.value).toBe(1);

            const uniformLow = createProgressUniform(-0.5);
            expect(uniformLow.value).toBe(0);
        });

        it('should create color uniform', () => {
            const uniform = createColorUniform(1, 0.5, 0);
            expect(uniform.value).toEqual([1, 0.5, 0]);
        });

        it('should create vector2 uniform', () => {
            const uniform = createVector2Uniform(2, 3);
            expect(uniform.value).toEqual([2, 3]);
        });

        it('should create vector3 uniform', () => {
            const uniform = createVector3Uniform(1, 2, 3);
            expect(uniform.value).toEqual([1, 2, 3]);
        });
    });

    describe('Shader composition', () => {
        it('should compose shader chunks', () => {
            const result = composeShaderChunks('chunk1', 'chunk2', 'chunk3');
            expect(result).toBe('chunk1\n\nchunk2\n\nchunk3');
        });

        it('should build vertex shader', () => {
            const shader = buildVertexShader({
                uniforms: 'uniform float uTime;',
                varyings: 'varying vec2 vUv;',
                main: 'gl_Position = vec4(0.0);',
            });
            expect(shader).toContain('uniform float uTime');
            expect(shader).toContain('varying vec2 vUv');
            expect(shader).toContain('void main()');
        });

        it('should build fragment shader', () => {
            const shader = buildFragmentShader({
                uniforms: 'uniform vec3 uColor;',
                main: 'gl_FragColor = vec4(uColor, 1.0);',
            });
            expect(shader).toContain('precision highp float');
            expect(shader).toContain('uniform vec3 uColor');
            expect(shader).toContain('void main()');
        });
    });

    describe('Pre-composed snippets', () => {
        it('should have noise snippet', () => {
            expect(noiseSnippet).toContain('rand');
            expect(noiseSnippet).toContain('simplex2D');
            expect(noiseSnippet).toContain('fbm');
        });

        it('should have lighting snippet', () => {
            expect(lightingSnippet).toContain('toonShading');
            expect(lightingSnippet).toContain('fresnel');
            expect(lightingSnippet).toContain('rimLight');
        });

        it('should have color snippet', () => {
            expect(colorSnippet).toContain('palette');
            expect(colorSnippet).toContain('gradient2');
            expect(colorSnippet).toContain('posterize');
        });

        it('should have animation snippet', () => {
            expect(animationSnippet).toContain('pulse');
            expect(animationSnippet).toContain('easeInQuad');
        });
    });
});

describe('Shader Materials', () => {
    describe('createToonMaterial', () => {
        it('should create toon material with defaults', () => {
            const material = createToonMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uColor).toBeDefined();
            expect(material.uniforms.uLevels).toBeDefined();
            expect(material.uniforms.uRimColor).toBeDefined();
        });

        it('should create toon material with custom options', () => {
            const material = createToonMaterial({
                color: 0xff0000,
                levels: 5,
                rimColor: 0x00ff00,
            });
            expect(material.uniforms.uLevels.value).toBe(5);
        });
    });

    describe('createHologramMaterial', () => {
        it('should create hologram material with defaults', () => {
            const material = createHologramMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uTime).toBeDefined();
            expect(material.uniforms.uScanlineIntensity).toBeDefined();
            expect(material.transparent).toBe(true);
        });

        it('should create hologram material with custom options', () => {
            const material = createHologramMaterial({
                scanlineDensity: 200,
                flickerSpeed: 2,
            });
            expect(material.uniforms.uScanlineDensity.value).toBe(200);
            expect(material.uniforms.uFlickerSpeed.value).toBe(2);
        });
    });

    describe('createDissolveMaterial', () => {
        it('should create dissolve material with defaults', () => {
            const material = createDissolveMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uProgress).toBeDefined();
            expect(material.uniforms.uEdgeColor).toBeDefined();
        });

        it('should create dissolve material with custom progress', () => {
            const material = createDissolveMaterial({ progress: 0.5 });
            expect(material.uniforms.uProgress.value).toBe(0.5);
        });
    });

    describe('createForcefieldMaterial', () => {
        it('should create forcefield material with defaults', () => {
            const material = createForcefieldMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uHexagonScale).toBeDefined();
            expect(material.uniforms.uHitPoint).toBeDefined();
            expect(material.transparent).toBe(true);
        });
    });

    describe('createGlitchMaterial', () => {
        it('should create glitch material with defaults', () => {
            const material = createGlitchMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uGlitchIntensity).toBeDefined();
            expect(material.uniforms.uRGBShiftAmount).toBeDefined();
        });
    });

    describe('createCrystalMaterial', () => {
        it('should create crystal material with defaults', () => {
            const material = createCrystalMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uFresnelPower).toBeDefined();
            expect(material.uniforms.uRainbowIntensity).toBeDefined();
            expect(material.transparent).toBe(true);
        });
    });

    describe('createOutlineMaterial', () => {
        it('should create outline material with defaults', () => {
            const material = createOutlineMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uOutlineWidth).toBeDefined();
            expect(material.side).toBe(THREE.BackSide);
        });
    });

    describe('createGradientMaterial', () => {
        it('should create gradient material with defaults', () => {
            const material = createGradientMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uColorStart).toBeDefined();
            expect(material.uniforms.uColorEnd).toBeDefined();
            expect(material.uniforms.uDirection).toBeDefined();
        });

        it('should handle different directions', () => {
            const vertMaterial = createGradientMaterial({ direction: 'vertical' });
            expect(vertMaterial.uniforms.uDirection.value).toBe(0);

            const horizMaterial = createGradientMaterial({ direction: 'horizontal' });
            expect(horizMaterial.uniforms.uDirection.value).toBe(1);

            const radialMaterial = createGradientMaterial({ direction: 'radial' });
            expect(radialMaterial.uniforms.uDirection.value).toBe(2);
        });
    });

    describe('createScanlineMaterial', () => {
        it('should create scanline material with defaults', () => {
            const material = createScanlineMaterial();
            expect(material).toBeInstanceOf(THREE.ShaderMaterial);
            expect(material.uniforms.uScanlineDensity).toBeDefined();
            expect(material.uniforms.uCurvature).toBeDefined();
        });
    });
});

describe('Shader Presets', () => {
    describe('Toon presets', () => {
        it('should have required presets', () => {
            expect(toonPresets.anime).toBeDefined();
            expect(toonPresets.comic).toBeDefined();
            expect(toonPresets.minimal).toBeDefined();
        });

        it('should get preset by name', () => {
            const anime = getToonPreset('anime');
            expect(anime.name).toBe('Anime');
            expect(anime.levels).toBeDefined();
        });

        it('should return default for unknown preset', () => {
            const preset = getToonPreset('unknown' as any);
            expect(preset).toBe(toonPresets.anime);
        });
    });

    describe('Hologram presets', () => {
        it('should have required presets', () => {
            expect(hologramPresets.blue).toBeDefined();
            expect(hologramPresets.red).toBeDefined();
            expect(hologramPresets.matrix).toBeDefined();
        });

        it('should get preset by name', () => {
            const blue = getHologramPreset('blue');
            expect(blue.name).toBe('Blue Hologram');
        });
    });

    describe('Dissolve presets', () => {
        it('should have required presets', () => {
            expect(dissolvePresets.fire).toBeDefined();
            expect(dissolvePresets.ice).toBeDefined();
            expect(dissolvePresets.magic).toBeDefined();
        });

        it('should get preset by name', () => {
            const fire = getDissolvePreset('fire');
            expect(fire.name).toBe('Fire');
            expect(fire.edgeColor).toBeDefined();
        });
    });

    describe('Forcefield presets', () => {
        it('should have presets', () => {
            expect(forcefieldPresets.scifi).toBeDefined();
            expect(forcefieldPresets.magic).toBeDefined();
        });

        it('should get preset by name', () => {
            const scifi = getForcefieldPreset('scifi');
            expect(scifi.hexagonScale).toBeDefined();
        });
    });

    describe('Glitch presets', () => {
        it('should have presets', () => {
            expect(glitchPresets.subtle).toBeDefined();
            expect(glitchPresets.moderate).toBeDefined();
            expect(glitchPresets.extreme).toBeDefined();
        });

        it('should get preset by name', () => {
            const extreme = getGlitchPreset('extreme');
            expect(extreme.glitchIntensity).toBeGreaterThan(0);
        });
    });

    describe('Crystal presets', () => {
        it('should have presets', () => {
            expect(crystalPresets.diamond).toBeDefined();
            expect(crystalPresets.ruby).toBeDefined();
            expect(crystalPresets.emerald).toBeDefined();
        });

        it('should get preset by name', () => {
            const diamond = getCrystalPreset('diamond');
            expect(diamond.name).toBe('Diamond');
        });
    });

    describe('Gradient presets', () => {
        it('should have presets', () => {
            expect(gradientPresets.sunset).toBeDefined();
            expect(gradientPresets.ocean).toBeDefined();
            expect(gradientPresets.forest).toBeDefined();
        });

        it('should get preset by name', () => {
            const sunset = getGradientPreset('sunset');
            expect(sunset.colorStart).toBeDefined();
        });
    });

    describe('Scanline presets', () => {
        it('should have presets', () => {
            expect(scanlinePresets.crt).toBeDefined();
            expect(scanlinePresets.retro).toBeDefined();
        });

        it('should get preset by name', () => {
            const crt = getScanlinePreset('crt');
            expect(crt.scanlineDensity).toBeDefined();
        });
    });

    describe('Color palettes', () => {
        it('should have required palettes', () => {
            expect(colorPalettes.sunset).toBeDefined();
            expect(colorPalettes.forest).toBeDefined();
            expect(colorPalettes.ocean).toBeDefined();
        });

        it('should get palette by name', () => {
            const sunset = getColorPalette('sunset');
            expect(sunset.name).toBe('Sunset');
            expect(sunset.colors.length).toBeGreaterThan(0);
        });

        it('should have correct color format', () => {
            Object.values(colorPalettes).forEach((palette) => {
                palette.colors.forEach((color) => {
                    expect(typeof color).toBe('number');
                    expect(color).toBeGreaterThanOrEqual(0);
                    expect(color).toBeLessThanOrEqual(0xffffff);
                });
            });
        });
    });
});
