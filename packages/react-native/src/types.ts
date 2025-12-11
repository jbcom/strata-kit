/**
 * Input mode types for device interaction
 * @module react-native/types
 */
export type InputMode = 'touch' | 'keyboard' | 'gamepad' | 'hybrid';

/**
 * Device type classification
 */
export type DeviceType = 'mobile' | 'tablet' | 'foldable' | 'desktop';

/**
 * Platform identifiers
 */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web';

/**
 * Screen orientation
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * Device profile containing hardware and platform information
 */
export interface DeviceProfile {
  deviceType: DeviceType;
  platform: Platform;
  inputMode: InputMode;
  orientation: Orientation;
  hasTouch: boolean;
  hasPointer: boolean;
  hasGamepad: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isFoldable: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * 2D vector for input positions
 */
export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Touch phase during input
 */
export type TouchPhase = 'began' | 'moved' | 'ended' | 'cancelled';

/**
 * Individual touch point data
 */
export interface TouchPoint {
  id: number;
  position: Vector2;
  phase: TouchPhase;
}

/**
 * Snapshot of current input state
 */
export interface InputSnapshot {
  timestamp: number;
  leftStick: Vector2;
  rightStick: Vector2;
  buttons: Record<string, boolean>;
  triggers: {
    left: number;
    right: number;
  };
  touches: TouchPoint[];
}

/**
 * Input action to key/button mapping
 */
export interface InputMapping {
  moveForward: string[];
  moveBackward: string[];
  moveLeft: string[];
  moveRight: string[];
  jump: string[];
  action: string[];
  cancel: string[];
}

/**
 * Haptic feedback intensity options
 */
export interface HapticsOptions {
  intensity: 'light' | 'medium' | 'heavy';
  duration?: number;
}

/**
 * Custom haptic pattern definition
 */
export interface HapticPattern {
  duration: number;
  intensity: number;
}

/**
 * Options for triggering haptic feedback
 */
export interface TriggerHapticOptions {
  pattern?: HapticPattern;
}

/**
 * Control hint for UI display
 */
export interface ControlHint {
  action: string;
  label: string;
  icon?: string;
}

/**
 * Control hints by action type
 */
export interface ControlHints {
  movement: string;
  action: string;
  camera: string;
}

/**
 * Default input mapping configuration
 */
export const DEFAULT_INPUT_MAPPING: InputMapping = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBackward: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  action: ['KeyE', 'Enter'],
  cancel: ['Escape'],
};

/**
 * Default device profile for initialization
 */
export const DEFAULT_DEVICE_PROFILE: DeviceProfile = {
  deviceType: 'mobile',
  platform: 'ios',
  inputMode: 'touch',
  orientation: 'portrait',
  hasTouch: true,
  hasPointer: false,
  hasGamepad: false,
  isMobile: true,
  isTablet: false,
  isFoldable: false,
  isDesktop: false,
  screenWidth: 390,
  screenHeight: 844,
  pixelRatio: 3,
  safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
};

/**
 * Default empty input snapshot
 */
export const DEFAULT_INPUT_SNAPSHOT: InputSnapshot = {
  timestamp: 0,
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  buttons: {},
  triggers: { left: 0, right: 0 },
  touches: [],
};
