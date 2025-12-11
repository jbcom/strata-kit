/**
 * React hooks for Strata React Native.
 * 
 * @module react-native/hooks
 */

export { useDevice, DeviceProvider, DeviceContext } from './useDevice';
export type { DeviceProviderProps } from './useDevice';

export { useInput, InputProvider, InputContext } from './useInput';
export type { InputContextValue, InputProviderProps } from './useInput';

export { useHaptics } from './useHaptics';
export type { UseHapticsResult } from './useHaptics';

export { useControlHints } from './useControlHints';
export type { UseControlHintsResult, UseControlHintsOptions } from './useControlHints';
