import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function treeHashes(root, directory) {
  const hashes = {};
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile())
        hashes[relative(root, file).replaceAll("\\", "/")] = hashBytes(await readFile(file));
      else throw new Error(`Proof inputs cannot contain a symlink: ${relative(root, file)}`);
    }
  }
  await visit(join(root, directory));
  return hashes;
}

/** Snapshot compiler inputs, excluding execution-only manifest fields. */
export async function snapshotBuildInputs(root) {
  const files = await treeHashes(root, "src");
  for (const name of ["tsup.config.ts", "tsconfig.json", "pnpm-lock.yaml"])
    files[name] = hashBytes(await readFile(join(root, name)));
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const packageConfig = { ...manifest };
  delete packageConfig.packageManager;
  delete packageConfig.heavySlot;
  return { files, packageConfigHash: hashBytes(JSON.stringify(packageConfig)) };
}

export async function snapshotBuiltArtifacts(root) {
  return treeHashes(root, "dist");
}

export async function snapshotCaptureInputs(root) {
  const files = {};
  for (const name of [
    "examples/gallery.html",
    "examples/gallery.mjs",
    "examples/server.mjs",
    "scripts/capture-visual.mjs",
    "scripts/visual-acceptance.mjs",
    "scripts/proof-inputs.mjs",
    "tests/gallery.playwright.ts",
    "tests/playwright.gallery.config.ts",
  ])
    files[name] = hashBytes(await readFile(join(root, name)));
  return files;
}

/** Bind runtime bundles to the exact source text recorded before compilation. */
export async function assertEmbeddedSources(root, inputs) {
  const names = (await readdir(join(root, "dist"))).filter((name) => name.endsWith(".js"));
  assert(names.length > 0, "Build proof requires runtime bundles");
  for (const name of names) {
    const mapPath = join(root, "dist", `${name}.map`);
    const map = JSON.parse(await readFile(mapPath, "utf8"));
    assert.equal(
      map.sources.length,
      map.sourcesContent.length,
      `${name}: source contents must be present`,
    );
    for (let index = 0; index < map.sources.length; index++) {
      const path = relative(root, resolve(dirname(mapPath), map.sources[index])).replaceAll(
        "\\",
        "/",
      );
      assert(path in inputs.files, `${name}: embedded source must be a recorded input: ${path}`);
      assert.equal(
        typeof map.sourcesContent[index],
        "string",
        `${name}: embedded source text is required`,
      );
      assert.equal(
        hashBytes(map.sourcesContent[index]),
        inputs.files[path],
        `${name}: embedded source differs from build input: ${path}`,
      );
    }
  }
}

export async function assertBuildProof(root, proof) {
  assert.equal(proof.schema, 1, "Build proof schema must be supported");
  assert.deepEqual(
    await snapshotBuildInputs(root),
    proof.inputs,
    "Source/compiler inputs changed after build",
  );
  assert.deepEqual(
    await snapshotBuiltArtifacts(root),
    proof.artifacts,
    "Built artifacts changed after build",
  );
  await assertEmbeddedSources(root, proof.inputs);
}
