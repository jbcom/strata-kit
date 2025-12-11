/**
 * SoundManager Unit Tests
 *
 * Tests for 2D audio playback using mocked Howler.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SoundManager, createSoundManager } from '../../../src/core/audio/sound-manager';

const mockHowlInstance = {
  play: vi.fn().mockReturnValue(1),
  stop: vi.fn(),
  pause: vi.fn(),
  volume: vi.fn().mockReturnValue(1),
  mute: vi.fn(),
  playing: vi.fn().mockReturnValue(false),
  unload: vi.fn(),
  setLoop: vi.fn(),
};

vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation((config: { onload?: () => void }) => {
    if (config.onload) {
      setTimeout(() => config.onload!(), 0);
    }
    return { ...mockHowlInstance };
  }),
  Howler: {
    volume: vi.fn(),
    mute: vi.fn(),
    stop: vi.fn(),
    unload: vi.fn(),
  },
}));

describe('SoundManager', () => {
  let manager: SoundManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SoundManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('ideal case', () => {
    it('creates a sound manager with default config', () => {
      expect(manager).toBeInstanceOf(SoundManager);
      expect(manager.getMasterVolume()).toBe(1);
    });

    it('creates a sound manager with custom config', () => {
      const customManager = createSoundManager({ masterVolume: 0.5 });
      expect(customManager).toBeInstanceOf(SoundManager);
      customManager.dispose();
    });

    it('loads and plays a sound successfully', async () => {
      await manager.load('test', { src: '/audio/test.mp3' });
      const id = manager.play('test');

      expect(id).toBe(1);
      expect(mockHowlInstance.play).toHaveBeenCalled();
    });
  });

  describe('normal usage', () => {
    beforeEach(async () => {
      await manager.load('bgm', { src: '/audio/bgm.mp3', volume: 0.7, loop: true }, 'music');
      await manager.load('sfx', { src: '/audio/sfx.mp3' }, 'sfx');
    });

    it('stops a playing sound', () => {
      manager.play('bgm');
      manager.stop('bgm');

      expect(mockHowlInstance.stop).toHaveBeenCalled();
    });

    it('pauses a playing sound', () => {
      manager.play('bgm');
      manager.pause('bgm');

      expect(mockHowlInstance.pause).toHaveBeenCalled();
    });

    it('sets volume on a sound', () => {
      manager.setVolume('bgm', 0.5);

      expect(mockHowlInstance.volume).toHaveBeenCalledWith(0.5);
    });

    it('gets volume from a sound', () => {
      const volume = manager.getVolume('bgm');

      expect(volume).toBe(1);
    });

    it('mutes a specific sound', () => {
      manager.setMute('bgm', true);

      expect(mockHowlInstance.mute).toHaveBeenCalledWith(true);
    });

    it('checks if a sound is playing', () => {
      const isPlaying = manager.isPlaying('bgm');

      expect(isPlaying).toBe(false);
    });

    it('unloads a sound', () => {
      manager.unload('bgm');

      expect(mockHowlInstance.unload).toHaveBeenCalled();
    });
  });

  describe('audio bus management', () => {
    beforeEach(async () => {
      await manager.load('music1', { src: '/audio/m1.mp3', volume: 1 }, 'music');
      await manager.load('music2', { src: '/audio/m2.mp3', volume: 1 }, 'music');
    });

    it('creates a custom audio bus', () => {
      manager.createBus('ui', 0.8);

      expect(manager.getBusVolume('ui')).toBe(0.8);
    });

    it('sets volume for an audio bus', () => {
      manager.setBusVolume('music', 0.3);

      expect(manager.getBusVolume('music')).toBe(0.3);
    });

    it('mutes an audio bus', () => {
      manager.setBusMute('music', true);

      expect(mockHowlInstance.mute).toHaveBeenCalledWith(true);
    });

    it('returns undefined for non-existent bus', () => {
      const volume = manager.getBusVolume('nonexistent');

      expect(volume).toBeUndefined();
    });
  });

  describe('master volume control', () => {
    it('sets master volume', async () => {
      const { Howler } = await import('howler');

      manager.setMasterVolume(0.5);

      expect(manager.getMasterVolume()).toBe(0.5);
      expect(Howler.volume).toHaveBeenCalledWith(0.5);
    });

    it('sets global mute', async () => {
      const { Howler } = await import('howler');

      manager.setGlobalMute(true);

      expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('stops all sounds', async () => {
      const { Howler } = await import('howler');

      manager.stopAll();

      expect(Howler.stop).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('clamps volume to valid range (0-1)', () => {
      manager.setMasterVolume(1.5);
      expect(manager.getMasterVolume()).toBe(1);

      manager.setMasterVolume(-0.5);
      expect(manager.getMasterVolume()).toBe(0);
    });

    it('handles playing non-existent sound gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const id = manager.play('nonexistent');

      expect(id).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith('Sound "nonexistent" not found');

      warnSpy.mockRestore();
    });

    it('handles stopping non-existent sound gracefully', () => {
      expect(() => manager.stop('nonexistent')).not.toThrow();
    });

    it('handles setting volume on non-existent sound gracefully', () => {
      expect(() => manager.setVolume('nonexistent', 0.5)).not.toThrow();
    });

    it('creates bus with clamped volume', () => {
      manager.createBus('test', 2.0);
      expect(manager.getBusVolume('test')).toBe(1);

      manager.createBus('test2', -1);
      expect(manager.getBusVolume('test2')).toBe(0);
    });

    it('does not create duplicate bus', () => {
      manager.createBus('custom', 0.5);
      manager.createBus('custom', 1.0);

      expect(manager.getBusVolume('custom')).toBe(0.5);
    });
  });

  describe('error cases', () => {
    it('rejects when sound fails to load', async () => {
      const { Howl } = await import('howler');

      (Howl as unknown as Mock).mockImplementationOnce((config: { onloaderror?: (id: number, error: string) => void }) => {
        if (config.onloaderror) {
          setTimeout(() => config.onloaderror!(1, 'Network error'), 0);
        }
        return { ...mockHowlInstance };
      });

      const errorManager = new SoundManager();

      await expect(
        errorManager.load('fail', { src: '/audio/fail.mp3' })
      ).rejects.toThrow('Failed to load sound fail: Network error');

      errorManager.dispose();
    });

    it('handles bus mute on non-existent bus gracefully', () => {
      expect(() => manager.setBusMute('nonexistent', true)).not.toThrow();
    });

    it('handles bus volume on non-existent bus gracefully', () => {
      expect(() => manager.setBusVolume('nonexistent', 0.5)).not.toThrow();
    });
  });

  describe('disposal', () => {
    it('disposes all resources', async () => {
      const { Howler } = await import('howler');

      await manager.load('test', { src: '/audio/test.mp3' });
      manager.dispose();

      expect(mockHowlInstance.unload).toHaveBeenCalled();
      expect(Howler.unload).toHaveBeenCalled();
    });
  });
});

describe('createSoundManager', () => {
  it('creates SoundManager instance with factory function', () => {
    const manager = createSoundManager();

    expect(manager).toBeInstanceOf(SoundManager);
    manager.dispose();
  });

  it('passes config to SoundManager', async () => {
    const { Howler } = await import('howler');
    const manager = createSoundManager({ masterVolume: 0.7, muted: true });

    expect(Howler.volume).toHaveBeenCalledWith(0.7);
    expect(Howler.mute).toHaveBeenCalledWith(true);

    manager.dispose();
  });
});
