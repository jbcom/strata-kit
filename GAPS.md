# Library Gaps & Integration Issues

## 🔴 CRITICAL GAPS

### 1. GPU Wind/LOD Not Implemented
**Location**: `src/components/Instancing.tsx:GPUInstancedMesh`
**Status**: Props accepted but ignored
**Impact**: Misleading API - developers expect GPU wind/LOD but it's not implemented
**Fix Options**:
- Option A: Remove props (breaking change, but honest)
- Option B: Implement via drei's shader material system with custom vertex shader
- Option C: Document as "reserved for future" and add TODO

**Recommendation**: Option B - implement properly using drei's shader system

### 2. Type Name Conflicts
**Issue**: 
- `InstanceData` exported from both core and components (same type, OK but confusing)
- `BiomeData` has 3 aliases: SDFBiomeData, InstancingBiomeData, InstanceBiomeData
- Two different `BiomeData` interfaces (SDF vs Instancing) with compatible but different `type` fields

**Fix**: 
- Keep separate exports but document clearly
- SDF BiomeData has union type, Instancing has string type
- They're compatible but serve different purposes

## 🟡 INTEGRATION GAPS

### 3. Missing Core Material Factories
**Status**: ✅ FIXED - Created core/sky.ts and core/volumetrics.ts

### 4. Inline Shaders in Components
**Status**: ✅ FIXED - Extracted to shader files

### 5. Missing Shader Exports
**Status**: ✅ FIXED - Sky and volumetrics shaders now exported

### 6. createInstancingSetup Was Broken
**Status**: ✅ FIXED - Replaced with createInstancedMesh (returns THREE.InstancedMesh)

### 7. Core Module Had React Dependency
**Status**: ✅ FIXED - Removed drei from core/instancing.ts

## 🟢 DOCUMENTATION GAPS

### 8. API.md Missing Components
- Sky component not documented
- VolumetricEffects not fully documented
- Raymarching component missing from API.md

### 9. Missing Examples
- No example for core-only usage (no React)
- No example for shader-only usage
- No example for combining SDF + marching cubes + instancing

### 10. Missing Integration Tests
- No tests showing core + components working together
- No tests for shader material creation
- No tests for end-to-end workflows

## 🔵 ARCHITECTURAL GAPS

### 11. No Seeded Random for Instancing
**Issue**: `generateInstanceData` uses `Math.random()` - not deterministic
**Impact**: Can't reproduce same instance layouts
**Fix**: Add optional seed parameter

### 12. No Material Disposal in Some Components
**Status**: ✅ FIXED - Added disposal to Water, Sky, VolumetricEffects

### 13. Missing Error Handling
- No validation of input parameters
- No error messages for invalid configurations
- Silent failures in some cases

### 14. Performance Optimizations Missing
- No caching of SDF calculations
- No LOD system for marching cubes
- No chunking strategy documented

## 📋 PRIORITY FIXES

1. **HIGH**: Implement or remove GPU wind/LOD props
2. **HIGH**: Add seeded random to generateInstanceData
3. **MEDIUM**: Add input validation and error handling
4. **MEDIUM**: Complete API.md documentation
5. **MEDIUM**: Add integration tests
6. **LOW**: Add performance optimization examples
7. **LOW**: Document chunking strategies
