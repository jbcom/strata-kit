---
name: Performance issue
about: Report performance problems (FPS drops, memory leaks, GPU issues)
title: '[Perf] '
labels: 'performance'
assignees: ''

---

**Before submitting:**
- [ ] I have searched existing issues to ensure this performance problem hasn't already been reported
- [ ] I am using the latest version of @jbcom/strata

**Describe the performance issue**
A clear and concise description of the performance problem you're experiencing.

**Device Tier**
What type of device are you testing on?
- [ ] High-end (dedicated GPU, gaming/workstation)
- [ ] Mid-range (integrated GPU, modern laptop)
- [ ] Low-end (older hardware, mobile)

**Performance Metrics**
 - Current FPS: [e.g. 15fps]
 - Expected FPS: [e.g. 60fps]
 - Memory usage: [e.g. 500MB, steadily increasing]
 - GPU usage: [e.g. 100%, thermal throttling]

**Scene Configuration**
 - Number of instances: [e.g. 10,000 grass blades, 500 trees]
 - Vertex count: [e.g. 500k vertices]
 - Texture resolution: [e.g. 4K textures]
 - Draw calls: [if known]

**Affected Presets**
Which Strata presets are in use?

*Background Layer:*
- [ ] Sky (procedural sky with time-of-day and weather)
- [ ] Volumetrics (volumetric fog, god rays, underwater effects)
- [ ] Terrain (SDF-based terrain generation)
- [ ] MarchingCubes (mesh generation from SDFs)

*Midground Layer:*
- [ ] Water (advanced water rendering with reflections/refractions)
- [ ] Vegetation (GPU-instanced grass, trees, rocks)
- [ ] Raymarching (GPU-accelerated SDF rendering)

*Foreground Layer:*
- [ ] Character (articulated character system)
- [ ] Fur (shell-based fur rendering)
- [ ] Molecular (molecular structure visualization)

- [ ] Other: [specify]

**Environment:**
 - OS: [e.g. Windows 11, macOS 14.2, Ubuntu 22.04]
 - Browser: [e.g. Chrome 120, Safari 17, Firefox 121]
 - GPU/Graphics Card: [e.g. NVIDIA RTX 3060, Apple M2, Intel Iris Xe]
 - WebGL Version: [e.g. WebGL 2.0, WebGPU]
 - @jbcom/strata version: [e.g. 1.0.0]
 - @react-three/fiber version: [e.g. 8.15.0]
 - three.js version: [e.g. 0.160.0]

**Reproduction**
Link to a minimal reproduction:
- Provide a StackBlitz or GitHub repository link

**Profiling Data (if available)**
If you've used browser DevTools or other profilers, please include:
- Performance timeline screenshots
- Memory snapshots
- GPU profiling data

**Console Output**
```
Paste any performance-related warnings or errors here.
```

**Additional context**
Add any other context about the performance issue here.
