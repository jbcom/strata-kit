/**
 * Control hints hook for React Native.
 * Provides contextual control hints based on device and input mode.
 * 
 * @module react-native/hooks/useControlHints
 */
import { useState, useEffect, useMemo } from 'react';
import { DeviceModule } from '../DeviceModule';
import type { DeviceProfile, InputMapping, ControlHint } from '../types';

/**
 * Result type for useControlHints hook.
 */
export interface UseControlHintsResult {
  /** Array of control hints for current input mode */
  hints: ControlHint[];
  /** Current device type for input */
  deviceType: 'keyboard' | 'gamepad' | 'touch';
  /** Whether a gamepad is connected */
  hasGamepad: boolean;
}

/**
 * Default keyboard control hints.
 */
const DEFAULT_KEYBOARD_HINTS: ControlHint[] = [
  { action: 'move', label: 'WASD / Arrows', icon: 'keyboard' },
  { action: 'jump', label: 'Space', icon: 'keyboard' },
  { action: 'action', label: 'E', icon: 'keyboard' },
  { action: 'cancel', label: 'Esc', icon: 'keyboard' },
];

/**
 * Default gamepad control hints.
 */
const DEFAULT_GAMEPAD_HINTS: ControlHint[] = [
  { action: 'move', label: 'Left Stick', icon: 'gamepad' },
  { action: 'jump', label: 'A Button', icon: 'gamepad' },
  { action: 'action', label: 'X Button', icon: 'gamepad' },
  { action: 'cancel', label: 'B Button', icon: 'gamepad' },
];

/**
 * Default touch control hints.
 */
const DEFAULT_TOUCH_HINTS: ControlHint[] = [
  { action: 'move', label: 'Drag to move', icon: 'touch' },
  { action: 'jump', label: 'Tap to jump', icon: 'touch' },
  { action: 'action', label: 'Hold to interact', icon: 'touch' },
  { action: 'cancel', label: 'Swipe back', icon: 'touch' },
];

/**
 * Options for customizing control hints.
 */
export interface UseControlHintsOptions {
  /** Custom input mapping */
  customMapping?: InputMapping;
  /** Custom keyboard hints */
  keyboardHints?: ControlHint[];
  /** Custom gamepad hints */
  gamepadHints?: ControlHint[];
  /** Custom touch hints */
  touchHints?: ControlHint[];
}

/**
 * Hook for getting contextual control hints based on current device and input mode.
 * Automatically updates when device or input mode changes.
 * 
 * @param options - Optional customization options
 * @returns Control hints result
 * 
 * @example
 * ```tsx
 * import { useControlHints } from '@strata/react-native';
 * 
 * function ControlHintOverlay() {
 *   const { hints, deviceType } = useControlHints();
 *   
 *   return (
 *     <View style={styles.overlay}>
 *       {hints.map(hint => (
 *         <View key={hint.action} style={styles.hint}>
 *           <Icon name={hint.icon} />
 *           <Text>{hint.action}: {hint.label}</Text>
 *         </View>
 *       ))}
 *     </View>
 *   );
 * }
 * ```
 */
export function useControlHints(
  options: UseControlHintsOptions = {}
): UseControlHintsResult {
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [hasGamepad, setHasGamepad] = useState(false);

  useEffect(() => {
    let mounted = true;

    DeviceModule.getDeviceProfile().then(profile => {
      if (mounted) {
        setDevice(profile);
        setHasGamepad(profile.hasGamepad);
      }
    });

    const subscription = DeviceModule.addListener((profile: DeviceProfile) => {
      if (mounted) {
        setDevice(profile);
        setHasGamepad(profile.hasGamepad);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const hints = useMemo((): ControlHint[] => {
    if (!device) return [];

    if (hasGamepad) {
      return options.gamepadHints || DEFAULT_GAMEPAD_HINTS;
    }

    if (device.isMobile || device.isTablet) {
      return options.touchHints || DEFAULT_TOUCH_HINTS;
    }

    return options.keyboardHints || DEFAULT_KEYBOARD_HINTS;
  }, [device, hasGamepad, options.keyboardHints, options.gamepadHints, options.touchHints]);

  const deviceType = useMemo((): 'keyboard' | 'gamepad' | 'touch' => {
    if (hasGamepad) return 'gamepad';
    if (device?.isMobile || device?.isTablet) return 'touch';
    return 'keyboard';
  }, [device, hasGamepad]);

  return {
    hints,
    deviceType,
    hasGamepad,
  };
}
