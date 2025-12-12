---
name: Shader/Rendering bug
about: Report visual glitches, shader errors, or rendering issues
title: '[Shader] '
labels: ['bug', 'shader']
assignees: ''

---

**Before submitting:**
- [ ] I have searched existing issues to ensure this rendering bug hasn't already been reported
- [ ] I am using the latest version of @jbcom/strata

**Describe the rendering issue**
A clear and concise description of the visual problem or shader error.

**Visual Evidence**
Please attach screenshots or videos showing:
- The current (broken) rendering
- What it should look like (if possible)

**Console Errors**
```
Paste any WebGL, shader compilation, or Three.js errors here.
Common shader errors include:
- "GLSL compile error"
- "WebGL: INVALID_OPERATION"
- "Shader compilation failed"
```

**Affected Preset**
Which Strata preset shows the rendering issue?

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

**Rendering Configuration**
 - Lighting: [e.g. single directional light, HDR environment]
 - Post-processing: [e.g. bloom, SSAO, tone mapping]
 - Custom shaders: [yes/no, details if yes]
 - Shadows enabled: [yes/no]

**Environment:**
 - OS: [e.g. Windows 11, macOS 14.2, Ubuntu 22.04]
 - Browser: [e.g. Chrome 120, Safari 17, Firefox 121]
 - GPU/Graphics Card: [e.g. NVIDIA RTX 3060, Apple M2, Intel Iris Xe]
 - WebGL Version: [e.g. WebGL 2.0, WebGPU]
 - @jbcom/strata version: [e.g. 1.0.0]
 - @react-three/fiber version: [e.g. 8.15.0]
 - three.js version: [e.g. 0.160.0]

**Reproduction**
Link to a minimal reproduction (critical for shader bugs):
- Provide a StackBlitz or GitHub repository link

**Does the issue occur on:**
- [ ] Desktop (Chrome)
- [ ] Desktop (Firefox)
- [ ] Desktop (Safari)
- [ ] Mobile (specify device)
- [ ] All platforms tested

**Additional context**
Add any other context about the rendering issue here.
