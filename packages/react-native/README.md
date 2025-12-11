# @strata/react-native

Cross-platform device detection, input handling, and haptic feedback for React Native applications.

## Installation

```bash
npm install @strata/react-native
# or
yarn add @strata/react-native
```

## Quick Start

```tsx
import { 
  DeviceProvider, 
  InputProvider, 
  useDevice, 
  useInput, 
  useHaptics,
  useControlHints
} from '@strata/react-native';

function App() {
  return (
    <DeviceProvider>
      <InputProvider>
        <Game />
      </InputProvider>
    </DeviceProvider>
  );
}

function Game() {
  const device = useDevice();
  const { leftStick, isPressed } = useInput();
  const haptics = useHaptics();
  const { hints } = useControlHints();
  
  // Device-aware rendering
  if (device.isMobile) {
    return <MobileControls />;
  }
  
  return <DesktopControls />;
}
```

## Hooks

### useDevice

Access device profile information including platform, screen size, and capabilities.

```tsx
const device = useDevice();

console.log(device.deviceType);    // 'mobile' | 'tablet' | 'desktop'
console.log(device.platform);      // 'ios' | 'android' | etc.
console.log(device.orientation);   // 'portrait' | 'landscape'
console.log(device.hasTouch);      // boolean
console.log(device.safeAreaInsets); // { top, right, bottom, left }
```

### useInput

Access current input state including touch, gamepad, and keyboard input.

```tsx
const { leftStick, rightStick, isPressed, touches } = useInput();

// Virtual joystick position
const moveX = leftStick.x; // -1 to 1
const moveY = leftStick.y; // -1 to 1

// Button state
if (isPressed('jump')) {
  player.jump();
}

// Touch positions
touches.forEach(touch => {
  console.log(touch.position, touch.phase);
});
```

### useHaptics

Trigger haptic feedback with various styles.

```tsx
const haptics = useHaptics();

// Impact feedback (button presses)
await haptics.impact('light');
await haptics.impact('medium');
await haptics.impact('heavy');

// Notification feedback
await haptics.notification('success');
await haptics.notification('warning');
await haptics.notification('error');

// Selection feedback (list scrolling)
await haptics.selection();

// Custom pattern
await haptics.trigger({ duration: 50, intensity: 0.8 });
```

### useControlHints

Get contextual control hints based on current input mode.

```tsx
const { hints, deviceType, hasGamepad } = useControlHints();

// hints adapts to current input method
// deviceType: 'touch' | 'keyboard' | 'gamepad'

hints.forEach(hint => {
  console.log(`${hint.action}: ${hint.label}`);
  // e.g., "move: Drag to move" (touch)
  // e.g., "move: Left Stick" (gamepad)
});
```

## Modules

For direct access without hooks:

```tsx
import { DeviceModule, InputModule, HapticsModule } from '@strata/react-native';

// Get device profile
const profile = await DeviceModule.getDeviceProfile();

// Listen for changes
const subscription = DeviceModule.addListener((profile) => {
  console.log('Device changed:', profile);
});

// Update input state (for custom controls)
InputModule.updateLeftStick(0.5, -0.3);
InputModule.setButtonPressed('jump', true);

// Trigger haptics
await HapticsModule.impact('heavy');
```

## Types

All types are exported for TypeScript usage:

```tsx
import type {
  DeviceProfile,
  InputSnapshot,
  HapticPattern,
  ControlHint,
} from '@strata/react-native';
```

## License

MIT
