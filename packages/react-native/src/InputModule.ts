/**
 * Input handling module for React Native.
 * Manages touch, keyboard, and gamepad input state.
 * 
 * @module react-native/InputModule
 */
import type {
  InputSnapshot,
  InputMapping,
  Vector2,
  TouchPoint,
  TouchPhase,
} from './types';
import { DEFAULT_INPUT_SNAPSHOT, DEFAULT_INPUT_MAPPING } from './types';

export type InputChangeCallback = (snapshot: InputSnapshot) => void;
export type GamepadCallback = (info: { index: number; id?: string }) => void;

const inputListeners: Set<InputChangeCallback> = new Set();
const gamepadConnectedListeners: Set<GamepadCallback> = new Set();
const gamepadDisconnectedListeners: Set<GamepadCallback> = new Set();

let currentSnapshot: InputSnapshot = { ...DEFAULT_INPUT_SNAPSHOT };
let currentMapping: InputMapping = { ...DEFAULT_INPUT_MAPPING };

/**
 * Creates a zero vector.
 */
function zeroVector(): Vector2 {
  return { x: 0, y: 0 };
}

/**
 * Clamps a value between -1 and 1.
 */
function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Notifies all input listeners of state changes.
 */
function notifyInputListeners(): void {
  inputListeners.forEach(callback => {
    try {
      callback(currentSnapshot);
    } catch (error) {
      console.warn('InputModule: Error in listener callback:', error);
    }
  });
}

/**
 * Gets the current input snapshot.
 * 
 * @returns Promise resolving to the current input state
 * 
 * @example
 * ```typescript
 * const snapshot = await InputModule.getInputSnapshot();
 * console.log('Left stick:', snapshot.leftStick);
 * ```
 */
export async function getInputSnapshot(): Promise<InputSnapshot> {
  return { ...currentSnapshot };
}

/**
 * Updates the current input mapping.
 * 
 * @param mapping - Partial mapping to merge with current
 * 
 * @example
 * ```typescript
 * await InputModule.setInputMapping({
 *   jump: ['Space', 'KeyJ'],
 *   action: ['KeyE', 'KeyF'],
 * });
 * ```
 */
export async function setInputMapping(
  mapping: Partial<InputMapping>
): Promise<void> {
  currentMapping = { ...currentMapping, ...mapping };
}

/**
 * Gets the current input mapping configuration.
 */
export function getInputMapping(): InputMapping {
  return { ...currentMapping };
}

/**
 * Updates the left stick position.
 * 
 * @param x - Horizontal axis (-1 to 1)
 * @param y - Vertical axis (-1 to 1)
 */
export function updateLeftStick(x: number, y: number): void {
  currentSnapshot = {
    ...currentSnapshot,
    timestamp: Date.now(),
    leftStick: { x: clampAxis(x), y: clampAxis(y) },
  };
  notifyInputListeners();
}

/**
 * Updates the right stick position.
 * 
 * @param x - Horizontal axis (-1 to 1)
 * @param y - Vertical axis (-1 to 1)
 */
export function updateRightStick(x: number, y: number): void {
  currentSnapshot = {
    ...currentSnapshot,
    timestamp: Date.now(),
    rightStick: { x: clampAxis(x), y: clampAxis(y) },
  };
  notifyInputListeners();
}

/**
 * Sets a button's pressed state.
 * 
 * @param button - Button identifier
 * @param pressed - Whether button is pressed
 */
export function setButtonPressed(button: string, pressed: boolean): void {
  const buttons = { ...currentSnapshot.buttons };
  if (pressed) {
    buttons[button] = true;
  } else {
    delete buttons[button];
  }

  currentSnapshot = {
    ...currentSnapshot,
    timestamp: Date.now(),
    buttons,
  };
  notifyInputListeners();
}

/**
 * Updates trigger values.
 * 
 * @param left - Left trigger value (0 to 1)
 * @param right - Right trigger value (0 to 1)
 */
export function updateTriggers(left: number, right: number): void {
  currentSnapshot = {
    ...currentSnapshot,
    timestamp: Date.now(),
    triggers: {
      left: Math.max(0, Math.min(1, left)),
      right: Math.max(0, Math.min(1, right)),
    },
  };
  notifyInputListeners();
}

/**
 * Updates the active touch points.
 * 
 * @param touches - Array of current touch points
 */
export function updateTouches(touches: TouchPoint[]): void {
  currentSnapshot = {
    ...currentSnapshot,
    timestamp: Date.now(),
    touches: [...touches],
  };
  notifyInputListeners();
}

/**
 * Processes a touch event from React Native.
 * 
 * @param nativeEvent - Native touch event data
 * @param phase - Touch phase
 */
export function handleTouchEvent(
  nativeEvent: {
    identifier: number;
    locationX: number;
    locationY: number;
  },
  phase: TouchPhase
): void {
  const touchPoint: TouchPoint = {
    id: nativeEvent.identifier,
    position: { x: nativeEvent.locationX, y: nativeEvent.locationY },
    phase,
  };

  let touches = [...currentSnapshot.touches];

  if (phase === 'began') {
    touches.push(touchPoint);
  } else if (phase === 'moved') {
    touches = touches.map(t =>
      t.id === touchPoint.id ? touchPoint : t
    );
  } else {
    touches = touches.filter(t => t.id !== touchPoint.id);
  }

  updateTouches(touches);
}

/**
 * Resets all input state to defaults.
 */
export function resetInput(): void {
  currentSnapshot = {
    timestamp: Date.now(),
    leftStick: zeroVector(),
    rightStick: zeroVector(),
    buttons: {},
    triggers: { left: 0, right: 0 },
    touches: [],
  };
  notifyInputListeners();
}

/**
 * Adds a listener for input state changes.
 * 
 * @param callback - Function called when input changes
 * @returns Object with remove method to unsubscribe
 */
export function addInputListener(
  callback: InputChangeCallback
): { remove: () => void } {
  inputListeners.add(callback);
  return {
    remove: () => inputListeners.delete(callback),
  };
}

/**
 * Adds a listener for gamepad connection events.
 * 
 * @param callback - Function called when gamepad connects
 * @returns Object with remove method to unsubscribe
 */
export function addGamepadConnectedListener(
  callback: GamepadCallback
): { remove: () => void } {
  gamepadConnectedListeners.add(callback);
  return {
    remove: () => gamepadConnectedListeners.delete(callback),
  };
}

/**
 * Adds a listener for gamepad disconnection events.
 * 
 * @param callback - Function called when gamepad disconnects
 * @returns Object with remove method to unsubscribe
 */
export function addGamepadDisconnectedListener(
  callback: GamepadCallback
): { remove: () => void } {
  gamepadDisconnectedListeners.add(callback);
  return {
    remove: () => gamepadDisconnectedListeners.delete(callback),
  };
}

/**
 * Notifies listeners of a gamepad connection.
 * 
 * @param index - Gamepad index
 * @param id - Gamepad identifier
 */
export function notifyGamepadConnected(index: number, id: string): void {
  gamepadConnectedListeners.forEach(callback => {
    try {
      callback({ index, id });
    } catch (error) {
      console.warn('InputModule: Error in gamepad connected callback:', error);
    }
  });
}

/**
 * Notifies listeners of a gamepad disconnection.
 * 
 * @param index - Gamepad index
 */
export function notifyGamepadDisconnected(index: number): void {
  gamepadDisconnectedListeners.forEach(callback => {
    try {
      callback({ index });
    } catch (error) {
      console.warn('InputModule: Error in gamepad disconnected callback:', error);
    }
  });
}

export const InputModule = {
  getInputSnapshot,
  setInputMapping,
  getInputMapping,
  updateLeftStick,
  updateRightStick,
  setButtonPressed,
  updateTriggers,
  updateTouches,
  handleTouchEvent,
  resetInput,
  addInputListener,
  addGamepadConnectedListener,
  addGamepadDisconnectedListener,
  notifyGamepadConnected,
  notifyGamepadDisconnected,
};
