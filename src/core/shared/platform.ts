/**
 * Platform Detection & Adapter Management
 * 
 * Provides utilities for detecting the current platform and managing
 * platform-specific adapters for cross-platform compatibility.
 * 
 * @module core/shared/platform
 */

export type Platform = 'web' | 'capacitor' | 'native';

export interface PlatformCapabilities {
  hasWebGL: boolean;
  hasWebAudio: boolean;
  hasLocalStorage: boolean;
  hasHaptics: boolean;
  hasTouchInput: boolean;
  hasDeviceMotion: boolean;
}

let cachedPlatform: Platform | null = null;
let cachedCapabilities: PlatformCapabilities | null = null;

export function detectPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;
  
  if (typeof window === 'undefined') {
    cachedPlatform = 'native';
    return cachedPlatform;
  }
  
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (win.Capacitor?.isNativePlatform?.()) {
    cachedPlatform = 'capacitor';
    return cachedPlatform;
  }
  
  cachedPlatform = 'web';
  return cachedPlatform;
}

export function detectCapabilities(): PlatformCapabilities {
  if (cachedCapabilities) return cachedCapabilities;
  
  const isServer = typeof window === 'undefined';
  
  cachedCapabilities = {
    hasWebGL: !isServer && !!document.createElement('canvas').getContext('webgl2'),
    hasWebAudio: !isServer && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
    hasLocalStorage: !isServer && !!window.localStorage,
    hasHaptics: !isServer && !!navigator.vibrate,
    hasTouchInput: !isServer && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
    hasDeviceMotion: !isServer && !!window.DeviceMotionEvent,
  };
  
  return cachedCapabilities;
}

export function isWeb(): boolean {
  return detectPlatform() === 'web';
}

export function isCapacitor(): boolean {
  return detectPlatform() === 'capacitor';
}

export function isNative(): boolean {
  return detectPlatform() === 'native';
}

export function resetPlatformCache(): void {
  cachedPlatform = null;
  cachedCapabilities = null;
}

export interface AdapterMap<T> {
  web: T;
  capacitor?: T;
  native?: T;
}

export function selectAdapter<T>(adapters: AdapterMap<T>, platform?: Platform): T {
  const currentPlatform = platform ?? detectPlatform();
  
  switch (currentPlatform) {
    case 'capacitor':
      return adapters.capacitor ?? adapters.web;
    case 'native':
      if (!adapters.native) {
        throw new Error(`No native adapter available for this feature. React Native support is not yet implemented.`);
      }
      return adapters.native;
    case 'web':
    default:
      return adapters.web;
  }
}
