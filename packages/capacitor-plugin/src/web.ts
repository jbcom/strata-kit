import { WebPlugin } from '@capacitor/core';
import type {
  StrataPlugin,
  DeviceProfile,
  ControlHints,
  InputSnapshot,
  InputMapping,
  HapticsOptions,
  Vector2,
  DeviceType,
  Platform,
  InputMode,
} from './definitions';
import { DEFAULT_INPUT_MAPPING as DEFAULT_MAPPING } from './definitions';

type ListenerCallback<T> = (data: T) => void;

export class StrataWeb extends WebPlugin implements StrataPlugin {
  private inputMapping: InputMapping = { ...DEFAULT_MAPPING };
  private pressedKeys = new Set<string>();
  private gamepads: (Gamepad | null)[] = [];
  private touches: Map<number, { position: Vector2; phase: 'began' | 'moved' | 'ended' | 'cancelled' }> = new Map();
  private deviceListeners: ListenerCallback<DeviceProfile>[] = [];
  private inputListeners: ListenerCallback<InputSnapshot>[] = [];
  private gamepadConnectedListeners: ListenerCallback<{ index: number; id: string }>[] = [];
  private gamepadDisconnectedListeners: ListenerCallback<{ index: number }>[] = [];
  private animationFrameId: number | null = null;
  private lastInputSnapshot: InputSnapshot | null = null;

  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.handleTouchCancel, { passive: true });
    window.addEventListener('resize', this.handleResize);
    window.matchMedia('(orientation: portrait)').addEventListener('change', this.handleOrientationChange);

    this.startInputLoop();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.pressedKeys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.pressedKeys.delete(e.code);
  };

  private handleGamepadConnected = (e: GamepadEvent): void => {
    this.gamepads[e.gamepad.index] = e.gamepad;
    this.gamepadConnectedListeners.forEach(cb => 
      cb({ index: e.gamepad.index, id: e.gamepad.id })
    );
    this.notifyDeviceChange();
  };

  private handleGamepadDisconnected = (e: GamepadEvent): void => {
    this.gamepads[e.gamepad.index] = null;
    this.gamepadDisconnectedListeners.forEach(cb => 
      cb({ index: e.gamepad.index })
    );
    this.notifyDeviceChange();
  };

  private handleTouchStart = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      this.touches.set(touch.identifier, {
        position: { x: touch.clientX, y: touch.clientY },
        phase: 'began',
      });
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      const existing = this.touches.get(touch.identifier);
      if (existing) {
        existing.position = { x: touch.clientX, y: touch.clientY };
        existing.phase = 'moved';
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      const existing = this.touches.get(touch.identifier);
      if (existing) {
        existing.phase = 'ended';
      }
    }
    setTimeout(() => {
      for (const touch of Array.from(e.changedTouches)) {
        this.touches.delete(touch.identifier);
      }
    }, 16);
  };

  private handleTouchCancel = (e: TouchEvent): void => {
    for (const touch of Array.from(e.changedTouches)) {
      this.touches.delete(touch.identifier);
    }
  };

  private handleResize = (): void => {
    this.notifyDeviceChange();
  };

  private handleOrientationChange = (): void => {
    this.notifyDeviceChange();
  };

  private notifyDeviceChange(): void {
    this.getDeviceProfile().then(profile => {
      this.deviceListeners.forEach(cb => cb(profile));
    });
  }

  private startInputLoop(): void {
    const loop = (): void => {
      this.gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      
      if (this.inputListeners.length > 0) {
        this.getInputSnapshot().then(snapshot => {
          if (this.hasInputChanged(snapshot)) {
            this.lastInputSnapshot = snapshot;
            this.inputListeners.forEach(cb => cb(snapshot));
          }
        });
      }
      
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  private hasInputChanged(current: InputSnapshot): boolean {
    if (!this.lastInputSnapshot) return true;
    const last = this.lastInputSnapshot;
    
    if (current.leftStick.x !== last.leftStick.x || current.leftStick.y !== last.leftStick.y) return true;
    if (current.rightStick.x !== last.rightStick.x || current.rightStick.y !== last.rightStick.y) return true;
    if (current.triggers.left !== last.triggers.left || current.triggers.right !== last.triggers.right) return true;
    
    const currentButtons = Object.keys(current.buttons);
    const lastButtons = Object.keys(last.buttons);
    if (currentButtons.length !== lastButtons.length) return true;
    for (const key of currentButtons) {
      if (current.buttons[key] !== last.buttons[key]) return true;
    }
    
    return false;
  }

  private detectPlatform(): Platform {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/windows/.test(ua)) return 'windows';
    if (/macintosh|mac os x/.test(ua)) return 'macos';
    if (/linux/.test(ua)) return 'linux';
    return 'web';
  }

  private detectDeviceType(): DeviceType {
    const width = window.innerWidth;
    const hasTouch = this.hasTouch();
    
    if (width <= 480) return 'mobile';
    if (width <= 768) return hasTouch ? 'mobile' : 'desktop';
    if (width <= 1024) {
      if (hasTouch) {
        const ratio = window.innerWidth / window.innerHeight;
        if (ratio > 1.8 || ratio < 0.6) return 'foldable';
        return 'tablet';
      }
      return 'desktop';
    }
    return 'desktop';
  }

  private detectInputMode(): InputMode {
    const hasGamepad = this.gamepads.some(gp => gp !== null);
    const hasTouch = this.hasTouch();
    
    if (hasGamepad && hasTouch) return 'hybrid';
    if (hasGamepad) return 'gamepad';
    if (hasTouch && window.innerWidth <= 1024) return 'touch';
    return 'keyboard';
  }

  private hasTouch(): boolean {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
  }

  private hasPointer(): boolean {
    return window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  }

  async getDeviceProfile(): Promise<DeviceProfile> {
    const deviceType = this.detectDeviceType();
    const platform = this.detectPlatform();
    const inputMode = this.detectInputMode();
    const hasTouch = this.hasTouch();
    const hasPointer = this.hasPointer();
    const hasGamepad = this.gamepads.some(gp => gp !== null);

    return {
      deviceType,
      platform,
      inputMode,
      orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
      hasTouch,
      hasPointer,
      hasGamepad,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isFoldable: deviceType === 'foldable',
      isDesktop: deviceType === 'desktop',
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
      safeAreaInsets: this.getSafeAreaInsets(),
    };
  }

  private getSafeAreaInsets(): DeviceProfile['safeAreaInsets'] {
    const style = getComputedStyle(document.documentElement);
    return {
      top: parseInt(style.getPropertyValue('--sat') || '0', 10) || 0,
      right: parseInt(style.getPropertyValue('--sar') || '0', 10) || 0,
      bottom: parseInt(style.getPropertyValue('--sab') || '0', 10) || 0,
      left: parseInt(style.getPropertyValue('--sal') || '0', 10) || 0,
    };
  }

  async getControlHints(): Promise<ControlHints> {
    const profile = await this.getDeviceProfile();

    switch (profile.inputMode) {
      case 'touch':
        return {
          movement: 'Drag to move',
          action: 'Tap to interact',
          camera: 'Pinch to zoom',
        };
      case 'gamepad':
        return {
          movement: 'Left stick to move',
          action: 'A / X to interact',
          camera: 'Right stick to look',
        };
      case 'hybrid':
        return {
          movement: 'Touch or stick to move',
          action: 'Tap or A to interact',
          camera: 'Swipe or right stick',
        };
      case 'keyboard':
      default:
        return {
          movement: 'WASD to move',
          action: 'Click to interact',
          camera: 'Mouse to look',
        };
    }
  }

  async getInputSnapshot(): Promise<InputSnapshot> {
    const leftStick: Vector2 = { x: 0, y: 0 };
    const rightStick: Vector2 = { x: 0, y: 0 };
    const buttons: Record<string, boolean> = {};
    const triggers = { left: 0, right: 0 };

    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) leftStick.y = -1;
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) leftStick.y = 1;
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) leftStick.x = -1;
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) leftStick.x = 1;

    buttons['jump'] = this.pressedKeys.has('Space');
    buttons['action'] = this.pressedKeys.has('KeyE') || this.pressedKeys.has('Enter');
    buttons['cancel'] = this.pressedKeys.has('Escape');

    const gamepad = this.gamepads.find(gp => gp !== null);
    if (gamepad) {
      const deadzone = 0.15;
      
      if (Math.abs(gamepad.axes[0]) > deadzone) leftStick.x = gamepad.axes[0];
      if (Math.abs(gamepad.axes[1]) > deadzone) leftStick.y = gamepad.axes[1];
      if (gamepad.axes.length > 2 && Math.abs(gamepad.axes[2]) > deadzone) rightStick.x = gamepad.axes[2];
      if (gamepad.axes.length > 3 && Math.abs(gamepad.axes[3]) > deadzone) rightStick.y = gamepad.axes[3];

      buttons['jump'] = buttons['jump'] || gamepad.buttons[0]?.pressed;
      buttons['action'] = buttons['action'] || gamepad.buttons[1]?.pressed;
      buttons['cancel'] = buttons['cancel'] || gamepad.buttons[2]?.pressed;

      if (gamepad.buttons.length > 6) triggers.left = gamepad.buttons[6].value;
      if (gamepad.buttons.length > 7) triggers.right = gamepad.buttons[7].value;
    }

    const touchArray = Array.from(this.touches.entries()).map(([id, data]) => ({
      id,
      position: data.position,
      phase: data.phase,
    }));

    return {
      timestamp: performance.now(),
      leftStick,
      rightStick,
      buttons,
      triggers,
      touches: touchArray,
    };
  }

  async setInputMapping(mapping: Partial<InputMapping>): Promise<void> {
    this.inputMapping = { ...this.inputMapping, ...mapping };
  }

  async triggerHaptics(options: HapticsOptions): Promise<void> {
    if ('vibrate' in navigator) {
      const durations = { light: 10, medium: 25, heavy: 50 };
      navigator.vibrate(options.duration ?? durations[options.intensity]);
    }

    const gamepad = this.gamepads.find(gp => gp?.vibrationActuator);
    if (gamepad?.vibrationActuator) {
      const magnitudes = { light: 0.25, medium: 0.5, heavy: 1.0 };
      const magnitude = magnitudes[options.intensity];
      try {
        await (gamepad.vibrationActuator as any).playEffect('dual-rumble', {
          startDelay: 0,
          duration: options.duration ?? 100,
          weakMagnitude: magnitude,
          strongMagnitude: magnitude,
        });
      } catch {
        // Gamepad haptics not supported
      }
    }
  }

  async vibrate(options?: { duration?: number }): Promise<void> {
    if ('vibrate' in navigator) {
      navigator.vibrate(options?.duration ?? 200);
    }
  }

  async addListener(
    eventName: 'deviceChange' | 'inputChange' | 'gamepadConnected' | 'gamepadDisconnected',
    callback: (data: any) => void
  ): Promise<{ remove: () => Promise<void> }> {
    switch (eventName) {
      case 'deviceChange':
        this.deviceListeners.push(callback);
        return { remove: async () => { this.deviceListeners.splice(this.deviceListeners.indexOf(callback), 1); } };
      case 'inputChange':
        this.inputListeners.push(callback);
        return { remove: async () => { this.inputListeners.splice(this.inputListeners.indexOf(callback), 1); } };
      case 'gamepadConnected':
        this.gamepadConnectedListeners.push(callback);
        return { remove: async () => { this.gamepadConnectedListeners.splice(this.gamepadConnectedListeners.indexOf(callback), 1); } };
      case 'gamepadDisconnected':
        this.gamepadDisconnectedListeners.push(callback);
        return { remove: async () => { this.gamepadDisconnectedListeners.splice(this.gamepadDisconnectedListeners.indexOf(callback), 1); } };
    }
  }

  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    window.removeEventListener('resize', this.handleResize);
  }
}

