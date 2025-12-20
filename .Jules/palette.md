# Palette's Journal

## 2024-05-22 - Accessibility in Canvas Overlays
**Learning:** HTML overlays in 3D apps (via @react-three/drei Html) often miss standard accessibility attributes because they are thought of as part of the 3D scene.
**Action:** Always check `Html` wrapped components for standard ARIA roles and labels.

## 2024-05-23 - Typewriter Effects and Accessibility
**Learning:** Typewriter text effects are problematic for screen readers as they announce every character update. They also often lack keyboard controls to skip.
**Action:** Use a visually hidden `aria-live="polite"` region for the full text, `aria-hidden="true"` for the animated text, and ensure a keyboard action (e.g., Enter) is available to skip the animation.
