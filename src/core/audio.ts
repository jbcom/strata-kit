/**
 * Core Audio System
 *
 * Spatial audio with Web Audio API, HRTF panning, distance models,
 * reverb/echo effects, and sound pooling.
 */

import * as THREE from 'three';

export type DistanceModel = 'linear' | 'inverse' | 'exponential';

export type EnvironmentType = 'outdoor' | 'indoor' | 'cave' | 'underwater' | 'none';

export interface AudioSourceConfig {
    url: string;
    loop?: boolean;
    volume?: number;
    playbackRate?: number;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: DistanceModel;
    coneInnerAngle?: number;
    coneOuterAngle?: number;
    coneOuterGain?: number;
}

export interface ReverbConfig {
    decay?: number;
    preDelay?: number;
    wet?: number;
    dry?: number;
}

export interface EnvironmentConfig {
    type: EnvironmentType;
    reverb?: ReverbConfig;
    lowpassFrequency?: number;
    highpassFrequency?: number;
}

export interface SoundPoolConfig {
    url: string;
    poolSize: number;
    config?: Partial<AudioSourceConfig>;
}

export interface AudioManagerConfig {
    maxSounds?: number;
    defaultDistanceModel?: DistanceModel;
    defaultRefDistance?: number;
    defaultMaxDistance?: number;
    defaultRolloffFactor?: number;
    enableHRTF?: boolean;
}

const DEFAULT_CONFIG: Required<AudioManagerConfig> = {
    maxSounds: 32,
    defaultDistanceModel: 'inverse',
    defaultRefDistance: 1,
    defaultMaxDistance: 10000,
    defaultRolloffFactor: 1,
    enableHRTF: true,
};

export class AudioSource {
    private context: AudioContext;
    private buffer: AudioBuffer | null = null;
    private source: AudioBufferSourceNode | null = null;
    private gainNode: GainNode;
    private panner: PannerNode;
    private config: AudioSourceConfig;
    private isPlaying = false;
    private startTime = 0;
    private pauseTime = 0;

    constructor(context: AudioContext, config: AudioSourceConfig, destination: AudioNode) {
        this.context = context;
        this.config = config;

        this.gainNode = context.createGain();
        this.gainNode.gain.value = config.volume ?? 1;

        this.panner = context.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = config.distanceModel ?? 'inverse';
        this.panner.refDistance = config.refDistance ?? 1;
        this.panner.maxDistance = config.maxDistance ?? 10000;
        this.panner.rolloffFactor = config.rolloffFactor ?? 1;
        this.panner.coneInnerAngle = config.coneInnerAngle ?? 360;
        this.panner.coneOuterAngle = config.coneOuterAngle ?? 360;
        this.panner.coneOuterGain = config.coneOuterGain ?? 0;

        this.panner.connect(this.gainNode);
        this.gainNode.connect(destination);
    }

    async load(): Promise<void> {
        const response = await fetch(this.config.url);
        const arrayBuffer = await response.arrayBuffer();
        this.buffer = await this.context.decodeAudioData(arrayBuffer);
    }

    setBuffer(buffer: AudioBuffer): void {
        this.buffer = buffer;
    }

    play(offset = 0): void {
        if (!this.buffer || this.isPlaying) return;

        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = this.config.loop ?? false;
        this.source.playbackRate.value = this.config.playbackRate ?? 1;
        this.source.connect(this.panner);

        this.source.onended = () => {
            if (!this.config.loop) {
                this.isPlaying = false;
            }
        };

        this.startTime = this.context.currentTime - offset;
        this.source.start(0, offset);
        this.isPlaying = true;
    }

    pause(): void {
        if (!this.isPlaying || !this.source) return;

        this.pauseTime = this.context.currentTime - this.startTime;
        this.source.stop();
        this.source.disconnect();
        this.source = null;
        this.isPlaying = false;
    }

    resume(): void {
        if (this.isPlaying) return;
        this.play(this.pauseTime);
    }

    stop(): void {
        if (!this.source) return;

        this.source.stop();
        this.source.disconnect();
        this.source = null;
        this.isPlaying = false;
        this.pauseTime = 0;
    }

    setPosition(x: number, y: number, z: number): void {
        if (this.panner.positionX) {
            this.panner.positionX.value = x;
            this.panner.positionY.value = y;
            this.panner.positionZ.value = z;
        } else {
            this.panner.setPosition(x, y, z);
        }
    }

    setOrientation(x: number, y: number, z: number): void {
        if (this.panner.orientationX) {
            this.panner.orientationX.value = x;
            this.panner.orientationY.value = y;
            this.panner.orientationZ.value = z;
        } else {
            this.panner.setOrientation(x, y, z);
        }
    }

    setVolume(volume: number, fadeTime = 0): void {
        if (fadeTime > 0) {
            this.gainNode.gain.linearRampToValueAtTime(volume, this.context.currentTime + fadeTime);
        } else {
            this.gainNode.gain.value = volume;
        }
    }

    setPlaybackRate(rate: number): void {
        if (this.source) {
            this.source.playbackRate.value = rate;
        }
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    dispose(): void {
        this.stop();
        this.gainNode.disconnect();
        this.panner.disconnect();
    }
}

export class AmbientSource {
    private context: AudioContext;
    private buffer: AudioBuffer | null = null;
    private source: AudioBufferSourceNode | null = null;
    private gainNode: GainNode;
    private config: { url: string; loop: boolean; volume: number };
    private isPlaying = false;

    constructor(context: AudioContext, url: string, destination: AudioNode, volume = 1, loop = true) {
        this.context = context;
        this.config = { url, loop, volume };

        this.gainNode = context.createGain();
        this.gainNode.gain.value = volume;
        this.gainNode.connect(destination);
    }

    async load(): Promise<void> {
        const response = await fetch(this.config.url);
        const arrayBuffer = await response.arrayBuffer();
        this.buffer = await this.context.decodeAudioData(arrayBuffer);
    }

    setBuffer(buffer: AudioBuffer): void {
        this.buffer = buffer;
    }

    play(): void {
        if (!this.buffer || this.isPlaying) return;

        this.source = this.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = this.config.loop;
        this.source.connect(this.gainNode);

        this.source.onended = () => {
            if (!this.config.loop) {
                this.isPlaying = false;
            }
        };

        this.source.start();
        this.isPlaying = true;
    }

    stop(): void {
        if (!this.source) return;

        this.source.stop();
        this.source.disconnect();
        this.source = null;
        this.isPlaying = false;
    }

    fadeIn(duration: number): void {
        if (!this.buffer) return;

        this.gainNode.gain.value = 0;
        this.play();
        this.gainNode.gain.linearRampToValueAtTime(this.config.volume, this.context.currentTime + duration);
    }

    fadeOut(duration: number): void {
        this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + duration);
        setTimeout(() => this.stop(), duration * 1000);
    }

    setVolume(volume: number, fadeTime = 0): void {
        this.config.volume = volume;
        if (fadeTime > 0) {
            this.gainNode.gain.linearRampToValueAtTime(volume, this.context.currentTime + fadeTime);
        } else {
            this.gainNode.gain.value = volume;
        }
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    dispose(): void {
        this.stop();
        this.gainNode.disconnect();
    }
}

export class SoundPool {
    private context: AudioContext;
    private buffers: AudioBuffer[] = [];
    private sources: AudioSource[] = [];
    private currentIndex = 0;
    private destination: AudioNode;
    private config: SoundPoolConfig;

    constructor(context: AudioContext, config: SoundPoolConfig, destination: AudioNode) {
        this.context = context;
        this.config = config;
        this.destination = destination;

        for (let i = 0; i < config.poolSize; i++) {
            const source = new AudioSource(context, { url: config.url, ...config.config }, destination);
            this.sources.push(source);
        }
    }

    async load(): Promise<void> {
        const response = await fetch(this.config.url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(arrayBuffer);

        for (const source of this.sources) {
            source.setBuffer(buffer);
        }
    }

    play(position?: THREE.Vector3): AudioSource | null {
        const source = this.sources[this.currentIndex];
        if (source.getIsPlaying()) {
            source.stop();
        }

        if (position) {
            source.setPosition(position.x, position.y, position.z);
        }

        source.play();
        this.currentIndex = (this.currentIndex + 1) % this.sources.length;
        return source;
    }

    stopAll(): void {
        for (const source of this.sources) {
            source.stop();
        }
    }

    dispose(): void {
        for (const source of this.sources) {
            source.dispose();
        }
        this.sources = [];
    }
}

export class ReverbEffect {
    private context: AudioContext;
    private convolver: ConvolverNode;
    private wetGain: GainNode;
    private dryGain: GainNode;
    private inputNode: GainNode;
    private outputNode: GainNode;

    constructor(context: AudioContext, config: ReverbConfig = {}) {
        this.context = context;

        this.inputNode = context.createGain();
        this.outputNode = context.createGain();
        this.convolver = context.createConvolver();
        this.wetGain = context.createGain();
        this.dryGain = context.createGain();

        this.wetGain.gain.value = config.wet ?? 0.3;
        this.dryGain.gain.value = config.dry ?? 0.7;

        this.inputNode.connect(this.convolver);
        this.inputNode.connect(this.dryGain);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.outputNode);
        this.dryGain.connect(this.outputNode);

        this.generateImpulseResponse(config.decay ?? 2, config.preDelay ?? 0.01);
    }

    private generateImpulseResponse(decay: number, preDelay: number): void {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * decay;
        const impulse = this.context.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            const preDelaySamples = Math.floor(preDelay * sampleRate);

            for (let i = 0; i < length; i++) {
                if (i < preDelaySamples) {
                    channelData[i] = 0;
                } else {
                    const t = (i - preDelaySamples) / sampleRate;
                    channelData[i] = (Math.random() * 2 - 1) * Math.exp(-3 * t / decay);
                }
            }
        }

        this.convolver.buffer = impulse;
    }

    getInput(): GainNode {
        return this.inputNode;
    }

    getOutput(): GainNode {
        return this.outputNode;
    }

    setWetDry(wet: number, dry: number): void {
        this.wetGain.gain.value = wet;
        this.dryGain.gain.value = dry;
    }

    dispose(): void {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
        this.convolver.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();
    }
}

export class EnvironmentEffect {
    private context: AudioContext;
    private inputNode: GainNode;
    private outputNode: GainNode;
    private lowpassFilter: BiquadFilterNode | null = null;
    private highpassFilter: BiquadFilterNode | null = null;
    private reverb: ReverbEffect | null = null;
    private config: EnvironmentConfig;

    constructor(context: AudioContext, config: EnvironmentConfig) {
        this.context = context;
        this.config = config;

        this.inputNode = context.createGain();
        this.outputNode = context.createGain();

        this.applyEnvironment(config);
    }

    private applyEnvironment(config: EnvironmentConfig): void {
        this.dispose();

        this.inputNode = this.context.createGain();
        this.outputNode = this.context.createGain();

        let currentNode: AudioNode = this.inputNode;

        if (config.lowpassFrequency) {
            this.lowpassFilter = this.context.createBiquadFilter();
            this.lowpassFilter.type = 'lowpass';
            this.lowpassFilter.frequency.value = config.lowpassFrequency;
            currentNode.connect(this.lowpassFilter);
            currentNode = this.lowpassFilter;
        }

        if (config.highpassFrequency) {
            this.highpassFilter = this.context.createBiquadFilter();
            this.highpassFilter.type = 'highpass';
            this.highpassFilter.frequency.value = config.highpassFrequency;
            currentNode.connect(this.highpassFilter);
            currentNode = this.highpassFilter;
        }

        if (config.reverb && config.type !== 'none') {
            this.reverb = new ReverbEffect(this.context, config.reverb);
            currentNode.connect(this.reverb.getInput());
            this.reverb.getOutput().connect(this.outputNode);
        } else {
            currentNode.connect(this.outputNode);
        }
    }

    setEnvironment(config: EnvironmentConfig): void {
        this.config = config;
        this.applyEnvironment(config);
    }

    getInput(): GainNode {
        return this.inputNode;
    }

    getOutput(): GainNode {
        return this.outputNode;
    }

    dispose(): void {
        this.inputNode.disconnect();
        this.outputNode.disconnect();
        this.lowpassFilter?.disconnect();
        this.highpassFilter?.disconnect();
        this.reverb?.dispose();
        this.lowpassFilter = null;
        this.highpassFilter = null;
        this.reverb = null;
    }
}

export class AudioManager {
    private context: AudioContext;
    private masterGain: GainNode;
    private listener: AudioListener | null = null;
    private sources: Map<string, AudioSource> = new Map();
    private ambientSources: Map<string, AmbientSource> = new Map();
    private soundPools: Map<string, SoundPool> = new Map();
    private bufferCache: Map<string, AudioBuffer> = new Map();
    private environment: EnvironmentEffect | null = null;
    private config: Required<AudioManagerConfig>;
    private listenerPosition: THREE.Vector3 = new THREE.Vector3();
    private listenerOrientation: { forward: THREE.Vector3; up: THREE.Vector3 } = {
        forward: new THREE.Vector3(0, 0, -1),
        up: new THREE.Vector3(0, 1, 0),
    };

    constructor(config: AudioManagerConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
    }

    async resume(): Promise<void> {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    suspend(): void {
        this.context.suspend();
    }

    setMasterVolume(volume: number): void {
        this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }

    getMasterVolume(): number {
        return this.masterGain.gain.value;
    }

    setListenerPosition(x: number, y: number, z: number): void {
        this.listenerPosition.set(x, y, z);
        const listener = this.context.listener;

        if (listener.positionX) {
            listener.positionX.value = x;
            listener.positionY.value = y;
            listener.positionZ.value = z;
        } else {
            listener.setPosition(x, y, z);
        }
    }

    setListenerOrientation(forwardX: number, forwardY: number, forwardZ: number, upX: number, upY: number, upZ: number): void {
        this.listenerOrientation.forward.set(forwardX, forwardY, forwardZ);
        this.listenerOrientation.up.set(upX, upY, upZ);
        const listener = this.context.listener;

        if (listener.forwardX) {
            listener.forwardX.value = forwardX;
            listener.forwardY.value = forwardY;
            listener.forwardZ.value = forwardZ;
            listener.upX.value = upX;
            listener.upY.value = upY;
            listener.upZ.value = upZ;
        } else {
            listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
        }
    }

    setEnvironment(config: EnvironmentConfig): void {
        if (this.environment) {
            this.environment.dispose();
        }

        this.environment = new EnvironmentEffect(this.context, config);
        this.environment.getOutput().connect(this.masterGain);
    }

    getEnvironmentNode(): AudioNode {
        return this.environment?.getInput() ?? this.masterGain;
    }

    async loadBuffer(url: string): Promise<AudioBuffer> {
        if (this.bufferCache.has(url)) {
            return this.bufferCache.get(url)!;
        }

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(arrayBuffer);
        this.bufferCache.set(url, buffer);
        return buffer;
    }

    async createPositionalSound(id: string, config: AudioSourceConfig): Promise<AudioSource> {
        const destination = this.getEnvironmentNode();
        const source = new AudioSource(this.context, config, destination);

        const buffer = await this.loadBuffer(config.url);
        source.setBuffer(buffer);

        this.sources.set(id, source);
        return source;
    }

    async createAmbientSound(id: string, url: string, volume = 1, loop = true): Promise<AmbientSource> {
        const destination = this.getEnvironmentNode();
        const source = new AmbientSource(this.context, url, destination, volume, loop);

        const buffer = await this.loadBuffer(url);
        source.setBuffer(buffer);

        this.ambientSources.set(id, source);
        return source;
    }

    async createSoundPool(id: string, config: SoundPoolConfig): Promise<SoundPool> {
        const destination = this.getEnvironmentNode();
        const pool = new SoundPool(this.context, config, destination);
        await pool.load();

        this.soundPools.set(id, pool);
        return pool;
    }

    getSource(id: string): AudioSource | undefined {
        return this.sources.get(id);
    }

    getAmbientSource(id: string): AmbientSource | undefined {
        return this.ambientSources.get(id);
    }

    getSoundPool(id: string): SoundPool | undefined {
        return this.soundPools.get(id);
    }

    playSound(id: string): void {
        const source = this.sources.get(id);
        source?.play();
    }

    stopSound(id: string): void {
        const source = this.sources.get(id);
        source?.stop();
    }

    playAmbient(id: string): void {
        const source = this.ambientSources.get(id);
        source?.play();
    }

    stopAmbient(id: string): void {
        const source = this.ambientSources.get(id);
        source?.stop();
    }

    playSoundFromPool(poolId: string, position?: THREE.Vector3): AudioSource | null {
        const pool = this.soundPools.get(poolId);
        return pool?.play(position) ?? null;
    }

    removeSource(id: string): void {
        const source = this.sources.get(id);
        if (source) {
            source.dispose();
            this.sources.delete(id);
        }
    }

    removeAmbientSource(id: string): void {
        const source = this.ambientSources.get(id);
        if (source) {
            source.dispose();
            this.ambientSources.delete(id);
        }
    }

    removeSoundPool(id: string): void {
        const pool = this.soundPools.get(id);
        if (pool) {
            pool.dispose();
            this.soundPools.delete(id);
        }
    }

    stopAll(): void {
        for (const source of this.sources.values()) {
            source.stop();
        }
        for (const source of this.ambientSources.values()) {
            source.stop();
        }
        for (const pool of this.soundPools.values()) {
            pool.stopAll();
        }
    }

    getContext(): AudioContext {
        return this.context;
    }

    getListenerPosition(): THREE.Vector3 {
        return this.listenerPosition.clone();
    }

    dispose(): void {
        this.stopAll();

        for (const source of this.sources.values()) {
            source.dispose();
        }
        for (const source of this.ambientSources.values()) {
            source.dispose();
        }
        for (const pool of this.soundPools.values()) {
            pool.dispose();
        }

        this.sources.clear();
        this.ambientSources.clear();
        this.soundPools.clear();
        this.bufferCache.clear();

        this.environment?.dispose();
        this.masterGain.disconnect();
        this.context.close();
    }
}

export function createAudioManager(config?: AudioManagerConfig): AudioManager {
    return new AudioManager(config);
}

export function calculateDistanceAttenuation(
    distance: number,
    refDistance: number,
    maxDistance: number,
    rolloffFactor: number,
    model: DistanceModel
): number {
    const clampedDistance = Math.max(refDistance, Math.min(distance, maxDistance));

    switch (model) {
        case 'linear':
            return 1 - rolloffFactor * (clampedDistance - refDistance) / (maxDistance - refDistance);
        case 'inverse':
            return refDistance / (refDistance + rolloffFactor * (clampedDistance - refDistance));
        case 'exponential':
            return Math.pow(clampedDistance / refDistance, -rolloffFactor);
        default:
            return 1;
    }
}

export const environmentPresets: Record<EnvironmentType, EnvironmentConfig> = {
    outdoor: {
        type: 'outdoor',
        reverb: { decay: 0.5, wet: 0.1, dry: 0.9 },
    },
    indoor: {
        type: 'indoor',
        reverb: { decay: 1.5, wet: 0.3, dry: 0.7 },
    },
    cave: {
        type: 'cave',
        reverb: { decay: 4, preDelay: 0.05, wet: 0.5, dry: 0.5 },
        lowpassFrequency: 8000,
    },
    underwater: {
        type: 'underwater',
        reverb: { decay: 2, wet: 0.4, dry: 0.6 },
        lowpassFrequency: 1000,
        highpassFrequency: 100,
    },
    none: {
        type: 'none',
    },
};
