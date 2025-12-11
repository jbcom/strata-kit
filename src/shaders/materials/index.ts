/**
 * Custom shader materials for Strata
 * Provides reusable materials for various visual effects
 */

import * as THREE from 'three';
import { ShaderChunks, noiseSnippet, lightingSnippet, colorSnippet, animationSnippet } from '../../core/shaders';

export interface ToonMaterialOptions {
    color?: THREE.ColorRepresentation;
    outlineColor?: THREE.ColorRepresentation;
    outlineWidth?: number;
    levels?: number;
    rimColor?: THREE.ColorRepresentation;
    rimPower?: number;
}

export function createToonMaterial(options: ToonMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0xffffff,
        levels = 4,
        rimColor = 0x4488ff,
        rimPower = 2.0,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uLevels: { value: levels },
            uRimColor: { value: new THREE.Color(rimColor) },
            uRimPower: { value: rimPower },
            uLightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
        },
        vertexShader: /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uLevels;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform vec3 uLightDirection;

varying vec3 vNormal;
varying vec3 vViewDir;

${ShaderChunks.lighting.toon}
${ShaderChunks.lighting.rim}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    
    float NdotL = max(dot(normal, uLightDirection), 0.0);
    float toon = toonShading(NdotL, uLevels);
    
    vec3 toonColor = uColor * (0.3 + 0.7 * toon);
    
    float rim = rimLight(viewDir, normal, uRimPower, 0.5);
    vec3 finalColor = toonColor + uRimColor * rim;
    
    gl_FragColor = vec4(finalColor, 1.0);
}`,
    });
}

export interface HologramMaterialOptions {
    color?: THREE.ColorRepresentation;
    scanlineIntensity?: number;
    scanlineDensity?: number;
    flickerSpeed?: number;
    fresnelPower?: number;
    alpha?: number;
}

export function createHologramMaterial(options: HologramMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0x00ffff,
        scanlineIntensity = 0.5,
        scanlineDensity = 100,
        flickerSpeed = 1.0,
        fresnelPower = 2.0,
        alpha = 0.8,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uScanlineIntensity: { value: scanlineIntensity },
            uScanlineDensity: { value: scanlineDensity },
            uFlickerSpeed: { value: flickerSpeed },
            uFresnelPower: { value: fresnelPower },
            uAlpha: { value: alpha },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uScanlineIntensity;
uniform float uScanlineDensity;
uniform float uFlickerSpeed;
uniform float uFresnelPower;
uniform float uAlpha;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

${ShaderChunks.noise.rand}
${ShaderChunks.lighting.fresnel}
${ShaderChunks.effects.hologram}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    
    float scanline = hologramScanline(vWorldPos.y, uTime, uScanlineDensity);
    scanline = mix(1.0, scanline, uScanlineIntensity);
    
    float flicker = hologramFlicker(uTime * uFlickerSpeed);
    
    float fres = fresnel(viewDir, normal, uFresnelPower);
    
    vec3 finalColor = uColor * scanline * flicker;
    finalColor += uColor * fres * 0.5;
    
    float finalAlpha = uAlpha * scanline * flicker * (0.5 + fres * 0.5);
    
    gl_FragColor = vec4(finalColor, finalAlpha);
}`,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
}

export interface DissolveMaterialOptions {
    color?: THREE.ColorRepresentation;
    edgeColor?: THREE.ColorRepresentation;
    progress?: number;
    edgeWidth?: number;
    noiseScale?: number;
}

export function createDissolveMaterial(options: DissolveMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0xffffff,
        edgeColor = 0xff6600,
        progress = 0,
        edgeWidth = 0.05,
        noiseScale = 3.0,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uEdgeColor: { value: new THREE.Color(edgeColor) },
            uProgress: { value: progress },
            uEdgeWidth: { value: edgeWidth },
            uNoiseScale: { value: noiseScale },
            uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uProgress;
uniform float uEdgeWidth;
uniform float uNoiseScale;
uniform float uTime;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

${noiseSnippet}

void main() {
    float noise = simplex3D(vPosition * uNoiseScale + uTime * 0.1) * 0.5 + 0.5;
    
    if (noise < uProgress) {
        discard;
    }
    
    float edge = smoothstep(uProgress, uProgress + uEdgeWidth, noise);
    vec3 finalColor = mix(uEdgeColor, uColor, edge);
    
    float glow = 1.0 - edge;
    finalColor += uEdgeColor * glow * 2.0;
    
    gl_FragColor = vec4(finalColor, 1.0);
}`,
        transparent: true,
    });
}

export interface ForcefieldMaterialOptions {
    color?: THREE.ColorRepresentation;
    secondaryColor?: THREE.ColorRepresentation;
    fresnelPower?: number;
    pulseSpeed?: number;
    hexagonScale?: number;
    alpha?: number;
}

export function createForcefieldMaterial(options: ForcefieldMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0x00ffff,
        secondaryColor = 0x0088ff,
        fresnelPower = 3.0,
        pulseSpeed = 1.0,
        hexagonScale = 10.0,
        alpha = 0.6,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uSecondaryColor: { value: new THREE.Color(secondaryColor) },
            uFresnelPower: { value: fresnelPower },
            uPulseSpeed: { value: pulseSpeed },
            uHexagonScale: { value: hexagonScale },
            uAlpha: { value: alpha },
            uHitPoint: { value: new THREE.Vector3(0, 0, 0) },
            uHitIntensity: { value: 0 },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uFresnelPower;
uniform float uPulseSpeed;
uniform float uHexagonScale;
uniform float uAlpha;
uniform vec3 uHitPoint;
uniform float uHitIntensity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

${ShaderChunks.lighting.fresnel}
${ShaderChunks.animation.time}

float hexagon(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.73))), p.x);
}

float hexGrid(vec2 uv, float scale) {
    vec2 r = vec2(1.0, 1.73);
    vec2 h = r * 0.5;
    vec2 a = mod(uv * scale, r) - h;
    vec2 b = mod(uv * scale - h, r) - h;
    vec2 gv = length(a) < length(b) ? a : b;
    float hex = 0.5 - hexagon(gv);
    return smoothstep(0.0, 0.05, hex);
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    
    float fres = fresnel(viewDir, normal, uFresnelPower);
    
    float hex = hexGrid(vUv, uHexagonScale);
    
    float pulseWave = pulse(uTime * uPulseSpeed + vWorldPos.y * 2.0, 1.0);
    
    vec3 baseColor = mix(uSecondaryColor, uColor, fres);
    baseColor *= (0.5 + hex * 0.5);
    baseColor *= (0.8 + pulseWave * 0.2);
    
    float hitDist = distance(vWorldPos, uHitPoint);
    float hitEffect = exp(-hitDist * 3.0) * uHitIntensity;
    baseColor += vec3(1.0) * hitEffect;
    
    float finalAlpha = uAlpha * (fres * 0.5 + 0.5) * (0.5 + hex * 0.5);
    finalAlpha = max(finalAlpha, hitEffect);
    
    gl_FragColor = vec4(baseColor, finalAlpha);
}`,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
}

export interface GlitchMaterialOptions {
    color?: THREE.ColorRepresentation;
    glitchIntensity?: number;
    scanlineIntensity?: number;
    rgbShiftAmount?: number;
}

export function createGlitchMaterial(options: GlitchMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0xffffff,
        glitchIntensity = 0.1,
        scanlineIntensity = 0.3,
        rgbShiftAmount = 0.01,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uGlitchIntensity: { value: glitchIntensity },
            uScanlineIntensity: { value: scanlineIntensity },
            uRGBShiftAmount: { value: rgbShiftAmount },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
uniform float uTime;
uniform float uGlitchIntensity;

${ShaderChunks.noise.rand}

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 pos = position;
    
    float glitchTime = floor(uTime * 20.0);
    float shouldGlitch = step(0.95, rand(vec2(glitchTime)));
    pos.x += (rand(vec2(glitchTime, position.y * 10.0)) - 0.5) * uGlitchIntensity * shouldGlitch;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uGlitchIntensity;
uniform float uScanlineIntensity;
uniform float uRGBShiftAmount;

varying vec2 vUv;
varying vec3 vNormal;

${ShaderChunks.noise.rand}
${ShaderChunks.effects.scanline}

void main() {
    float glitchTime = floor(uTime * 15.0);
    float glitchTrigger = step(0.92, rand(vec2(glitchTime)));
    
    vec2 uv = vUv;
    float blockY = floor(uv.y * 20.0);
    float blockOffset = (rand(vec2(glitchTime, blockY)) - 0.5) * uGlitchIntensity * glitchTrigger;
    uv.x += blockOffset;
    
    float shift = uRGBShiftAmount * (1.0 + glitchTrigger * 3.0);
    vec3 color;
    color.r = uColor.r * (1.0 + sin(uv.x * 100.0 + uTime) * 0.1);
    color.g = uColor.g;
    color.b = uColor.b * (1.0 - sin(uv.x * 100.0 - uTime) * 0.1);
    
    float scan = 1.0 - uScanlineIntensity + sin(uv.y * 400.0 + uTime * 10.0) * uScanlineIntensity;
    color *= scan;
    
    float flicker = 0.97 + rand(vec2(glitchTime)) * 0.03;
    color *= flicker;
    
    float lines = step(0.98, rand(vec2(blockY, glitchTime))) * glitchTrigger;
    color = mix(color, vec3(1.0), lines * 0.5);
    
    gl_FragColor = vec4(color, 1.0);
}`,
    });
}

export interface CrystalMaterialOptions {
    color?: THREE.ColorRepresentation;
    refractionRatio?: number;
    fresnelPower?: number;
    rainbowIntensity?: number;
    envMapIntensity?: number;
}

export function createCrystalMaterial(options: CrystalMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0xffffff,
        fresnelPower = 4.0,
        rainbowIntensity = 0.3,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uFresnelPower: { value: fresnelPower },
            uRainbowIntensity: { value: rainbowIntensity },
        },
        vertexShader: /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vReflect;
varying vec3 vWorldPos;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vReflect = reflect(-vViewDir, vNormal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uFresnelPower;
uniform float uRainbowIntensity;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vReflect;
varying vec3 vWorldPos;

${ShaderChunks.lighting.fresnel}
${ShaderChunks.color.palette}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewDir);
    
    float fres = fresnel(viewDir, normal, uFresnelPower);
    
    float rainbow = dot(normal, vec3(1.0, 0.0, 0.0)) * 0.5 + 0.5;
    rainbow += uTime * 0.1;
    vec3 rainbowColor = rainbowPalette(rainbow);
    
    vec3 reflectColor = mix(vec3(0.5), vec3(1.0), fres);
    
    vec3 finalColor = uColor;
    finalColor = mix(finalColor, rainbowColor, uRainbowIntensity * fres);
    finalColor += reflectColor * fres * 0.5;
    
    float alpha = 0.3 + fres * 0.7;
    
    gl_FragColor = vec4(finalColor, alpha);
}`,
        transparent: true,
        side: THREE.DoubleSide,
    });
}

export interface OutlineMaterialOptions {
    color?: THREE.ColorRepresentation;
    outlineWidth?: number;
}

export function createOutlineMaterial(options: OutlineMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0x000000,
        outlineWidth = 0.03,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOutlineWidth: { value: outlineWidth },
        },
        vertexShader: /* glsl */ `
uniform float uOutlineWidth;

void main() {
    vec3 pos = position + normal * uOutlineWidth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform vec3 uColor;

void main() {
    gl_FragColor = vec4(uColor, 1.0);
}`,
        side: THREE.BackSide,
    });
}

export interface GradientMaterialOptions {
    colorStart?: THREE.ColorRepresentation;
    colorEnd?: THREE.ColorRepresentation;
    colorMiddle?: THREE.ColorRepresentation;
    direction?: 'vertical' | 'horizontal' | 'radial';
    useThreeColors?: boolean;
}

export function createGradientMaterial(options: GradientMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        colorStart = 0xff0000,
        colorEnd = 0x0000ff,
        colorMiddle = 0x00ff00,
        direction = 'vertical',
        useThreeColors = false,
    } = options;

    const directionValue = direction === 'vertical' ? 0 : direction === 'horizontal' ? 1 : 2;

    return new THREE.ShaderMaterial({
        uniforms: {
            uColorStart: { value: new THREE.Color(colorStart) },
            uColorEnd: { value: new THREE.Color(colorEnd) },
            uColorMiddle: { value: new THREE.Color(colorMiddle) },
            uDirection: { value: directionValue },
            uUseThreeColors: { value: useThreeColors ? 1.0 : 0.0 },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform vec3 uColorStart;
uniform vec3 uColorEnd;
uniform vec3 uColorMiddle;
uniform float uDirection;
uniform float uUseThreeColors;

varying vec2 vUv;
varying vec3 vPosition;

${ShaderChunks.color.gradient}

void main() {
    float t;
    if (uDirection < 0.5) {
        t = vUv.y;
    } else if (uDirection < 1.5) {
        t = vUv.x;
    } else {
        t = length(vUv - vec2(0.5)) * 2.0;
    }
    
    vec3 color;
    if (uUseThreeColors > 0.5) {
        color = gradient3(uColorStart, uColorMiddle, uColorEnd, t);
    } else {
        color = gradient2(uColorStart, uColorEnd, t);
    }
    
    gl_FragColor = vec4(color, 1.0);
}`,
    });
}

export interface ScanlineMaterialOptions {
    color?: THREE.ColorRepresentation;
    backgroundColor?: THREE.ColorRepresentation;
    scanlineDensity?: number;
    scanlineOpacity?: number;
    flickerIntensity?: number;
    curvature?: number;
}

export function createScanlineMaterial(options: ScanlineMaterialOptions = {}): THREE.ShaderMaterial {
    const {
        color = 0x00ff00,
        backgroundColor = 0x001100,
        scanlineDensity = 400,
        scanlineOpacity = 0.3,
        flickerIntensity = 0.03,
        curvature = 0.1,
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(color) },
            uBackgroundColor: { value: new THREE.Color(backgroundColor) },
            uScanlineDensity: { value: scanlineDensity },
            uScanlineOpacity: { value: scanlineOpacity },
            uFlickerIntensity: { value: flickerIntensity },
            uCurvature: { value: curvature },
        },
        vertexShader: /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBackgroundColor;
uniform float uScanlineDensity;
uniform float uScanlineOpacity;
uniform float uFlickerIntensity;
uniform float uCurvature;

varying vec2 vUv;

${ShaderChunks.noise.rand}

vec2 curveUV(vec2 uv, float curvature) {
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(curvature, curvature);
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

void main() {
    vec2 uv = vUv;
    
    if (uCurvature > 0.0) {
        uv = curveUV(uv, 1.0 / uCurvature);
    }
    
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    float scanline = sin(uv.y * uScanlineDensity) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, uScanlineOpacity);
    
    float flicker = 1.0 - uFlickerIntensity + rand(vec2(floor(uTime * 15.0))) * uFlickerIntensity;
    
    float vignette = 1.0 - length(uv - 0.5) * 0.5;
    
    vec3 color = mix(uBackgroundColor, uColor, 0.5);
    color *= scanline * flicker * vignette;
    
    gl_FragColor = vec4(color, 1.0);
}`,
    });
}

export {
    ToonMaterialOptions as ToonOptions,
    HologramMaterialOptions as HologramOptions,
    DissolveMaterialOptions as DissolveOptions,
    ForcefieldMaterialOptions as ForcefieldOptions,
    GlitchMaterialOptions as GlitchOptions,
    CrystalMaterialOptions as CrystalOptions,
    OutlineMaterialOptions as OutlineOptions,
    GradientMaterialOptions as GradientOptions,
    ScanlineMaterialOptions as ScanlineOptions,
};
