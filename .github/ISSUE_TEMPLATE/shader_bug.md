---
name: Shader/Rendering bug
about: Report visual glitches, shader errors, or rendering issues
title: '[Shader] '
labels: ['bug', 'shader']
assignees: ''

---

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

**Affected Component**
Which preset or component shows the rendering issue?
- [ ] Water (reflections, refractions, waves)
- [ ] Terrain (height mapping, textures, normals)
- [ ] Sky (atmosphere, sun, clouds)
- [ ] Vegetation (grass, trees, wind animation)
- [ ] Character (fur, skin, animation)
- [ ] Volumetrics (fog, god rays)
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
- CodeSandbox, StackBlitz, or GitHub repository link

**Does the issue occur on:**
- [ ] Desktop (Chrome)
- [ ] Desktop (Firefox)
- [ ] Desktop (Safari)
- [ ] Mobile (specify device)
- [ ] All platforms tested

**Additional context**
Add any other context about the rendering issue here.
