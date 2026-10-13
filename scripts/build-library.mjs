#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["run", "build"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
