/**
 * Haptics hook for React Native.
 * Provides convenient haptic feedback methods.
 * 
 * @module react-native/hooks/useHaptics
 */
import { useCallback } from 'react';
import { HapticsModule } from '../HapticsModule';
import type { HapticPattern } from '../types';

/**
 * Result type for useHaptics hook.
 */
export interface UseHapticsResult {
  /** Trigger haptic with optional custom pattern */
  trigger: (pattern?: HapticPattern) => Promise<void>;
  /** Trigger impact-style haptic feedback */
  impact: (style?: 'light' | 'medium' | 'heavy') => Promise<void>;
  /** Trigger notification-style haptic feedback */
  notification: (type?: 'success' | 'warning' | 'error') => Promise<void>;
  /** Trigger selection-style haptic feedback */
  selection: () => Promise<void>;
  /** Check if haptics are available */
  isAvailable: boolean;
}

/**
 * Hook for triggering haptic feedback.
 * Provides methods matching iOS haptic feedback patterns.
 * 
 * @returns Haptic feedback methods
 * 
 * @example
 * ```tsx
 * import { useHaptics } from '@strata/react-native';
 * 
 * function Button({ onPress, children }) {
 *   const haptics = useHaptics();
 *   
 *   const handlePress = async () => {
 *     await haptics.impact('medium');
 *     onPress();
 *   };
 *   
 *   return (
 *     <TouchableOpacity onPress={handlePress}>
 *       {children}
 *     </TouchableOpacity>
 *   );
 * }
 * ```
 */
export function useHaptics(): UseHapticsResult {
  const trigger = useCallback(async (pattern?: HapticPattern): Promise<void> => {
    try {
      await HapticsModule.triggerHaptic({ pattern });
    } catch (e) {
      console.warn('Haptic trigger failed:', e);
    }
  }, []);

  const impact = useCallback(
    async (style: 'light' | 'medium' | 'heavy' = 'medium'): Promise<void> => {
      try {
        await HapticsModule.impact(style);
      } catch (e) {
        console.warn('Haptic impact failed:', e);
      }
    },
    []
  );

  const notification = useCallback(
    async (type: 'success' | 'warning' | 'error' = 'success'): Promise<void> => {
      try {
        await HapticsModule.notification(type);
      } catch (e) {
        console.warn('Haptic notification failed:', e);
      }
    },
    []
  );

  const selection = useCallback(async (): Promise<void> => {
    try {
      await HapticsModule.selection();
    } catch (e) {
      console.warn('Haptic selection failed:', e);
    }
  }, []);

  return {
    trigger,
    impact,
    notification,
    selection,
    isAvailable: HapticsModule.isHapticsAvailable(),
  };
}
