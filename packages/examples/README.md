# Strata Examples

Simple showcase games demonstrating Strata's capabilities.

## Examples

### `/showcase` - Feature Showcase
A simple interactive scene that demonstrates ALL Strata features in one place:
- Procedural terrain with SDF marching cubes
- Dynamic water with reflections
- GPU-instanced vegetation (grass, trees, rocks)
- Procedural sky with day/night cycle
- Volumetric fog and god rays
- GPU particle systems (fire, smoke, magic)
- Weather system (rain, snow, lightning)
- Procedural clouds
- AI agents with steering behaviors
- Spatial audio
- Physics simulation
- Post-processing effects
- Procedural animation
- Game UI overlays
- Custom shaders

### `/fps` - First Person Demo
Walk around and experience Strata's world from first-person perspective.

### `/flythrough` - Cinematic Flythrough
Automated camera path through a procedurally generated world.

## Building

```bash
pnpm --filter @strata/examples build
```

## Cross-Platform

Each example builds for:
- **Web** - Static HTML/JS via Vite
- **Android** - APK via Capacitor
- **Desktop** - Electron app (Windows/macOS/Linux)
