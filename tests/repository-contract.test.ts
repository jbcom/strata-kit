import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { describe, expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(directory, "..");
const sourceDirectory = resolve(packageDirectory, "src");
const pureEntrypoints = [
  "index.ts",
  "noise.ts",
  "sdf.ts",
  "terrain.ts",
  "materials.ts",
  "mesh.ts",
  "shaders.ts",
  "surfaceFields.ts",
];

function sourceGraph(roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  function visit(filename: string): void {
    if (seen.has(filename)) return;
    seen.add(filename);
    const source = readFileSync(resolve(sourceDirectory, filename), "utf8");
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    function walk(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const dependency = node.moduleSpecifier.text;
        if (dependency.startsWith(".")) {
          const stem = dependency.replace(/^\.\//, "").replace(/\.js$/, "");
          const files = readdirSync(sourceDirectory);
          const target = [`${stem}.ts`, `${stem}.tsx`].find((file) => files.includes(file));
          expect(target, `missing source dependency ${dependency} from ${filename}`).toBeDefined();
          if (target) visit(target);
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  for (const root of roots) visit(root);
  return seen;
}

describe("strata-procedural repository boundary", () => {
  it("keeps pure entrypoints renderer/framework free and forbids implicit randomness", () => {
    for (const entrypoint of sourceGraph(pureEntrypoints)) {
      const source = readFileSync(resolve(sourceDirectory, entrypoint), "utf8");
      expect(source).not.toMatch(/from ['"](?:three|react|@react-three\/fiber)['"]/);
      expect(source).not.toContain("Math.random");
    }
  });

  it("keeps internal modules reachable from documented pure or adapter entrypoints", () => {
    const reachable = sourceGraph([...pureEntrypoints, "three.ts", "r3f.tsx"]);
    expect(
      readdirSync(sourceDirectory)
        .filter((entry) => /\.tsx?$/.test(entry))
        .sort(),
    ).toEqual([...reachable].sort());
  });
});
