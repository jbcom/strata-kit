import { readFile, writeFile } from 'node:fs/promises';

const reportPath = new URL('../coverage/lcov.info', import.meta.url);
const report = await readFile(reportPath, 'utf8');
const normalized = report.replaceAll('SF:src/', 'SF:packages/strata-procedural/src/');

if (normalized === report) {
  throw new Error('strata-procedural coverage report did not contain source paths to normalize');
}

await writeFile(reportPath, normalized);
