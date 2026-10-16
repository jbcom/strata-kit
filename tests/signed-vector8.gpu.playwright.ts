import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { signedVector8Glsl } from "../src/shaders.ts";

async function attachJson(
  info: TestInfo,
  name: string,
  attachment: { body: Buffer; contentType: string },
) {
  await writeFile(info.outputPath(`${name}.json`), attachment.body);
  await info.attach(name, attachment);
}

type Triple = readonly [number, number, number];
type Stage = "fragment" | "vertex";
interface Query {
  name: string;
  mode: number;
  texel: number;
  weight: number;
  expected: Triple;
  normalized: boolean;
}
interface Fixture {
  name: string;
  bytes: readonly number[];
  linear: boolean;
  queries: readonly Query[];
}

// Declared before GPU execution. Components and decoded values stay in [-1,1].
// The dyadic two-texel sample has exact Float32 UV and filter weight. The unit
// witnesses blend vectors with lengths near one, away from normalization's zero.
const RAW_TOLERANCE = 2e-7;
const UNIT_TOLERANCE = 2e-6;
const MINIMUM_ORDER_DISTANCE = 1e-4;
const WEIGHT = 3 / 8;
const kernelHash = createHash("sha256").update(signedVector8Glsl).digest("hex");

function unit([x, y, z]: Triple): Triple {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

// Independent literal rational vectors from authored byte triples. No packer or
// decoder under test is used to construct an expected value.
const rawA: Triple = [1 / 255, 1, 1 / 255];
const rawB: Triple = [147 / 255, 147 / 255, 147 / 255];
const rawBlend: Triple = [55.75 / 255, 214.5 / 255, 55.75 / 255];
const correctUnitBlend = unit(rawBlend);
const unitA = unit(rawA);
const unitB = unit(rawB);
const prematureUnitBlend = unit([
  unitA[0] * (1 - WEIGHT) + unitB[0] * WEIGHT,
  unitA[1] * (1 - WEIGHT) + unitB[1] * WEIGHT,
  unitA[2] * (1 - WEIGHT) + unitB[2] * WEIGHT,
]);
const analyticOrderDistance = Math.hypot(
  correctUnitBlend[0] - prematureUnitBlend[0],
  correctUnitBlend[1] - prematureUnitBlend[1],
  correctUnitBlend[2] - prematureUnitBlend[2],
);

const directFixture: Fixture = {
  name: "hand-authored-signed-components",
  linear: false,
  bytes: [
    0, 128, 255, 17, 32, 192, 240, 0, 128, 255, 128, 255, 128, 128, 128, 255, 0, 0, 0, 0, 255, 0,
    128, 23, 128, 159, 128, 255, 32, 192, 240, 255,
  ],
  queries: [
    {
      name: "negative-zero-positive-and-nonopaque-alpha",
      mode: 0,
      texel: 0,
      weight: 0,
      expected: [-1, 1 / 255, 1],
      normalized: false,
    },
    {
      name: "unequal-signed-channels-alpha-zero",
      mode: 0,
      texel: 1,
      weight: 0,
      expected: [-191 / 255, 129 / 255, 225 / 255],
      normalized: false,
    },
    {
      name: "flat-normal-raw-tilt",
      mode: 0,
      texel: 2,
      weight: 0,
      expected: rawA,
      normalized: false,
    },
    {
      name: "encoded-zero-is-small-nonzero-raw-vector",
      mode: 0,
      texel: 3,
      weight: 0,
      expected: [1 / 255, 1 / 255, 1 / 255],
      normalized: false,
    },
    {
      name: "negative-corner-keeps-nonunit-magnitude",
      mode: 0,
      texel: 4,
      weight: 0,
      expected: [-1, -1, -1],
      normalized: false,
    },
    {
      name: "opposing-axes-and-positive-zero-tilt",
      mode: 0,
      texel: 5,
      weight: 0,
      expected: [1, -1, 1 / 255],
      normalized: false,
    },
    {
      name: "quarter-height-vector-is-not-normalized",
      mode: 0,
      texel: 6,
      weight: 0,
      expected: [1 / 255, 63 / 255, 1 / 255],
      normalized: false,
    },
    {
      name: "same-rgb-alpha-opaque",
      mode: 0,
      texel: 7,
      weight: 0,
      expected: [-191 / 255, 129 / 255, 225 / 255],
      normalized: false,
    },
  ],
};

const blendFixture: Fixture = {
  name: "two-texel-linear-filter-and-consumer-order",
  // A is encoded (0,1,0); B is the authored byte encoding of a unit
  // (1,1,1)/sqrt(3). Alpha is deliberately different and irrelevant.
  bytes: [128, 255, 128, 255, 201, 201, 201, 9],
  linear: true,
  queries: [
    {
      name: "linear-filter-then-raw-decode",
      mode: 1,
      texel: 0,
      weight: WEIGHT,
      expected: rawBlend,
      normalized: false,
    },
    {
      name: "linear-filter-then-one-consumer-normalize",
      mode: 2,
      texel: 0,
      weight: WEIGHT,
      expected: correctUnitBlend,
      normalized: true,
    },
    {
      name: "explicit-raw-blend-then-one-consumer-normalize",
      mode: 3,
      texel: 0,
      weight: WEIGHT,
      expected: correctUnitBlend,
      normalized: true,
    },
    {
      name: "prematurely-normalized-samples-are-distinct",
      mode: 4,
      texel: 0,
      weight: WEIGHT,
      expected: prematureUnitBlend,
      normalized: true,
    },
  ],
};

const position = `
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
`;
const consumer = `
uniform highp sampler2D uData;
uniform int uMode;
uniform int uTexel;
uniform float uWeight;
vec3 consumerValue() {
  if (uMode == 0) {
    return strataDecodeSignedVector8(texelFetch(uData, ivec2(uTexel, 0), 0).rgb);
  }
  if (uMode == 1 || uMode == 2) {
    // The caller owns this two-texel texture, filter and texel-centre mapping.
    vec2 uv = vec2((0.5 + uWeight) / 2.0, 0.5);
    vec3 raw = strataDecodeSignedVector8(textureLod(uData, uv, 0.0).rgb);
    return uMode == 2 ? normalize(raw) : raw;
  }
  vec3 a = strataDecodeSignedVector8(texelFetch(uData, ivec2(0, 0), 0).rgb);
  vec3 b = strataDecodeSignedVector8(texelFetch(uData, ivec2(1, 0), 0).rgb);
  if (uMode == 4) { a = normalize(a); b = normalize(b); }
  return normalize(mix(a, b, uWeight));
}
`;

function shaders(stage: Stage, kernel: string) {
  const header = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
  if (stage === "vertex") {
    return {
      vertex: `${header}${kernel}\n${consumer}\nflat out vec3 vValue;
void main() { vValue = consumerValue(); ${position} }`,
      fragment: `${header}flat in vec3 vValue;\nout vec4 outColor;
void main() { outColor = vec4(vValue, 1.0); }`,
    };
  }
  return {
    vertex: `${header}void main() { ${position} }`,
    fragment: `${header}${kernel}\n${consumer}\nout vec4 outColor;
void main() { outColor = vec4(consumerValue(), 1.0); }`,
  };
}

async function readback(
  page: Page,
  stage: Stage,
  cases: readonly Fixture[] = [directFixture, blendFixture],
  kernel = signedVector8Glsl,
  failAfterAllocation?: number,
) {
  return page.evaluate(
    ({ sources, cases, failAfterAllocation }) => {
      let audioGuardVerified = false;
      if (typeof window.AudioContext === "function") {
        Object.defineProperty(window, "AudioContext", {
          configurable: true,
          value: new Proxy(window.AudioContext, {
            construct() {
              throw new Error("Audio forbidden in signed-vector GPU test");
            },
          }),
        });
        try {
          new window.AudioContext();
        } catch (error) {
          audioGuardVerified =
            error instanceof Error && error.message === "Audio forbidden in signed-vector GPU test";
        }
      }
      if (!audioGuardVerified) throw new Error("Audio guard was not verified");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl?.getExtension("EXT_color_buffer_float")) throw new Error("Float WebGL2 required");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const hardware = {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vertexPrecision:
          gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)?.precision ?? 0,
        fragmentPrecision:
          gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ?? 0,
      };
      if (hardware.vertexPrecision < 23 || hardware.fragmentPrecision < 23)
        throw new Error("Float32 highp precision required");
      const resources = {
        programs: [] as WebGLProgram[],
        shaders: [] as WebGLShader[],
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
        const object = gl.createShader(type);
        if (!object) throw new Error("Shader allocation failed");
        resources.shaders.push(object);
        checkpoint();
        gl.shaderSource(object, source);
        gl.compileShader(object);
        if (!gl.getShaderParameter(object, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(object) ?? "Shader compile failed");
        return object;
      };
      const samples: {
        fixture: string;
        name: string;
        expected: readonly number[];
        normalized: boolean;
        actual: number[];
      }[] = [];
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
          const object = gl.createTexture();
          if (!object) throw new Error("Texture allocation failed");
          resources.textures.push(object);
          checkpoint();
          gl.bindTexture(gl.TEXTURE_2D, object);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return object;
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
          const result = gl.getUniformLocation(program, name);
          if (result === null) throw new Error(`Missing active uniform ${name}`);
          return result;
        };
        const uData = location("uData"),
          uMode = location("uMode"),
          uTexel = location("uTexel"),
          uWeight = location("uWeight");
        gl.uniform1i(uData, 0);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.viewport(0, 0, 1, 1);
        gl.disable(gl.DITHER);
        for (const fixture of cases) {
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            fixture.linear ? gl.LINEAR : gl.NEAREST,
          );
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MAG_FILTER,
            fixture.linear ? gl.LINEAR : gl.NEAREST,
          );
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            fixture.bytes.length / 4,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array(fixture.bytes),
          );
          for (const query of fixture.queries) {
            gl.uniform1i(uMode, query.mode);
            gl.uniform1i(uTexel, query.texel);
            gl.uniform1f(uWeight, query.weight);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixels = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixels);
            if (gl.getError() !== gl.NO_ERROR || pixels.some((value) => !Number.isFinite(value)))
              throw new Error("Invalid finite signed-vector float readback");
            samples.push({
              fixture: fixture.name,
              name: query.name,
              expected: query.expected,
              normalized: query.normalized,
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
        programs: resources.programs.every((object) => !gl.isProgram(object)),
        shaders: resources.shaders.every((object) => !gl.isShader(object)),
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
        audioGuardVerified,
        mediaElements: document.querySelectorAll("audio,video").length,
      };
    },
    { sources: shaders(stage, kernel), cases, failAfterAllocation },
  );
}

for (const stage of ["fragment", "vertex"] as const) {
  test(`raw signed-vector bytes have independent ${stage}-stage readback`, async ({
    page,
  }, info) => {
    const pageErrors: string[] = [],
      consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const result = await readback(page, stage);
    expect(result.hardware.renderer).toMatch(/Apple.*Metal|Metal.*Apple/i);
    expect(result.hardware.renderer).not.toMatch(/SwiftShader|llvmpipe|software/i);
    expect(result.audioGuardVerified).toBe(true);
    expect(result.mediaElements).toBe(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(result.samples).toHaveLength(12);
    for (const sample of result.samples) {
      const tolerance = sample.normalized ? UNIT_TOLERANCE : RAW_TOLERANCE;
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(sample.actual[channel] - sample.expected[channel]),
          `${sample.name} channel${channel}`,
        ).toBeLessThanOrEqual(tolerance);
      expect(sample.actual[3]).toBe(1);
    }
    const find = (name: string) => {
      const sample = result.samples.find((value) => value.name === name);
      if (!sample) throw new Error(`Missing independent witness ${name}`);
      return sample.actual;
    };
    const nonopaque = find("unequal-signed-channels-alpha-zero"),
      opaque = find("same-rgb-alpha-opaque");
    for (let channel = 0; channel < 3; channel++) expect(nonopaque[channel]).toBe(opaque[channel]);
    const zero = find("encoded-zero-is-small-nonzero-raw-vector");
    expect(Math.hypot(...zero.slice(0, 3))).toBeLessThan(0.01);
    expect(zero.slice(0, 3).every((value) => value > 0)).toBe(true);
    const filtered = find("linear-filter-then-one-consumer-normalize"),
      explicit = find("explicit-raw-blend-then-one-consumer-normalize"),
      premature = find("prematurely-normalized-samples-are-distinct");
    for (let channel = 0; channel < 3; channel++)
      expect(Math.abs(filtered[channel] - explicit[channel])).toBeLessThanOrEqual(UNIT_TOLERANCE);
    const measuredOrderDistance = Math.hypot(
      ...filtered.slice(0, 3).map((value, channel) => value - premature[channel]),
    );
    expect(analyticOrderDistance).toBeGreaterThan(MINIMUM_ORDER_DISTANCE);
    expect(measuredOrderDistance).toBeGreaterThan(MINIMUM_ORDER_DISTANCE);
    await attachJson(info, `signed-vector8-${stage}-readback`, {
      body: Buffer.from(
        JSON.stringify(
          {
            sourceKernelSha256: kernelHash,
            stage,
            rawTolerance: RAW_TOLERANCE,
            unitTolerance: UNIT_TOLERANCE,
            analyticOrderDistance,
            measuredOrderDistance,
            minimumOrderDistance: MINIMUM_ORDER_DISTANCE,
            filterWeight: WEIGHT,
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

test("finite RGB channel swap compiles but fails the independent signed-channel predicate", async ({
  page,
}, info) => {
  const mutant = signedVector8Glsl.replace(/\brgb\s*\*\s*2\.0\s*-\s*1\.0\b/, "rgb.bgr * 2.0 - 1.0");
  expect(mutant).not.toBe(signedVector8Glsl);
  const result = await readback(page, "fragment", [directFixture], mutant);
  expect(result.hardware.renderer).toMatch(/Apple.*Metal|Metal.*Apple/i);
  expect(result.audioGuardVerified).toBe(true);
  expect(result.mediaElements).toBe(0);
  const witness = result.samples.find(
    (value) => value.name === "unequal-signed-channels-alpha-zero",
  );
  if (!witness) throw new Error("Independent signed-channel witness missing");
  expect(witness.actual.every(Number.isFinite)).toBe(true);
  const predicate = (rgb: readonly number[]) => rgb[0] < -0.7 && rgb[2] > 0.8;
  expect(predicate(witness.expected)).toBe(true);
  expect(predicate(witness.actual)).toBe(false);
  expect(Math.abs(witness.actual[0] - witness.expected[0])).toBeGreaterThan(1);
  await attachJson(info, "signed-vector8-finite-channel-swap-witness", {
    body: Buffer.from(
      JSON.stringify(
        {
          sourceKernelSha256: kernelHash,
          mutantKernelSha256: createHash("sha256").update(mutant).digest("hex"),
          predicate: "red<-0.7 && blue>0.8",
          rawTolerance: RAW_TOLERANCE,
          ...result,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

test("signed-vector partial allocation interruptions delete every acquired GPU resource", async ({
  page,
}, info) => {
  const results = [];
  // Program, each shader, VAO, output texture, framebuffer, input texture.
  // Every acquired handle is registered before an interruption can occur.
  for (const allocation of [1, 2, 3, 4, 5, 6, 7]) {
    const result = await readback(page, "fragment", [directFixture], signedVector8Glsl, allocation);
    expect(result.hardware.renderer).toMatch(/Apple.*Metal|Metal.*Apple/i);
    expect(result.audioGuardVerified).toBe(true);
    expect(result.mediaElements).toBe(0);
    expect(result.interruption).toBe("Injected allocation interruption");
    expect(result.allocations).toBe(allocation);
    expect(result.samples).toEqual([]);
    expect(Object.values(result.deleted).every(Boolean)).toBe(true);
    results.push(result);
  }
  await attachJson(info, "signed-vector8-partial-allocation-cleanup", {
    body: Buffer.from(JSON.stringify({ sourceKernelSha256: kernelHash, results }, null, 2)),
    contentType: "application/json",
  });
});
