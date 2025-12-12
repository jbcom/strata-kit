---
name: Feature request
about: Suggest an idea for this project
title: '[Feature] '
labels: 'enhancement'
assignees: ''

---

**Before submitting:**
- [ ] I have searched existing issues to ensure this feature hasn't already been requested
- [ ] I have checked the [documentation](https://github.com/jbcom/strata/blob/main/docs/GETTING_STARTED.md) to confirm this feature doesn't already exist

**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is.
Ex. I'm trying to create [specific 3D effect] but can't because [...]
Ex. The current terrain generation doesn't support [specific use case]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Use Case**
Describe how this feature would be used in a 3D scene or application. What specific rendering/graphics problem does it solve?

**Which layer/preset does this relate to?**

*Background Layer:*
- [ ] Sky (procedural sky with time-of-day and weather)
- [ ] Volumetrics (volumetric fog, god rays, underwater effects - also works with Water)
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

- [ ] Core/Other (specify below)

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Impact & Performance Considerations**
- [ ] This is a new feature (no breaking changes)
- [ ] This modifies existing APIs
- [ ] This is a breaking change

**Shader Complexity:** Does this require new uniforms, texture samplers, or shader passes?

**GPU/WebGL Performance:** Are there performance implications to consider?

**Mobile Support:** Should this feature work on mobile devices?
- [ ] Yes, mobile support is required
- [ ] Desktop-only is acceptable
- [ ] Not sure

**Priority:** How critical is this to your project?
- [ ] Nice-to-have
- [ ] Important
- [ ] Blocking

**Additional context**
Add any other context or screenshots about the feature request here.
