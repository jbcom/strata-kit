---
name: Performance issue
about: Report performance problems (FPS drops, memory leaks, GPU issues)
title: '[Perf] '
labels: 'performance'
assignees: ''

---

**Describe the performance issue**
A clear and concise description of the performance problem you're experiencing.

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

**Affected Components**
Which Strata presets/components are in use?
- [ ] Water
- [ ] Terrain
- [ ] Sky
- [ ] Vegetation
- [ ] Character
- [ ] Volumetrics
- [ ] GodRays
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
- CodeSandbox, StackBlitz, or GitHub repository link

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
