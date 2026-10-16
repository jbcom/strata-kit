import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { scalarGrid16Glsl } from "../src/shaders.ts";

interface Fixture {
  name: string;
  width: number;
  height: number;
  min: number;
  range: number;
  bytes: number[];
  decodeBytes: readonly [number, number];
  decodeExpected: number;
  queries: readonly (readonly [number, number, number])[];
}
type Stage = "fragment" | "vertex";

// Fixed absolute tolerances, declared before executing either shader. Scalar
// witnesses use caller units; the direct decode witness is normalized to [0,1].
const SCALAR_TOLERANCE = 0.002;
const NORMALIZED_TOLERANCE = 2e-7;
const kernelHash = createHash("sha256").update(scalarGrid16Glsl).digest("hex");

const handFixtures: Fixture[] = [
  {
    name: "byte-carry-odd-width",
    width: 3,
    height: 1,
    min: 0,
    range: 65535,
    bytes: [0, 255, 1, 0, 1, 1],
    decodeBytes: [1, 0],
    decodeExpected: 256 / 65535,
    queries: [
      [0, 0, 255],
      [1, 0, 256],
      [2, 0, 257],
      [1.5, 0, 256.5],
      [-10, 5, 255],
      [10, -5, 257],
    ],
  },
  {
    name: "asymmetric-three-by-two",
    width: 3,
    height: 2,
    min: 13,
    range: 65535,
    // Codes [0,100,400;1000,2000,3000], hand-authored as RG8 bytes.
    bytes: [0, 0, 0, 100, 1, 144, 3, 232, 7, 208, 11, 184],
    decodeBytes: [11, 184],
    decodeExpected: 3000 / 65535,
    queries: [
      [0, 0, 13],
      [1, 0, 113],
      [2, 0, 413],
      [0, 1, 1013],
      [1, 1, 2013],
      [2, 1, 3013],
      [1.25, 0.25, 706.75],
      [0.5, 0, 63],
      [2, 0.5, 1713],
      [1.5, 1, 2513],
      [0, 0.5, 513],
      [-1e20, 0.5, 513],
      [1e20, 0.5, 1713],
      [1.5, -1e20, 263],
      [1.5, 1e20, 2513],
    ],
  },
  {
    name: "bilinear-saddle",
    width: 2,
    height: 2,
    min: 0,
    range: 1,
    bytes: [0, 0, 255, 255, 255, 255, 0, 0],
    decodeBytes: [255, 255],
    decodeExpected: 1,
    queries: [
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 0],
      [0.25, 0.25, 3 / 8],
      [0.75, 0.25, 5 / 8],
      [0.5, 0.5, 0.5],
    ],
  },
  {
    name: "singleton-point",
    width: 1,
    height: 1,
    min: -10,
    range: 65535,
    bytes: [1, 1],
    decodeBytes: [0, 255],
    decodeExpected: 255 / 65535,
    queries: [
      [0, 0, 247],
      [-1e20, 1e20, 247],
      [1e20, -1e20, 247],
    ],
  },
  {
    name: "singleton-column",
    width: 1,
    height: 3,
    min: 13,
    range: 65535,
    bytes: [0, 0, 0, 100, 1, 144],
    decodeBytes: [0, 100],
    decodeExpected: 100 / 65535,
    queries: [
      [-100, 0.5, 63],
      [100, 1.5, 263],
      [0, 10, 413],
    ],
  },
  {
    name: "singleton-row",
    width: 3,
    height: 1,
    min: 13,
    range: 65535,
    bytes: [0, 0, 0, 100, 1, 144],
    decodeBytes: [1, 144],
    decodeExpected: 400 / 65535,
    queries: [
      [0.5, 100, 63],
      [1.5, -100, 263],
      [10, 0, 413],
    ],
  },
  {
    name: "normalized-midpoint",
    width: 3,
    height: 1,
    min: -10,
    range: 20,
    bytes: [0, 0, 255, 255, 128, 0],
    decodeBytes: [128, 0],
    decodeExpected: 32768 / 65535,
    queries: [
      [0, 0, -10],
      [1, 0, 10],
      [2, 0, 10 / 65535],
    ],
  },
];

const fixtures: Fixture[] = handFixtures.map((fixture) => ({
  ...fixture,
  min: Math.fround(fixture.min),
  range: Math.fround(fixture.range),
  queries: fixture.queries.map(
    ([column, row, expected]) => [Math.fround(column), Math.fround(row), expected] as const,
  ),
}));

const position = `
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
`;
const uniforms = `
uniform highp sampler2D uData;
uniform ivec2 uSize;
uniform vec2 uIndex;
uniform vec2 uDecodeRG;
uniform float uMinimum;
uniform float uRange;
`;
const values = `vec2(
  strataSampleScalarGrid16(uData, uSize, uIndex, uMinimum, uRange),
  strataDecodeScalar16(uDecodeRG)
)`;

function shaders(stage: Stage, kernel: string) {
  if (stage === "vertex") {
    return {
      vertex: `#version 300 es
precision highp float;
${uniforms}
${kernel}
flat out vec2 vValues;
void main() { vValues = ${values}; ${position} }`,
      fragment: `#version 300 es
precision highp float;
flat in vec2 vValues;
out vec4 outColor;
void main() { outColor = vec4(vValues, 0.0, 1.0); }`,
    };
  }
  return {
    vertex: `#version 300 es
void main() { ${position} }`,
    fragment: `#version 300 es
precision highp float;
${uniforms}
${kernel}
out vec4 outColor;
void main() { outColor = vec4(${values}, 0.0, 1.0); }`,
  };
}

async function readback(
  page: Page,
  stage: Stage,
  cases = fixtures,
  kernel = scalarGrid16Glsl,
  failAfterAllocation?: number,
) {
  return page.evaluate(
    ({ sources, cases, failAfterAllocation }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl?.getExtension("EXT_color_buffer_float")) throw new Error("Float WebGL2 required");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const hardware = {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      };
      const resources = {
        shaders: [] as WebGLShader[],
        programs: [] as WebGLProgram[],
        textures: [] as WebGLTexture[],
        framebuffers: [] as WebGLFramebuffer[],
        vaos: [] as WebGLVertexArrayObject[],
      };
      let allocations = 0;
      const checkpoint = () => {
        allocations++;
        if (allocations === failAfterAllocation)
          throw new Error("Injected allocation interruption");
      };
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader allocation failed");
        resources.shaders.push(shader);
        checkpoint();
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
        return shader;
      };
      const samples: { name: string; query: readonly number[]; actual: number[] }[] = [];
      let interruption: string | undefined;
      try {
        const program = gl.createProgram();
        if (!program) throw new Error("Program allocation failed");
        resources.programs.push(program);
        checkpoint();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, sources.vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, sources.fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
        // biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram is not a React hook.
        gl.useProgram(program);
        const vao = gl.createVertexArray();
        if (!vao) throw new Error("VAO allocation failed");
        resources.vaos.push(vao);
        checkpoint();
        gl.bindVertexArray(vao);
        const allocateTexture = () => {
          const texture = gl.createTexture();
          if (!texture) throw new Error("Texture allocation failed");
          resources.textures.push(texture);
          checkpoint();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return texture;
        };
        gl.activeTexture(gl.TEXTURE1);
        const output = allocateTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new Error("Framebuffer allocation failed");
        resources.framebuffers.push(framebuffer);
        checkpoint();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error("Incomplete float framebuffer");
        gl.activeTexture(gl.TEXTURE0);
        allocateTexture();
        const location = (name: string) => {
          const value = gl.getUniformLocation(program, name);
          if (value === null) throw new Error(`Missing uniform ${name}`);
          return value;
        };
        const u = Object.fromEntries(
          ["Data", "Size", "Index", "DecodeRG", "Minimum", "Range"].map((name) => [
            name,
            location(`u${name}`),
          ]),
        );
        gl.uniform1i(u.Data, 0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.viewport(0, 0, 1, 1);
        gl.disable(gl.DITHER);
        for (const fixture of cases) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RG8,
            fixture.width,
            fixture.height,
            0,
            gl.RG,
            gl.UNSIGNED_BYTE,
            new Uint8Array(fixture.bytes),
          );
          gl.uniform2i(u.Size, fixture.width, fixture.height);
          gl.uniform1f(u.Minimum, fixture.min);
          gl.uniform1f(u.Range, fixture.range);
          gl.uniform2f(u.DecodeRG, fixture.decodeBytes[0] / 255, fixture.decodeBytes[1] / 255);
          for (const [column, row, expected] of fixture.queries) {
            gl.uniform2f(u.Index, column, row);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixels = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixels);
            if (gl.getError() !== gl.NO_ERROR || pixels.some((value) => !Number.isFinite(value)))
              throw new Error("Invalid finite RG8 float readback");
            samples.push({
              name: fixture.name,
              query: [column, row, expected, fixture.decodeExpected],
              actual: [...pixels],
            });
          }
        }
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Injected allocation interruption")
          throw error;
        interruption = error.message;
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.useProgram(null);
        for (const object of resources.framebuffers) gl.deleteFramebuffer(object);
        for (const object of resources.textures) gl.deleteTexture(object);
        for (const object of resources.vaos) gl.deleteVertexArray(object);
        for (const object of resources.programs) gl.deleteProgram(object);
        for (const object of resources.shaders) gl.deleteShader(object);
      }
      const deleted = {
        shaders: resources.shaders.every((object) => !gl.isShader(object)),
        programs: resources.programs.every((object) => !gl.isProgram(object)),
        textures: resources.textures.every((object) => !gl.isTexture(object)),
        framebuffers: resources.framebuffers.every((object) => !gl.isFramebuffer(object)),
        vaos: resources.vaos.every((object) => !gl.isVertexArray(object)),
      };
      if (Object.values(deleted).some((value) => !value) || gl.getError() !== gl.NO_ERROR)
        throw new Error("GPU resources survived cleanup");
      return {
        hardware,
        samples,
        deleted,
        allocations,
        interruption,
        mediaElements: document.querySelectorAll("audio,video").length,
      };
    },
    { sources: shaders(stage, kernel), cases, failAfterAllocation },
  );
}

for (const stage of ["fragment", "vertex"] as const) {
  test(`RG8 scalar grid has independent analytic ${stage}-stage readback`, async ({
    page,
  }, info) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const result = await readback(page, stage);
    expect(result.hardware.renderer).toMatch(/Metal/i);
    expect(result.mediaElements).toBe(0);
    expect(pageErrors).toEqual([]);
    for (const sample of result.samples) {
      expect(
        Math.abs(sample.actual[0] - sample.query[2]),
        `${sample.name} at ${sample.query.slice(0, 2)}`,
      ).toBeLessThanOrEqual(SCALAR_TOLERANCE);
      expect(
        Math.abs(sample.actual[1] - sample.query[3]),
        `${sample.name} independent direct decode`,
      ).toBeLessThanOrEqual(NORMALIZED_TOLERANCE);
      expect(sample.actual[2]).toBe(0);
      expect(sample.actual[3]).toBe(1);
    }
    await info.attach(`scalar-grid16-${stage}-readback`, {
      body: Buffer.from(
        JSON.stringify(
          {
            sourceKernelSha256: kernelHash,
            stage,
            scalarTolerance: SCALAR_TOLERANCE,
            normalizedTolerance: NORMALIZED_TOLERANCE,
            ...result,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
  });
}

test("byte-weight swap compiles and reads finite values but fails independent carry witnesses", async ({
  page,
}, info) => {
  const mutant = scalarGrid16Glsl.replace(
    "rg.r * 65280.0 + rg.g * 255.0",
    "rg.r * 255.0 + rg.g * 65280.0",
  );
  expect(mutant).not.toBe(scalarGrid16Glsl);
  const result = await readback(page, "fragment", [fixtures[0]], mutant);
  expect(result.hardware.renderer).toMatch(/Metal/i);
  expect(result.samples.length).toBeGreaterThan(0);
  const witness = result.samples.find((sample) => sample.query[0] === 1 && sample.query[1] === 0);
  if (!witness) throw new Error("Independent byte-carry witness missing");
  expect(Math.abs(witness.actual[0] - 256)).toBeGreaterThan(SCALAR_TOLERANCE);
  expect(Math.abs(witness.actual[1] - 256 / 65535)).toBeGreaterThan(NORMALIZED_TOLERANCE);
  await info.attach("scalar-grid16-finite-byte-swap-witness", {
    body: Buffer.from(
      JSON.stringify(
        {
          sourceKernelSha256: kernelHash,
          mutantKernelSha256: createHash("sha256").update(mutant).digest("hex"),
          expectedScalar: 256,
          expectedNormalized: 256 / 65535,
          ...result,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

test("partial GPU allocation interruptions still delete every acquired resource", async ({
  page,
}, info) => {
  const results = [];
  // After program, first shader, both shaders, VAO, first texture,
  // framebuffer, and second texture respectively. Every acquired handle is
  // registered before the injected interruption can occur.
  for (const allocation of [1, 2, 3, 4, 5, 6, 7]) {
    const result = await readback(page, "fragment", [fixtures[0]], scalarGrid16Glsl, allocation);
    expect(result.interruption).toBe("Injected allocation interruption");
    expect(result.allocations).toBe(allocation);
    expect(result.samples).toEqual([]);
    expect(Object.values(result.deleted).every(Boolean)).toBe(true);
    results.push(result);
  }
  await info.attach("scalar-grid16-partial-allocation-cleanup", {
    body: Buffer.from(JSON.stringify({ sourceKernelSha256: kernelHash, results }, null, 2)),
    contentType: "application/json",
  });
});
