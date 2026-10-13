import assert from "node:assert/strict";
import {
  bakeUvAtlas,
  bakeSurface,
  composeSurfaceLayers,
  createReskinPlan,
  createRevolvedMesh,
  createSheetMesh,
  createSweptMesh,
  createWearField,
} from "../dist/index.js";

const materialSize = 256;
const materialSeed = "workshop-17";

function surface(field, color, roughness, metalness, height) {
  return {
    sample(u, v) {
      const value = field.sample(u, v);
      const grain = 0.86 + value.fine * 0.26;
      return {
        color: [...color.map((channel) => Math.min(255, channel * grain)), 255],
        roughness: Math.min(1, roughness + value.mid * 0.09),
        metalness,
        bump: (value.fine - 0.5) * height,
      };
    },
  };
}

function expectedMaterialSampler(scale) {
  const field = createWearField({
    seed: materialSeed,
    scale,
    amount: 1,
    edgeBias: 0.62,
    bottomBias: 1,
  });
  const sample = (u, v) => field.sample(u, v);
  return composeSurfaceLayers(surface(field, [179, 187, 191], 0.55, 0, 0.06), [
    { sampler: surface(field, [113, 124, 133], 0.2, 1, 0.16), mask: (u, v) => sample(u, v).chip },
    { sampler: surface(field, [161, 79, 35], 0.73, 0, 0.23), mask: (u, v) => sample(u, v).steel },
    { sampler: surface(field, [57, 34, 25], 0.86, 0, 0.28), mask: (u, v) => sample(u, v).oxide },
    {
      sampler: surface(field, [64, 47, 35], 0.77, 0, 0.11),
      mask: (u, v) => sample(u, v).drip * 0.22,
    },
  ]);
}

/**
 * The acceptance oracle deliberately reconstructs the normal coating recipe
 * without reading gallery defect state, diagnostic counters, or bake ranges.
 */
export function expectedMaterialBake(scale) {
  return bakeSurface(expectedMaterialSampler(scale), { width: materialSize, height: materialSize });
}

function assertExpectedWearSignal(scale) {
  const field = createWearField({
    seed: materialSeed,
    scale,
    amount: 1,
    edgeBias: 0.62,
    bottomBias: 1,
  });
  let oxide = 0;
  let top = 0;
  let bottom = 0;
  for (let row = 0; row < materialSize; row += 1)
    for (let column = 0; column < materialSize; column += 1) {
      const value = field.sample((column + 0.5) / materialSize, (row + 0.5) / materialSize);
      const directionalWear = value.oxide + value.drip * 0.22;
      oxide += value.oxide;
      if (row < materialSize / 2) top += directionalWear;
      else bottom += directionalWear;
    }
  assert(oxide > 0, "the fixed material fixture must contain oxide before candidate comparison");
  assert(
    bottom > top,
    "the fixed material fixture must have stronger gravity-oriented lower-half wear",
  );
  return { oxide, top, bottom };
}

function asBytes(bytes, name) {
  assert(
    Array.isArray(bytes) || bytes instanceof Uint8Array,
    `${name} must be a byte array read from the active renderer bake`,
  );
  return Uint8Array.from(bytes);
}

function byteMismatch(actual, expected) {
  if (actual.length !== expected.length)
    return { index: -1, actual: actual.length, expected: expected.length };
  for (let index = 0; index < actual.length; index += 1)
    if (actual[index] !== expected[index])
      return { index, actual: actual[index], expected: expected[index] };
  return undefined;
}

/** Compares arbitrary byte sequences without formatting an unbounded assertion diff. */
export function assertByteSequenceEqual(actual, expected, label) {
  const mismatch = byteMismatch(actual, expected);
  if (mismatch)
    throw new Error(
      `${label}: byte ${mismatch.index} expected ${mismatch.expected}, received ${mismatch.actual}`,
    );
}

function mapMismatch(actual, expected) {
  const names = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  for (const name of names) {
    if (!(name in actual) || !(name in expected)) return { name, missing: true };
    const mismatch = byteMismatch(actual[name], expected[name]);
    if (mismatch) return { name, ...mismatch };
  }
  return undefined;
}

/** Compares all baked maps with one bounded channel/index diagnostic on failure. */
export function assertByteMapSetEqual(actual, expected, label) {
  const mismatch = mapMismatch(actual, expected);
  if (mismatch?.missing) throw new Error(`${label}: map ${mismatch.name} is missing`);
  if (mismatch)
    throw new Error(
      `${label}: ${mismatch.name} byte ${mismatch.index} expected ${mismatch.expected}, received ${mismatch.actual}`,
    );
}

/** Reports whether a candidate map set differs without asking Node to format its bytes. */
export function byteMapSetsDiffer(actual, expected) {
  return mapMismatch(actual, expected) !== undefined;
}

function assertBakeMaps(actual, expected, label) {
  const pixels = materialSize * materialSize;
  assert.equal(actual.color.length, pixels * 4, `${label}: color map must be RGBA8`);
  assert.equal(actual.roughness.length, pixels, `${label}: roughness map must be R8`);
  assert.equal(actual.bump.length, pixels, `${label}: bump map must be R8`);
  assert.equal(actual.metalness.length, pixels, `${label}: metalness map must be R8`);
  for (let index = 3; index < actual.color.length; index += 4)
    assert.equal(actual.color[index], 255, `${label}: composited color must stay opaque`);
  assertByteSequenceEqual(
    actual.color,
    expected.color,
    `${label}: color must match the fixed-orientation oxide oracle`,
  );
  assertByteSequenceEqual(
    actual.roughness,
    expected.roughness,
    `${label}: roughness must stay coherent with color`,
  );
  assertByteSequenceEqual(
    actual.bump,
    expected.bump,
    `${label}: bump must stay coherent with color`,
  );
  assertByteSequenceEqual(
    actual.metalness,
    expected.metalness,
    `${label}: metalness must stay coherent with color`,
  );
}

function adapterBytes(data, width, height, stride, grayscale) {
  const channels = grayscale ? 4 : stride;
  const output = new Uint8Array(width * height * channels);
  for (let row = 0; row < height; row += 1)
    for (let column = 0; column < width; column += 1) {
      const source = ((height - 1 - row) * width + column) * stride;
      const target = (row * width + column) * channels;
      if (grayscale) {
        output[target] = data[source];
        output[target + 1] = data[source];
        output[target + 2] = data[source];
        output[target + 3] = 255;
      } else
        for (let channel = 0; channel < stride; channel += 1)
          output[target + channel] = data[source + channel];
    }
  return output;
}

/** Independently packs a bake to the documented Three adapter texture contract. */
export function expectedAdapterTextures(bake) {
  const scalar = { channels: 4, format: "RGBAFormat", colorSpace: "", flipY: false };
  return {
    color: {
      bytes: adapterBytes(bake.color, bake.width, bake.height, 4, false),
      channels: 4,
      format: "RGBAFormat",
      colorSpace: "srgb",
      flipY: false,
    },
    roughness: { bytes: adapterBytes(bake.roughness, bake.width, bake.height, 1, true), ...scalar },
    bump: {
      bytes: adapterBytes(bake.bump, bake.width, bake.height, 1, false),
      channels: 1,
      format: "RedFormat",
      colorSpace: "",
      flipY: false,
    },
    ...(bake.metalness
      ? {
          metalness: {
            bytes: adapterBytes(bake.metalness, bake.width, bake.height, 1, true),
            ...scalar,
          },
        }
      : {}),
  };
}

/** Validates actual scene-bound DataTextures against independent adapter packing. */
export function assertTextureBindingAcceptance(metadata, textureBytes, bake, label) {
  assert(metadata && typeof metadata === "object", `${label}: bound texture metadata is required`);
  assert.equal(
    metadata.sceneBound,
    true,
    `${label}: material must belong to the active visible scene object`,
  );
  const expected = expectedAdapterTextures(bake);
  for (const [name, texture] of Object.entries(expected)) {
    assert.equal(
      metadata.bindings?.[name],
      true,
      `${label}: ${name} texture must be bound to its material slot`,
    );
    const actualMetadata = metadata.textures?.[name];
    assert(actualMetadata, `${label}: ${name} texture metadata is missing`);
    assert.equal(
      actualMetadata.width,
      bake.width,
      `${label}: ${name} texture width must match bake`,
    );
    assert.equal(
      actualMetadata.height,
      bake.height,
      `${label}: ${name} texture height must match bake`,
    );
    assert.equal(
      actualMetadata.bytes,
      texture.bytes.length,
      `${label}: ${name} texture byte length must match adapter packing`,
    );
    assert.equal(
      actualMetadata.channels,
      texture.channels,
      `${label}: ${name} texture channel layout must match adapter packing`,
    );
    assert.equal(
      actualMetadata.format,
      texture.format,
      `${label}: ${name} texture format must match adapter packing`,
    );
    assert.equal(
      actualMetadata.colorSpace,
      texture.colorSpace,
      `${label}: ${name} texture color space must match adapter packing`,
    );
    assert.equal(
      actualMetadata.flipY,
      texture.flipY,
      `${label}: ${name} texture must not apply a second row flip`,
    );
    assertByteSequenceEqual(
      asBytes(textureBytes[name], `${label} ${name}`),
      texture.bytes,
      `${label}: ${name} texture bytes must match reversed-row adapter packing`,
    );
  }
}

/** Validates raw material maps used by the current rendered gallery mode. */
export function assertMaterialAcceptance(state, maps) {
  assert.equal(state.mode, "materials", "material acceptance requires the materials mode");
  assert.equal(state.seed, materialSeed, "material acceptance requires the fixed seeded scene");
  assert.equal(state.scale, 1, "material acceptance requires the fixed 1 m domain");
  const actual = {
    color: asBytes(maps.color, "color"),
    roughness: asBytes(maps.roughness, "roughness"),
    bump: asBytes(maps.bump, "bump"),
    metalness: asBytes(maps.metalness, "metalness"),
  };
  const signal = assertExpectedWearSignal(state.scale);
  assertBakeMaps(actual, expectedMaterialBake(state.scale), "materials");
  return signal;
}

function meshInvariants(mesh, label) {
  assert(
    mesh.positions.length > 0 && mesh.positions.length % 3 === 0,
    `${label}: positions must be XYZ vertices`,
  );
  assert.equal(
    mesh.normals.length,
    mesh.positions.length,
    `${label}: normals must match positions`,
  );
  assert.equal(
    mesh.uvs.length,
    (mesh.positions.length / 3) * 2,
    `${label}: UVs must match vertices`,
  );
  assert(
    mesh.indices.length > 0 && mesh.indices.length % 3 === 0,
    `${label}: indices must form triangles`,
  );
  for (const value of mesh.positions)
    assert(Number.isFinite(value), `${label}: positions must be finite`);
  for (const value of mesh.uvs)
    assert(Number.isFinite(value) && value >= 0 && value <= 1, `${label}: UVs must be normalized`);
  for (const index of mesh.indices)
    assert(
      Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3,
      `${label}: indices must reference vertices`,
    );
  for (let index = 0; index < mesh.normals.length; index += 3)
    assert(
      Math.abs(
        Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]) - 1,
      ) < 1e-4,
      `${label}: normals must be unit length`,
    );
  return { vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3 };
}

function assertRenderedMesh(state, key, expected) {
  const rendered = state.proceduralGeometry?.[key];
  assert(rendered, `renderer must expose the tagged ${key} procedural mesh`);
  assert.equal(rendered.vertices, expected.vertices, `renderer must keep ${key} vertex count`);
  assert.equal(rendered.triangles, expected.triangles, `renderer must keep ${key} triangle count`);
  assert(rendered.finite, `renderer ${key} positions must be finite`);
  assert(rendered.unitNormals, `renderer ${key} normals must be unit length`);
  assert(rendered.normalizedUvs, `renderer ${key} UVs must be normalized`);
  assert(rendered.validIndices, `renderer ${key} indices must reference vertices`);
}

function galleryGeometry() {
  const revolved = galleryLathe();
  const path = Array.from({ length: 44 }, (_, index) => {
    const t = index / 43;
    return {
      x: 0.45 * Math.sin(t * Math.PI * 2),
      y: 0.08 + t * 1.25,
      z: 0.25 * Math.cos(t * Math.PI * 2),
    };
  });
  return [
    revolved,
    createSweptMesh({
      path,
      radius: (t) => 0.095 + 0.055 * Math.sin(t * Math.PI),
      radialSegments: 20,
    }),
    createSheetMesh({
      width: 1,
      height: 1.4,
      columns: 50,
      rows: 50,
      heightAt: (u, v) => 0.065 * Math.sin(u * Math.PI * 10) * Math.sin(v * Math.PI),
    }),
  ];
}

function galleryLathe() {
  return createRevolvedMesh({
    profile: [
      { radius: 0, height: 0 },
      { radius: 0.48, height: 0.04 },
      { radius: 0.49, height: 0.1 },
      { radius: 0.28, height: 0.38 },
      { radius: 0.4, height: 0.66 },
      { radius: 0.3, height: 1 },
      { radius: 0.14, height: 1.15 },
      { radius: 0, height: 1.22 },
    ],
    segments: 64,
  });
}

/** Reconstructs the normal gallery atlas independently of its runtime state. */
export function expectedUvAtlas() {
  const sampler = expectedMaterialSampler(1);
  const worldSampler = {
    sample(u, v) {
      return sampler.sample(u + 0.5, 0.5 - v);
    },
  };
  return bakeUvAtlas(galleryLathe(), worldSampler, {
    width: 512,
    height: 512,
    padding: 2,
    scale: 1,
    sharpness: 4,
  });
}

function sharpCuspGeometry() {
  return createSweptMesh({
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.1, z: 0 },
      { x: 0, y: 0.11, z: 0 },
    ],
    radius: (t) => (t === 0 ? 0.1 : t === 1 ? 0.28 : 0.3),
    radialSegments: 6,
  });
}

function assertFaceNormalAlignment(mesh, label) {
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const indices = [
      mesh.indices[triangle],
      mesh.indices[triangle + 1],
      mesh.indices[triangle + 2],
    ];
    const [a, b, c] = indices.map((vertex) => vertex * 3);
    const abx = mesh.positions[b] - mesh.positions[a];
    const aby = mesh.positions[b + 1] - mesh.positions[a + 1];
    const abz = mesh.positions[b + 2] - mesh.positions[a + 2];
    const acx = mesh.positions[c] - mesh.positions[a];
    const acy = mesh.positions[c + 1] - mesh.positions[a + 1];
    const acz = mesh.positions[c + 2] - mesh.positions[a + 2];
    const face = [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
    for (const vertex of indices) {
      const offset = vertex * 3;
      const alignment =
        face[0] * mesh.normals[offset] +
        face[1] * mesh.normals[offset + 1] +
        face[2] * mesh.normals[offset + 2];
      assert(
        alignment > 0,
        `${label}: face ${triangle / 3} must face with every indexed vertex normal`,
      );
    }
  }
}

/** Validates the geometry source and that the renderer reports all its triangles. */
export function assertGeometryAcceptance(state) {
  assert.equal(state.mode, "geometry", "geometry acceptance requires geometry mode");
  const meshes = galleryGeometry();
  const expected = meshes.map((mesh, index) => meshInvariants(mesh, `geometry[${index}]`));
  ["revolved", "swept", "sheet"].forEach((key, index) =>
    assertRenderedMesh(state, key, expected[index]),
  );
  return expected;
}

/** Validates the dedicated sharp-radius swept-mesh visual diagnostic. */
export function assertCuspAcceptance(state) {
  assert.equal(state.mode, "cusp", "cusp acceptance requires cusp mode");
  const mesh = sharpCuspGeometry();
  const expected = meshInvariants(mesh, "sharp cusp");
  assertFaceNormalAlignment(mesh, "sharp cusp");
  assertRenderedMesh(state, "cusp", expected);
  assert(
    state.proceduralGeometry.cusp.outwardNormals,
    "renderer cusp face normals must align with every indexed vertex normal",
  );
  return expected;
}

/** Validates the UV source mesh and every atlas channel against the normal atlas oracle. */
export function assertUvAcceptance(state, maps) {
  assert.equal(state.mode, "atlas", "UV acceptance requires atlas mode");
  assert.equal(state.seed, materialSeed, "UV acceptance requires the fixed seeded scene");
  assert.equal(state.scale, 1, "UV acceptance requires the fixed 1 m domain");
  const mesh = galleryLathe();
  const expected = meshInvariants(mesh, "uv mesh");
  assertRenderedMesh(state, "atlas", expected);
  const plan = createReskinPlan(mesh);
  assert.equal(plan.projection, "uv", "the gallery atlas must use its validated UV layout");
  const atlas = expectedUvAtlas();
  const actual = {
    color: asBytes(maps.color, "atlas color"),
    roughness: asBytes(maps.roughness, "atlas roughness"),
    bump: asBytes(maps.bump, "atlas bump"),
    metalness: asBytes(maps.metalness, "atlas metalness"),
  };
  assertByteSequenceEqual(
    actual.color,
    atlas.color,
    "UV atlas: color must match the normal projection oracle",
  );
  assertByteSequenceEqual(
    actual.roughness,
    atlas.roughness,
    "UV atlas: roughness must match the normal projection oracle",
  );
  assertByteSequenceEqual(
    actual.bump,
    atlas.bump,
    "UV atlas: bump must match the normal projection oracle",
  );
  assertByteSequenceEqual(
    actual.metalness,
    atlas.metalness,
    "UV atlas: metalness must match the normal projection oracle",
  );
  return atlas;
}
