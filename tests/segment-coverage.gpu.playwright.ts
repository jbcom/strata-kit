import { expect, type Page, test } from "@playwright/test";
import { projectPixelFootprint2D, sampleBandCoverage, sampleSegment2D } from "../src/materials.ts";
import { segmentCoverageGlsl } from "../src/shaders.ts";

type Pair = readonly [number, number];
interface Input {
  point: Pair;
  start: Pair;
  end: Pair;
  direction: Pair;
  perPixelX: Pair;
  perPixelY: Pair;
  halfWidth: number;
  feather: number;
}

const vertex = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 uPoint, uStart, uEnd, uDirection, uPixelX, uPixelY;
uniform float uHalfWidth, uFeather;
out vec4 outColor;
${segmentCoverageGlsl}
void main() {
  StrataSegmentSample2D segment = strataSampleSegment2D(uPoint, uStart, uEnd);
  float footprint = strataProjectPixelFootprint2D(uDirection, uPixelX, uPixelY);
  StrataBandCoverageSample band = strataSampleBandCoverage(
    segment.distance, uHalfWidth, uFeather, footprint
  );
  int slot = int(gl_FragCoord.x);
  if (slot == 0) outColor = vec4(segment.nearest, segment.tangent);
  else if (slot == 1) outColor = vec4(segment.t, segment.distance, segment.length, segment.along);
  else if (slot == 2) outColor = vec4(footprint, band.effectiveHalfWidth, band.edgeCoverage, band.widthCoverage);
  else outColor = vec4(band.coverage, 0.0, 0.0, 1.0);
}`;

function inputs(): Input[] {
  const result: Input[] = [];
  const add = (
    point: Pair,
    start: Pair,
    end: Pair,
    direction: Pair,
    perPixelX: Pair,
    perPixelY: Pair,
  ) => {
    for (const halfWidth of [0, 0.0001, 0.0625, 0.5])
      for (const feather of [0, 0.125])
        result.push({ point, start, end, direction, perPixelX, perPixelY, halfWidth, feather });
  };
  for (const point of [
    [-3, 0],
    [-2, 1],
    [0, 1],
    [0, 1.03125],
    [3, 1],
    [5, 2],
  ] as Pair[])
    add(point, [-2, 1], [3, 1], [0, 1], [0.125, 0], [0, 0.25]);
  for (const point of [
    [-2, 0],
    [0.5, 0.75],
    [1, 1],
    [2, 2],
  ] as Pair[])
    add(point, [-1, -1], [1, 1], [-1, 1], [0.125, 0.0625], [-0.25, 1]);
  add([0, 0], [0, 0], [0, 0], [0, 0], [0.25, 0], [0.125, 0.5]);
  add([1, 2], [0, 0], [0, 0], [1, 2], [0.25, 0], [0.125, 0.5]);
  add([3.3, 4.7], [0.1, 0.2], [3.3, 4.7], [0, 1], [0, 0], [0, 0]);
  add([0, 0.5], [-1, 0], [1, 0], [0, 1], [0, 0], [0, 0]);
  add([3.125, 1.0625], [-2, 1], [3, 1], [2, 1], [0.125, 0], [0, 0.25]);
  for (const scale of [1e-18, 1e18]) {
    for (const offset of [0.5, 0.140625])
      result.push({
        point: [0.75 * scale, offset * scale],
        start: [0, 0],
        end: [scale, 0],
        direction: [0, 1],
        perPixelX: [scale / 16, 0],
        perPixelY: [0, scale / 8],
        halfWidth: scale / 8,
        feather: scale / 32,
      });
  }
  return result.map(
    (input) =>
      Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map(Math.fround) : Math.fround(value as number),
        ]),
      ) as unknown as Input,
  );
}

async function readback(page: Page, cases: Input[], shaderFragment = fragment) {
  return page.evaluate(
    ({ cases, vertex, fragment }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 1;
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl?.getExtension("EXT_color_buffer_float"))
        throw new Error("WebGL2 float color readback is required");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const hardware = {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      };
      const shaders: WebGLShader[] = [];
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
        return shader;
      };
      let program: WebGLProgram | null = null;
      let texture: WebGLTexture | null = null;
      let framebuffer: WebGLFramebuffer | null = null;
      let vao: WebGLVertexArrayObject | null = null;
      const samples: number[][] = [];
      try {
        program = gl.createProgram();
        texture = gl.createTexture();
        framebuffer = gl.createFramebuffer();
        vao = gl.createVertexArray();
        if (!program || !texture || !framebuffer || !vao)
          throw new Error("GPU oracle allocation failed");
        const readyProgram = program;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
        // biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram is not a React hook.
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error("Float framebuffer incomplete");
        gl.viewport(0, 0, 4, 1);
        gl.disable(gl.DITHER);
        const location = (name: string) => {
          const found = gl.getUniformLocation(readyProgram, name);
          if (found === null) throw new Error(`Missing active uniform ${name}`);
          return found;
        };
        const uniform = Object.fromEntries(
          ["Point", "Start", "End", "Direction", "PixelX", "PixelY", "HalfWidth", "Feather"].map(
            (key) => [key, location(`u${key}`)],
          ),
        );
        for (const input of cases) {
          for (const [key, pair] of Object.entries({
            Point: input.point,
            Start: input.start,
            End: input.end,
            Direction: input.direction,
            PixelX: input.perPixelX,
            PixelY: input.perPixelY,
          }))
            gl.uniform2f(uniform[key], pair[0], pair[1]);
          gl.uniform1f(uniform.HalfWidth, input.halfWidth);
          gl.uniform1f(uniform.Feather, input.feather);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const pixels = new Float32Array(16);
          gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.FLOAT, pixels);
          if (gl.getError() !== gl.NO_ERROR || pixels.some((value) => !Number.isFinite(value)))
            throw new Error("Invalid float GPU readback");
          samples.push(Array.from(pixels));
        }
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.useProgram(null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        for (const shader of shaders) gl.deleteShader(shader);
      }
      if (
        gl.isTexture(texture) ||
        gl.isFramebuffer(framebuffer) ||
        gl.isVertexArray(vao) ||
        gl.isProgram(program) ||
        shaders.some((shader) => gl.isShader(shader))
      )
        throw new Error("GPU oracle resource survived disposal");
      return { hardware, samples, resourcesDeleted: true };
    },
    { cases, vertex, fragment: shaderFragment },
  );
}

test("segment and band GLSL matches finite Float32 CPU inputs through float readback", async ({
  page,
}, info) => {
  const cases = inputs();
  const result = await readback(page, cases);

  const unitless = new Set([2, 3, 4, 10, 11, 12, 13, 14, 15]);
  const comparisons = cases.map((input, index) => {
    const segment = sampleSegment2D(input.point, input.start, input.end);
    const footprint = projectPixelFootprint2D(input.direction, input.perPixelX, input.perPixelY);
    const band = sampleBandCoverage(segment.distance, input.halfWidth, input.feather, footprint);
    const expected = [
      ...segment.nearest,
      ...segment.tangent,
      segment.t,
      segment.distance,
      segment.length,
      segment.along,
      footprint,
      band.effectiveHalfWidth,
      band.edgeCoverage,
      band.widthCoverage,
      band.coverage,
      0,
      0,
      1,
    ];
    const scale = Math.max(
      ...input.point.map(Math.abs),
      ...input.start.map(Math.abs),
      ...input.end.map(Math.abs),
      ...input.perPixelX.map(Math.abs),
      ...input.perPixelY.map(Math.abs),
      input.halfWidth,
      input.feather,
      1e-25,
    );
    const actual = result.samples[index];
    for (let channel = 0; channel < 16; channel += 1) {
      const tolerance =
        3e-6 * Math.max(unitless.has(channel) ? 1 : scale, Math.abs(expected[channel]));
      expect(
        Math.abs(actual[channel] - expected[channel]),
        `case ${index} channel ${channel}: ${JSON.stringify(input)}`,
      ).toBeLessThanOrEqual(tolerance);
    }
    return { input, expected, actual };
  });
  expect(result.resourcesDeleted).toBe(true);
  await info.attach("segment-coverage-float-readback", {
    body: Buffer.from(JSON.stringify({ ...result, comparisons }, null, 2)),
    contentType: "application/json",
  });
});

test("independent band witnesses reject a finite cubic-to-linear shader defect", async ({
  page,
}, info) => {
  const witnesses: Input[] = [0.5, 1.5].map((distance) => ({
    point: [0, distance],
    start: [-1, 0],
    end: [1, 0],
    direction: [0, 1],
    perPixelX: [0.25, 0],
    perPixelY: [0, 2],
    halfWidth: 0.5,
    feather: 0,
  }));
  // H=1, E=1, width share=1/2; x=1/4 or3/4. These exact rational
  // expectations do not call the CPU implementation or derive from shader output.
  const expected = [27 / 64, 5 / 64];
  const baseline = await readback(page, witnesses);
  const assignment = "edgeCoverage = 1.0 - x * x * (3.0 - 2.0 * x);";
  expect(fragment.split(assignment)).toHaveLength(2);
  const mutant = await readback(
    page,
    witnesses,
    fragment.replace(assignment, "edgeCoverage = 1.0 - x;"),
  );
  for (let index = 0; index < witnesses.length; index += 1) {
    expect(Math.abs(baseline.samples[index][12] - expected[index])).toBeLessThan(3e-6);
    // Only a successfully compiled, finite readback can reach this verdict.
    expect(Math.abs(mutant.samples[index][12] - expected[index])).toBeGreaterThan(0.04);
  }
  expect(baseline.resourcesDeleted && mutant.resourcesDeleted).toBe(true);
  await info.attach("independent-band-defect-witnesses", {
    body: Buffer.from(JSON.stringify({ witnesses, expected, baseline, mutant }, null, 2)),
    contentType: "application/json",
  });
});
