/**
 * Haptics module for React Native.
 * Provides haptic feedback using Vibration API and patterns similar to react-native-haptic-feedback.
 * 
 * @module react-native/HapticsModule
 */
import type { HapticsOptions, HapticPattern, TriggerHapticOptions } from './types';

type VibrationAPI = {
  vibrate: (pattern: number | number[], repeat?: boolean) => void;
  cancel: () => void;
};

type PlatformAPI = {
  OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
};

let Vibration: VibrationAPI | null = null;
let Platform: PlatformAPI | null = null;

try {
  const RN = require('react-native') as {
    Vibration: VibrationAPI;
    Platform: PlatformAPI;
  };
  Vibration = RN.Vibration;
  Platform = RN.Platform;
} catch {
  // Running outside React Native environment
}

/**
 * Haptic feedback type for iOS-style impacts.
 */
export type ImpactStyle = 'light' | 'medium' | 'heavy';

/**
 * Notification haptic types.
 */
export type NotificationType = 'success' | 'warning' | 'error';

const INTENSITY_DURATION_MAP: Record<ImpactStyle, number> = {
  light: 10,
  medium: 25,
  heavy: 50,
};

const NOTIFICATION_PATTERNS: Record<NotificationType, number[]> = {
  success: [0, 30],
  warning: [0, 50, 50, 50],
  error: [0, 100, 50, 100],
};

/**
 * Checks if haptics are available on the current platform.
 */
export function isHapticsAvailable(): boolean {
  return Vibration !== null;
}

/**
 * Triggers a simple vibration.
 * 
 * @param duration - Vibration duration in milliseconds
 * 
 * @example
 * ```typescript
 * await HapticsModule.vibrate(50);
 * ```
 */
export async function vibrate(duration = 100): Promise<void> {
  if (!Vibration) {
    console.warn('HapticsModule: Vibration not available');
    return;
  }

  try {
    if (Platform?.OS === 'android') {
      Vibration.vibrate(duration);
    } else {
      // iOS ignores duration, uses system default
      Vibration.vibrate(duration);
    }
  } catch (error) {
    console.warn('HapticsModule: Vibration failed:', error);
  }
}

/**
 * Triggers haptic feedback with specified options.
 * 
 * @param options - Haptics configuration
 * 
 * @example
 * ```typescript
 * await HapticsModule.triggerHaptics({ intensity: 'medium' });
 * ```
 */
export async function triggerHaptics(options: HapticsOptions): Promise<void> {
  const duration = options.duration ?? INTENSITY_DURATION_MAP[options.intensity];
  await vibrate(duration);
}

/**
 * Triggers a custom haptic pattern.
 * 
 * @param options - Pattern configuration
 * 
 * @example
 * ```typescript
 * await HapticsModule.triggerHaptic({
 *   pattern: { duration: 30, intensity: 0.5 }
 * });
 * ```
 */
export async function triggerHaptic(options: TriggerHapticOptions): Promise<void> {
  if (!options.pattern) {
    await vibrate(25);
    return;
  }

  const { duration, intensity } = options.pattern;
  const scaledDuration = Math.round(duration * intensity);
  await vibrate(scaledDuration);
}

/**
 * Triggers an impact-style haptic feedback.
 * Similar to iOS UIImpactFeedbackGenerator.
 * 
 * @param style - Impact intensity style
 * 
 * @example
 * ```typescript
 * await HapticsModule.impact('heavy');
 * ```
 */
export async function impact(style: ImpactStyle = 'medium'): Promise<void> {
  const duration = INTENSITY_DURATION_MAP[style];
  await vibrate(duration);
}

/**
 * Triggers a notification-style haptic feedback.
 * Similar to iOS UINotificationFeedbackGenerator.
 * 
 * @param type - Notification type
 * 
 * @example
 * ```typescript
 * await HapticsModule.notification('success');
 * ```
 */
export async function notification(type: NotificationType = 'success'): Promise<void> {
  if (!Vibration) {
    console.warn('HapticsModule: Vibration not available');
    return;
  }

  try {
    const pattern = NOTIFICATION_PATTERNS[type];
    Vibration.vibrate(pattern);
  } catch (error) {
    console.warn('HapticsModule: Notification haptic failed:', error);
  }
}

/**
 * Triggers a selection-style haptic feedback.
 * Similar to iOS UISelectionFeedbackGenerator.
 * 
 * @example
 * ```typescript
 * await HapticsModule.selection();
 * ```
 */
export async function selection(): Promise<void> {
  await vibrate(5);
}

/**
 * Cancels any ongoing vibration.
 * 
 * @example
 * ```typescript
 * HapticsModule.cancel();
 * ```
 */
export function cancel(): void {
  if (!Vibration) return;

  try {
    Vibration.cancel();
  } catch (error) {
    console.warn('HapticsModule: Cancel failed:', error);
  }
}

/**
 * Plays a custom vibration pattern.
 * 
 * @param pattern - Array of wait/vibrate durations in milliseconds
 * @param repeat - Whether to repeat the pattern
 * 
 * @example
 * ```typescript
 * // Wait 0ms, vibrate 100ms, wait 50ms, vibrate 100ms
 * await HapticsModule.playPattern([0, 100, 50, 100]);
 * ```
 */
export async function playPattern(
  pattern: number[],
  repeat = false
): Promise<void> {
  if (!Vibration) {
    console.warn('HapticsModule: Vibration not available');
    return;
  }

  try {
    Vibration.vibrate(pattern, repeat);
  } catch (error) {
    console.warn('HapticsModule: Pattern playback failed:', error);
  }
}

export const HapticsModule = {
  isHapticsAvailable,
  vibrate,
  triggerHaptics,
  triggerHaptic,
  impact,
  notification,
  selection,
  cancel,
  playPattern,
};
