import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    AudioManager,
    DistanceModel,
    EnvironmentType,
    AudioSourceConfig,
    AudioManagerConfig,
    EnvironmentConfig,
    createAudioManager,
} from '../core/audio';

const mockAudioContext = {
    createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 1, linearRampToValueAtTime: vi.fn() },
    })),
    createPanner: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        setPosition: vi.fn(),
        setOrientation: vi.fn(),
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
        orientationX: { value: 0 },
        orientationY: { value: 0 },
        orientationZ: { value: 0 },
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 1,
        coneInnerAngle: 360,
        coneOuterAngle: 360,
        coneOuterGain: 0,
    })),
    createBufferSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        onended: null,
    })),
    createBiquadFilter: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'lowpass',
        frequency: { value: 1000 },
    })),
    createConvolver: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        buffer: null,
    })),
    createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(48000)),
    })),
    destination: {},
    listener: {
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
        forwardX: { value: 0 },
        forwardY: { value: 0 },
        forwardZ: { value: -1 },
        upX: { value: 0 },
        upY: { value: 1 },
        upZ: { value: 0 },
        setPosition: vi.fn(),
        setOrientation: vi.fn(),
    },
    sampleRate: 48000,
    currentTime: 0,
    state: 'running',
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    decodeAudioData: vi.fn(() => Promise.resolve({})),
};

vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));

describe('AudioManager', () => {
    describe('instantiation', () => {
        it('should create AudioManager with defaults', () => {
            const manager = new AudioManager();
            expect(manager).toBeDefined();
        });

        it('should create AudioManager with custom config', () => {
            const manager = new AudioManager({
                maxSounds: 16,
                defaultDistanceModel: 'linear',
            });
            expect(manager).toBeDefined();
        });
    });

    describe('volume control', () => {
        it('should set master volume', () => {
            const manager = new AudioManager();
            manager.setMasterVolume(0.5);
            expect(manager.getMasterVolume()).toBeCloseTo(0.5, 2);
        });

        it('should clamp master volume to 0-1', () => {
            const manager = new AudioManager();
            manager.setMasterVolume(1.5);
            expect(manager.getMasterVolume()).toBeLessThanOrEqual(1);
            manager.setMasterVolume(-0.5);
            expect(manager.getMasterVolume()).toBeGreaterThanOrEqual(0);
        });
    });

    describe('listener', () => {
        it('should set listener position', () => {
            const manager = new AudioManager();
            expect(() => manager.setListenerPosition(1, 2, 3)).not.toThrow();
        });

        it('should set listener orientation', () => {
            const manager = new AudioManager();
            expect(() => manager.setListenerOrientation(0, 0, -1, 0, 1, 0)).not.toThrow();
        });

        it('should get listener position', () => {
            const manager = new AudioManager();
            manager.setListenerPosition(5, 10, 15);
            const pos = manager.getListenerPosition();
            expect(pos).toBeInstanceOf(THREE.Vector3);
        });
    });

    describe('environment', () => {
        it('should set environment', () => {
            const manager = new AudioManager();
            expect(() => manager.setEnvironment({
                type: 'cave',
                reverb: { decay: 3, wet: 0.5 },
            })).not.toThrow();
        });

        it('should get environment node', () => {
            const manager = new AudioManager();
            const node = manager.getEnvironmentNode();
            expect(node).toBeDefined();
        });
    });

    describe('sound management', () => {
        it('should play sound by id', () => {
            const manager = new AudioManager();
            expect(() => manager.playSound('test')).not.toThrow();
        });

        it('should stop sound by id', () => {
            const manager = new AudioManager();
            expect(() => manager.stopSound('test')).not.toThrow();
        });

        it('should play ambient by id', () => {
            const manager = new AudioManager();
            expect(() => manager.playAmbient('ambient')).not.toThrow();
        });

        it('should stop ambient by id', () => {
            const manager = new AudioManager();
            expect(() => manager.stopAmbient('ambient')).not.toThrow();
        });

        it('should stop all sounds', () => {
            const manager = new AudioManager();
            expect(() => manager.stopAll()).not.toThrow();
        });
    });

    describe('context management', () => {
        it('should resume audio context', async () => {
            const manager = new AudioManager();
            await expect(manager.resume()).resolves.not.toThrow();
        });

        it('should suspend audio context', () => {
            const manager = new AudioManager();
            expect(() => manager.suspend()).not.toThrow();
        });

        it('should get audio context', () => {
            const manager = new AudioManager();
            const context = manager.getContext();
            expect(context).toBeDefined();
        });
    });

    describe('dispose', () => {
        it('should dispose all resources', () => {
            const manager = new AudioManager();
            expect(() => manager.dispose()).not.toThrow();
        });
    });
});

describe('DistanceModel types', () => {
    it('should accept linear model', () => {
        const model: DistanceModel = 'linear';
        expect(model).toBe('linear');
    });

    it('should accept inverse model', () => {
        const model: DistanceModel = 'inverse';
        expect(model).toBe('inverse');
    });

    it('should accept exponential model', () => {
        const model: DistanceModel = 'exponential';
        expect(model).toBe('exponential');
    });
});

describe('EnvironmentType types', () => {
    it('should accept outdoor type', () => {
        const type: EnvironmentType = 'outdoor';
        expect(type).toBe('outdoor');
    });

    it('should accept indoor type', () => {
        const type: EnvironmentType = 'indoor';
        expect(type).toBe('indoor');
    });

    it('should accept cave type', () => {
        const type: EnvironmentType = 'cave';
        expect(type).toBe('cave');
    });

    it('should accept underwater type', () => {
        const type: EnvironmentType = 'underwater';
        expect(type).toBe('underwater');
    });

    it('should accept none type', () => {
        const type: EnvironmentType = 'none';
        expect(type).toBe('none');
    });
});

describe('AudioSourceConfig interface', () => {
    it('should create config with all options', () => {
        const config: AudioSourceConfig = {
            url: '/sounds/test.mp3',
            loop: true,
            volume: 0.8,
            playbackRate: 1.0,
            refDistance: 1,
            maxDistance: 100,
            rolloffFactor: 1,
            distanceModel: 'inverse',
        };
        expect(config.url).toBe('/sounds/test.mp3');
        expect(config.loop).toBe(true);
    });
});

describe('EnvironmentConfig interface', () => {
    it('should create config with all options', () => {
        const config: EnvironmentConfig = {
            type: 'cave',
            reverb: {
                decay: 3,
                preDelay: 0.02,
                wet: 0.6,
                dry: 0.4,
            },
            lowpassFrequency: 2000,
            highpassFrequency: 100,
        };
        expect(config.type).toBe('cave');
        expect(config.reverb?.decay).toBe(3);
    });
});

describe('AudioManagerConfig interface', () => {
    it('should create config with all options', () => {
        const config: AudioManagerConfig = {
            maxSounds: 32,
            defaultDistanceModel: 'inverse',
            defaultRefDistance: 1,
            defaultMaxDistance: 1000,
            defaultRolloffFactor: 1,
            enableHRTF: true,
        };
        expect(config.maxSounds).toBe(32);
        expect(config.enableHRTF).toBe(true);
    });
});

describe('createAudioManager', () => {
    it('should create manager with factory function', () => {
        const manager = createAudioManager();
        expect(manager).toBeInstanceOf(AudioManager);
    });

    it('should create manager with config', () => {
        const manager = createAudioManager({
            maxSounds: 16,
        });
        expect(manager).toBeInstanceOf(AudioManager);
    });
});

describe('Environment Types', () => {
    it('should define outdoor type', () => {
        const env: EnvironmentConfig = { type: 'outdoor' };
        expect(env.type).toBe('outdoor');
    });

    it('should define indoor type', () => {
        const env: EnvironmentConfig = { type: 'indoor' };
        expect(env.type).toBe('indoor');
    });

    it('should define cave type', () => {
        const env: EnvironmentConfig = { type: 'cave' };
        expect(env.type).toBe('cave');
    });
});
