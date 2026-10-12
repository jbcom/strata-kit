import { describe, expect, it } from 'vitest';

import {
  createCubicHermiteProfile,
  deriveReliefFrame,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
  surfaceFieldsGlsl,
} from '../src/surfaceFields.ts';

describe('surface fields', () => {
  const profile = createCubicHermiteProfile([
    { coordinate: 0, value: 0, derivative: 0 },
    { coordinate: 0.5, value: 0.03, derivative: 0.04 },
    { coordinate: 1, value: 0, derivative: 0 },
  ]);

  it('samples a continuous scalar profile in caller-declared height units', () => {
    expect(sampleCubicHermiteProfile(profile, -1)).toEqual({ value: 0, derivative: 0 });
    expect(sampleCubicHermiteProfile(profile, 2)).toEqual({ value: 0, derivative: 0 });
    expect(sampleCubicHermiteProfile(profile, 0.5)).toEqual({ value: 0.03, derivative: 0.04 });

    const before = sampleCubicHermiteProfile(profile, 0.5 - 1e-6);
    const after = sampleCubicHermiteProfile(profile, 0.5 + 1e-6);
    expect(before.value).toBeCloseTo(0.03, 7);
    expect(after.value).toBeCloseTo(0.03, 7);
    expect(before.derivative).toBeCloseTo(0.04, 5);
    expect(after.derivative).toBeCloseTo(0.04, 5);
  });

  it('derives the relief normal from caller-provided surface differentials', () => {
    const frame = deriveReliefFrame(
      { du: { x: 2, y: 0, z: 0 }, dv: { x: 0, y: 3, z: 0 } },
      { du: 0.5, dv: -0.25 }
    );

    expect(frame.normal).toMatchObject({
      x: expect.closeTo(-0.2417468892, 8),
      y: expect.closeTo(0.0805822964, 8),
      z: expect.closeTo(0.9669875568, 8),
    });
    expect(Math.hypot(frame.tangent.x, frame.tangent.y, frame.tangent.z)).toBeCloseTo(1, 12);
    expect(Math.hypot(frame.bitangent.x, frame.bitangent.y, frame.bitangent.z)).toBeCloseTo(1, 12);
    expect(frame.tangent.x * frame.normal.x + frame.tangent.y * frame.normal.y + frame.tangent.z * frame.normal.z).toBeCloseTo(0, 12);
  });

  it('uses caller-owned projection derivatives to map profile slope onto the surface', () => {
    expect(
      projectScalarProfileDerivative({ value: 0.03, derivative: 0.04 }, { du: 2, dv: -0.5 })
    ).toEqual({ height: 0.03, derivatives: { du: 0.08, dv: -0.02 } });
  });

  it('uses transformed Jacobians, rather than a fixed axis or global normal matrix', () => {
    const frame = deriveReliefFrame(
      {
        du: { x: 0, y: 2, z: 0 },
        dv: { x: -3, y: 0, z: 0 },
      },
      { du: 0.25, dv: -0.5 }
    );

    expect(frame.normal).toMatchObject({
      x: expect.closeTo(-0.1631634033, 8),
      y: expect.closeTo(-0.1223725525, 8),
      z: expect.closeTo(0.9789804197, 8),
    });
  });

  it('emits a bounded GLSL profile and Jacobian-frame evaluator', () => {
    expect(surfaceFieldsGlsl).toContain('const int STRATA_KIT_MAX_PROFILE_KNOTS = 8;');
    expect(surfaceFieldsGlsl).toContain('strataKitSampleCubicHermiteProfile');
    expect(surfaceFieldsGlsl).toContain('strataKitProjectProfileDerivative');
    expect(surfaceFieldsGlsl).toContain('strataKitDeriveReliefFrame');
    expect(surfaceFieldsGlsl).not.toContain('texture(');
    expect(surfaceFieldsGlsl).not.toContain('dFdx');
  });
});
