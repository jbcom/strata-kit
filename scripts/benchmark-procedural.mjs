#!/usr/bin/env node

/**
 * Reproducible CPU and allocation benchmark for the public procedural API.
 *
 * Run only against a freshly built, isolated checkout:
 *   node --expose-gc scripts/benchmark-procedural.mjs --output <ignored-report>.json
 *
 * The report is intentionally machine-specific evidence, not a performance claim.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const { values } = parseArgs({
  options: {
    output: { type: "string", default: ".agent-state/performance/latest.json" },
    samples: { type: "string", default: "7" },
    warmup: { type: "string", default: "1" },
    revision: { type: "string", default: process.env.STRATA_BENCH_REVISION ?? "unrecorded" },
    "module-root": {
      type: "string",
      default: resolve(dirname(fileURLToPath(import.meta.url)), "../dist"),
    },
    workloads: { type: "string" },
  },
});

const samples = Number(values.samples);
const warmup = Number(values.warmup);
if (!Number.isInteger(samples) || samples < 3 || samples > 31)
  throw new Error("--samples must be an integer between 3 and 31");
if (!Number.isInteger(warmup) || warmup < 0 || warmup > 10)
  throw new Error("--warmup must be an integer between 0 and 10");

if (typeof global.gc !== "function") {
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const moduleRoot = resolve(values["module-root"]);
const selectedWorkloads = values.workloads?.split(",").filter(Boolean);
const [
  {
    bakeSurface,
    bakeUvAtlas,
    composeSurfaceLayers,
    createSurfacePlan,
    createSurfaceSampler,
    createWearField,
    analyzeUvLayout,
  },
  { createRevolvedMesh, createSheetMesh, createSweptMesh },
  { createSeededTerrainField },
] = await Promise.all([
  import(pathToFileURL(resolve(moduleRoot, "materials.js")).href),
  import(pathToFileURL(resolve(moduleRoot, "mesh.js")).href),
  import(pathToFileURL(resolve(moduleRoot, "terrain.js")).href),
]);

function updateLengthPrefixed(hash, value) {
  const text = String(value);
  hash.update(`${Buffer.byteLength(text)}:`);
  hash.update(text);
}

function scalarEncoding(value) {
  if (typeof value !== "number") return String(value);
  if (Number.isNaN(value)) return "NaN";
  if (Object.is(value, -0)) return "-0";
  if (value === Infinity) return "+Infinity";
  if (value === -Infinity) return "-Infinity";
  return String(value);
}

function outputChecksum(value) {
  const hash = createHash("sha256");
  let typedArrayBytes = 0;
  const visit = (item) => {
    if (item === null) {
      hash.update("null;");
      return;
    }
    if (ArrayBuffer.isView(item)) {
      hash.update("typed-array:");
      updateLengthPrefixed(hash, item.constructor.name);
      hash.update(`${item.byteLength};`);
      hash.update(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
      typedArrayBytes += item.byteLength;
      return;
    }
    if (Array.isArray(item)) {
      hash.update(`array:${item.length};`);
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const keys = Object.keys(item).sort();
      hash.update(`object:${keys.length};`);
      keys.forEach((key) => {
        hash.update("key:");
        updateLengthPrefixed(hash, key);
        visit(item[key]);
      });
      return;
    }
    hash.update(`${typeof item}:`);
    updateLengthPrefixed(hash, scalarEncoding(item));
  };
  visit(value);
  return { typedArrayBytes, sha256: hash.digest("hex") };
}

function memory() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function postOperationMemoryDelta(after, before) {
  return Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - before[key]]));
}

function summarizeTimings(observations) {
  const elapsed = observations.map(({ milliseconds }) => milliseconds).sort((left, right) => left - right);
  return {
    minimum: elapsed[0],
    p50NearestRank: percentile(elapsed, 0.5),
    p95NearestRank: percentile(elapsed, 0.95),
  };
}

function artifactProvenance(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  const manifest = files
    .sort()
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        path: relative(root, path),
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
  return {
    moduleRoot: root,
    files: manifest,
    sha256: outputChecksum(manifest).sha256,
  };
}

function measure(name, operation) {
  for (let iteration = 0; iteration < warmup; iteration += 1) operation();
  const observations = [];
  for (let iteration = 0; iteration < samples; iteration += 1) {
    global.gc();
    const before = memory();
    const start = performance.now();
    const output = operation();
    const milliseconds = performance.now() - start;
    const after = memory();
    observations.push({
      milliseconds,
      postOperationMemoryDeltaBytes: postOperationMemoryDelta(after, before),
      output: outputChecksum(output),
    });
  }
  const outputHashes = observations.map(({ output }) => output.sha256);
  const outputSizes = observations.map(({ output }) => output.typedArrayBytes);
  if (new Set(outputHashes).size !== 1 || new Set(outputSizes).size !== 1) {
    throw new Error(`${name}: deterministic output mismatch across measured samples`);
  }
  return {
    name,
    iterations: samples,
    timingMilliseconds: summarizeTimings(observations),
    samples: observations,
    deterministicOutput: true,
    output: { typedArrayBytes: outputSizes[0], sha256: outputHashes[0] },
  };
}

const stone = createSurfaceSampler(
  createSurfacePlan({ seed: "strata-bench-stone", scale: 3.5, baseColor: [0.3, 0.27, 0.22] }),
);
const wear = createWearField({
  seed: "strata-bench-wear",
  scale: 2.25,
  amount: 0.82,
  edgeBias: 0.45,
  bottomBias: 0.6,
});
const layeredSurface = composeSurfaceLayers(stone, [
  {
    sampler: {
      sample(u, v) {
        const field = wear.sample(u, v);
        return {
          color: [117, 74, 39, Math.round(field.oxide * 235)],
          roughness: 0.78,
          bump: field.fine * 2 - 1,
          metalness: 0.05,
        };
      },
    },
  },
  {
    sampler: {
      sample(u, v) {
        const field = wear.sample(u, v);
        return {
          color: [138, 133, 121, Math.round(field.steel * 255)],
          roughness: 0.38,
          bump: field.mid * 2 - 1,
          metalness: 0.84,
        };
      },
    },
  },
]);

const atlasMesh = createSheetMesh({
  width: 18,
  height: 18,
  columns: 65,
  rows: 65,
  heightAt: (u, v) => Math.sin(u * Math.PI * 6) * Math.cos(v * Math.PI * 5) * 0.08,
});

const revolvedProfile = Array.from({ length: 33 }, (_, index) => {
  const t = index / 32;
  return { radius: 0.72 + Math.sin(t * Math.PI * 5) * 0.08 + t * 0.06, height: t * 5 };
});
const sweepPath = Array.from({ length: 129 }, (_, index) => {
  const t = index / 128;
  return { x: t * 18 - 9, y: Math.sin(t * Math.PI * 4) * 0.9, z: Math.cos(t * Math.PI * 3) * 1.5 };
});
const terrain = createSeededTerrainField({
  seed: "strata-bench-terrain",
  biomeBlend: 0.75,
  biomes: [
    { type: "mountain", center: [-28, -12], radius: 42 },
    { type: "forest", center: [8, 10], radius: 35 },
    { type: "scrubland", center: [32, -8], radius: 30 },
  ],
});

const workloadDefinitions = [
  {
    name: "surface-bake-layered-1024",
    operation: () => bakeSurface(layeredSurface, { width: 1024, height: 1024 }),
  },
  {
    name: "uv-analysis-sheet-65",
    operation: () => analyzeUvLayout(atlasMesh, { gridSize: 512 }),
  },
  {
    name: "uv-atlas-layered-512",
    operation: () =>
      bakeUvAtlas(atlasMesh, layeredSurface, { width: 512, height: 512, padding: 4, scale: 0.9 }),
  },
  {
    name: "mesh-revolve-profile-33-segments-192",
    operation: () => createRevolvedMesh({ profile: revolvedProfile, segments: 192 }),
  },
  {
    name: "mesh-sweep-path-129-radial-32",
    operation: () =>
      createSweptMesh({ path: sweepPath, radialSegments: 32, radius: (t) => 0.28 + t * 0.16 }),
  },
  {
    name: "mesh-sheet-257",
    operation: () =>
      createSheetMesh({
        width: 30,
        height: 30,
        columns: 257,
        rows: 257,
        heightAt: (u, v) => Math.sin(u * Math.PI * 8) * Math.cos(v * Math.PI * 7) * 0.12,
      }),
  },
  {
    name: "terrain-heightfield-blended-257",
    operation: () => terrain.createHeightfield({ width: 257, depth: 257, cellSize: 0.35 }),
  },
  { name: "terrain-scatter-10000", operation: () => terrain.scatter({ count: 10_000, area: 100 }) },
];

const knownWorkloads = new Set(workloadDefinitions.map(({ name }) => name));
if (selectedWorkloads?.some((name) => !knownWorkloads.has(name)))
  throw new Error(`--workloads must name known workloads: ${[...knownWorkloads].join(", ")}`);
const selectedDefinitions = selectedWorkloads
  ? workloadDefinitions.filter(({ name }) => selectedWorkloads.includes(name))
  : workloadDefinitions;
const results = selectedDefinitions.map(({ name, operation }) => measure(name, operation));
if (results.length === 0) throw new Error("--workloads must select at least one workload");

const report = {
  schema: 2,
  sourceRevisionClaim: values.revision,
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    packageManagerUserAgent: process.env.npm_config_user_agent ?? null,
  },
  provenance: {
    benchmarkScript: {
      sha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
      bytes: statSync(fileURLToPath(import.meta.url)).size,
    },
    builtArtifact: artifactProvenance(moduleRoot),
  },
  method: {
    samples,
    warmup,
    garbageCollection: "forced before every measured sample",
    timing: "performance.now around public API call only",
    timingSummary: "nearest-rank quantiles; with seven samples p95NearestRank is the maximum",
    memory:
      "post-operation process-memory delta after forced GC; it is not a process peak, allocation total, or GPU measurement",
    checksum:
      "SHA-256 over a type-tagged, length-delimited output structure; every measured iteration is checked for deterministic output",
    bounds: {
      surfaceBakePixels: "1024x1024",
      atlasPixels: "512x512 with four padding rings",
      uvMesh: "65x65 sheet with 512 diagnostic grid",
      meshSheet: "257x257",
      terrainHeightfield: "257x257",
      terrainScatterPoints: 10000,
    },
  },
  workloads: results,
};

const output = resolve(values.output);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
