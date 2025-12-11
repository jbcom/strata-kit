/**
 * Device detection module for React Native.
 * Uses Platform, Dimensions, and patterns from react-native-device-info.
 * 
 * @module react-native/DeviceModule
 */
import type {
  DeviceProfile,
  DeviceType,
  Platform as PlatformType,
  Orientation,
  InputMode,
} from './types';
import { DEFAULT_DEVICE_PROFILE } from './types';

type DimensionsType = {
  get: (dim: 'window' | 'screen') => { width: number; height: number };
  addEventListener: (
    type: 'change',
    handler: (data: { window: { width: number; height: number } }) => void
  ) => { remove: () => void };
};

type PlatformModuleType = {
  OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
  isPad?: boolean;
  isTV?: boolean;
};

type EventSubscription = { remove: () => void };

let Dimensions: DimensionsType | null = null;
let PlatformModule: PlatformModuleType | null = null;

try {
  const RN = require('react-native') as {
    Dimensions: DimensionsType;
    Platform: PlatformModuleType;
  };
  Dimensions = RN.Dimensions;
  PlatformModule = RN.Platform;
} catch {
  // Running outside React Native environment
}

export type DeviceChangeCallback = (profile: DeviceProfile) => void;

const listeners: Set<DeviceChangeCallback> = new Set();
let dimensionSubscription: EventSubscription | null = null;
let currentProfile: DeviceProfile = DEFAULT_DEVICE_PROFILE;

/**
 * Determines the device type based on screen dimensions and platform.
 */
function detectDeviceType(): DeviceType {
  if (!Dimensions || !PlatformModule) return 'mobile';

  const { width, height } = Dimensions.get('window');
  const screenSize = Math.max(width, height);

  if (PlatformModule.isPad) return 'tablet';
  if (PlatformModule.isTV) return 'desktop';

  if (screenSize >= 1024) return 'tablet';
  if (screenSize >= 600 && screenSize < 1024) {
    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    return aspectRatio < 1.6 ? 'tablet' : 'mobile';
  }

  return 'mobile';
}

/**
 * Detects the current platform.
 */
function detectPlatform(): PlatformType {
  if (!PlatformModule) return 'web';

  const platformMap: Record<string, PlatformType> = {
    ios: 'ios',
    android: 'android',
    windows: 'windows',
    macos: 'macos',
    web: 'web',
  };

  return platformMap[PlatformModule.OS] || 'web';
}

/**
 * Determines the current screen orientation.
 */
function detectOrientation(): Orientation {
  if (!Dimensions) return 'portrait';

  const { width, height } = Dimensions.get('window');
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Determines the primary input mode for the device.
 */
function detectInputMode(deviceType: DeviceType): InputMode {
  if (deviceType === 'desktop') return 'keyboard';
  return 'touch';
}

/**
 * Gets safe area insets. Returns defaults until native module is connected.
 */
function getSafeAreaInsets(): DeviceProfile['safeAreaInsets'] {
  if (!PlatformModule) return { top: 0, right: 0, bottom: 0, left: 0 };

  if (PlatformModule.OS === 'ios') {
    return { top: 47, right: 0, bottom: 34, left: 0 };
  }

  if (PlatformModule.OS === 'android') {
    return { top: 24, right: 0, bottom: 0, left: 0 };
  }

  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * Builds a complete device profile from detected values.
 */
function buildDeviceProfile(): DeviceProfile {
  if (!Dimensions || !PlatformModule) return DEFAULT_DEVICE_PROFILE;

  const { width, height } = Dimensions.get('window');
  const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');
  const deviceType = detectDeviceType();
  const platform = detectPlatform();
  const orientation = detectOrientation();
  const inputMode = detectInputMode(deviceType);

  return {
    deviceType,
    platform,
    inputMode,
    orientation,
    hasTouch: deviceType !== 'desktop',
    hasPointer: deviceType === 'desktop',
    hasGamepad: false,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isFoldable: deviceType === 'foldable',
    isDesktop: deviceType === 'desktop',
    screenWidth: screenWidth || width,
    screenHeight: screenHeight || height,
    pixelRatio: (PlatformModule.OS === 'ios' ? 3 : 2.75),
    safeAreaInsets: getSafeAreaInsets(),
  };
}

/**
 * Notifies all registered listeners of a device profile change.
 */
function notifyListeners(profile: DeviceProfile): void {
  listeners.forEach(callback => {
    try {
      callback(profile);
    } catch (error) {
      console.warn('DeviceModule: Error in listener callback:', error);
    }
  });
}

/**
 * Handles dimension change events.
 */
function handleDimensionChange(): void {
  const newProfile = buildDeviceProfile();
  if (
    newProfile.orientation !== currentProfile.orientation ||
    newProfile.screenWidth !== currentProfile.screenWidth ||
    newProfile.screenHeight !== currentProfile.screenHeight
  ) {
    currentProfile = newProfile;
    notifyListeners(currentProfile);
  }
}

/**
 * Gets the current device profile.
 * 
 * @returns Promise resolving to the current device profile
 * 
 * @example
 * ```typescript
 * const profile = await DeviceModule.getDeviceProfile();
 * console.log(profile.deviceType); // 'mobile' | 'tablet' | etc.
 * ```
 */
export async function getDeviceProfile(): Promise<DeviceProfile> {
  currentProfile = buildDeviceProfile();
  return currentProfile;
}

/**
 * Adds a listener for device profile changes.
 * 
 * @param callback - Function called when device profile changes
 * @returns Object with remove method to unsubscribe
 * 
 * @example
 * ```typescript
 * const subscription = DeviceModule.addListener((profile) => {
 *   console.log('Orientation:', profile.orientation);
 * });
 * 
 * // Later: cleanup
 * subscription.remove();
 * ```
 */
export function addListener(
  callback: DeviceChangeCallback
): { remove: () => void } {
  listeners.add(callback);

  if (listeners.size === 1 && Dimensions) {
    dimensionSubscription = Dimensions.addEventListener(
      'change',
      handleDimensionChange
    );
  }

  return {
    remove: () => {
      listeners.delete(callback);
      if (listeners.size === 0 && dimensionSubscription) {
        dimensionSubscription.remove();
        dimensionSubscription = null;
      }
    },
  };
}

/**
 * Updates the gamepad connection status.
 * 
 * @param connected - Whether a gamepad is connected
 */
export function setGamepadConnected(connected: boolean): void {
  if (currentProfile.hasGamepad !== connected) {
    currentProfile = {
      ...currentProfile,
      hasGamepad: connected,
      inputMode: connected ? 'gamepad' : detectInputMode(currentProfile.deviceType),
    };
    notifyListeners(currentProfile);
  }
}

export const DeviceModule = {
  getDeviceProfile,
  addListener,
  setGamepadConnected,
};
