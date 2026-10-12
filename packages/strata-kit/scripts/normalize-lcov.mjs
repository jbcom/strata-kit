import { readFile, writeFile } from 'node:fs/promises';

const reportPath = new URL('../coverage/lcov.info', import.meta.url);
const report = await readFile(reportPath, 'utf8');
const normalized = report.replaceAll('SF:src/', 'SF:packages/strata-kit/src/');

if (normalized === report) {
  throw new Error('strata-kit coverage report did not contain source paths to normalize');
}

await writeFile(reportPath, normalized);
