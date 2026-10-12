import { expect, test } from '@playwright/test';

import {
  createCubicHermiteProfile,
  deriveReliefFrame,
  projectScalarProfileDerivative,
  sampleCubicHermiteProfile,
  surfaceFieldsGlsl,
  toCubicHermiteProfileUniforms,
  type SurfaceDifferentials,
} from '../src/surfaceFields.ts';

const profile = createCubicHermiteProfile([
  { coordinate: 0, value: 0, derivative: 0 },
  { coordinate: 0.5, value: 0.03125, derivative: 0.0625 },
  { coordinate: 1, value: 0, derivative: 0 },
]);
const uniforms = toCubicHermiteProfileUniforms(profile);

const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform float uCoordinates[8];
uniform float uValues[8];
uniform float uDerivatives[8];
uniform int uKnotCount;
uniform vec3 uDpu;
uniform vec3 uDpv;
uniform int uMode;
in vec2 vUv;
out vec4 outColor;
${surfaceFieldsGlsl}
void main() {
  vec2 profileSample = strataKitSampleCubicHermiteProfile(
    vUv.x, uCoordinates, uValues, uDerivatives, uKnotCount
  );
  vec3 relief = strataKitProjectProfileDerivative(profileSample, vec2(1.0, 0.0));
  mat3 frame = strataKitDeriveReliefFrame(uDpu, uDpv, relief.yz);
  vec3 outputNormal = frame[2];
  if (uMode == 1) {
    // Normal-map composition remains consumer-owned; this only consumes the returned frame.
    outputNormal = normalize(frame * normalize(vec3(0.35, -0.2, 0.915)));
  }
  outColor = vec4(
    vec2(relief.x * 8.0 + 0.5, relief.y * 4.0 + 0.5),
    outputNormal.xy * 0.5 + 0.5
  );
}`;

interface GpuSample {
  readonly coordinate: number;
  readonly mode: number;
  readonly height: number;
  readonly derivativeU: number;
  readonly normalX: number;
  readonly normalY: number;
}

function normalizeVector(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

const normalMap = normalizeVector({ x: 0.35, y: -0.2, z: 0.915 });

function composeConsumerNormal(frame: ReturnType<typeof deriveReliefFrame>) {
  return normalizeVector({
    x: frame.tangent.x * normalMap.x + frame.bitangent.x * normalMap.y + frame.normal.x * normalMap.z,
    y: frame.tangent.y * normalMap.x + frame.bitangent.y * normalMap.y + frame.normal.y * normalMap.z,
    z: frame.tangent.z * normalMap.x + frame.bitangent.z * normalMap.y + frame.normal.z * normalMap.z,
  });
}

function expectGpuParity(samples: readonly GpuSample[], differentials: SurfaceDifferentials): void {
  for (const gpu of samples) {
    const profileSample = sampleCubicHermiteProfile(profile, gpu.coordinate);
    const relief = projectScalarProfileDerivative(profileSample, { du: 1, dv: 0 });
    const frame = deriveReliefFrame(differentials, relief.derivatives);
    // RGBA8 readback bounds each component's encoding error to 1 / 255.
    expect(gpu.height).toBeCloseTo(relief.height, 2);
    expect(gpu.derivativeU).toBeCloseTo(relief.derivatives.du, 1);
    const normal = gpu.mode === 0 ? frame.normal : composeConsumerNormal(frame);
    expect(gpu.normalX).toBeCloseTo(normal.x, 2);
    expect(gpu.normalY).toBeCloseTo(normal.y, 2);
  }
}

test('compiled WebGL2 profile and Jacobian relief evaluator matches the CPU oracle at vertices and interiors', async ({
  page,
}) => {
  const rotatedScaledJacobians = [
    {
      // Rotated 90 degrees about Z and non-uniformly scaled by (2, 3, 0.5).
      du: { x: 0, y: 2, z: 0 },
      dv: { x: -3, y: 0, z: 0 },
    },
    {
      // R_y(45 deg) * R_x(30 deg) * scale(2, 3, 0.5), applied to the rest Jacobian.
      du: { x: Math.SQRT2, y: 0, z: Math.SQRT2 },
      dv: {
        x: (3 * Math.sqrt(3)) / (2 * Math.SQRT2),
        y: (3 * Math.sqrt(3)) / 2,
        z: (3 * Math.sqrt(3)) / (2 * Math.SQRT2),
      },
    },
  ] satisfies readonly SurfaceDifferentials[];

  const results = await page.evaluate(
    ({ vertex, fragment, gpuUniforms, jacobians }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 4;
      const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL2 is required for the GPU oracle');
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Could not allocate shader');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed');
        }
        return shader;
      };
      const program = gl.createProgram();
      if (!program) throw new Error('Could not allocate WebGL program');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'Program linking failed');
      }
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Could not allocate vertex buffer');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const uniform = (name: string) => {
        const location = gl.getUniformLocation(program, name);
        if (!location) throw new Error(`Missing uniform ${name}`);
        return location;
      };
      gl.uniform1fv(uniform('uCoordinates[0]'), gpuUniforms.coordinates);
      gl.uniform1fv(uniform('uValues[0]'), gpuUniforms.values);
      gl.uniform1fv(uniform('uDerivatives[0]'), gpuUniforms.derivatives);
      gl.uniform1i(uniform('uKnotCount'), gpuUniforms.knotCount);
      gl.viewport(0, 0, canvas.width, canvas.height);
      return jacobians.flatMap((jacobian) =>
        [0, 1].map((mode) => {
          gl.uniform3f(uniform('uDpu'), jacobian.du.x, jacobian.du.y, jacobian.du.z);
          gl.uniform3f(uniform('uDpv'), jacobian.dv.x, jacobian.dv.y, jacobian.dv.z);
          gl.uniform1i(uniform('uMode'), mode);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return Array.from({ length: canvas.width }, (_, x) => {
            const offset = x * 4;
            return {
              coordinate: (x + 0.5) / canvas.width,
              mode,
              height: (pixels[offset] / 255 - 0.5) / 8,
              derivativeU: (pixels[offset + 1] / 255 - 0.5) / 4,
              normalX: (pixels[offset + 2] / 255 - 0.5) * 2,
              normalY: (pixels[offset + 3] / 255 - 0.5) * 2,
            };
          });
        })
      );
    },
    {
      vertex: vertexSource,
      fragment: fragmentSource,
      gpuUniforms: {
        coordinates: Array.from(uniforms.coordinates),
        values: Array.from(uniforms.values),
        derivatives: Array.from(uniforms.derivatives),
        knotCount: uniforms.knotCount,
      },
      jacobians: rotatedScaledJacobians,
    }
  );

  expectGpuParity(results[0], rotatedScaledJacobians[0]);
  expectGpuParity(results[1], rotatedScaledJacobians[0]);
  expectGpuParity(results[2], rotatedScaledJacobians[1]);
  expectGpuParity(results[3], rotatedScaledJacobians[1]);
});
