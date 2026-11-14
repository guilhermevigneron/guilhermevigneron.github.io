import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeReportJson } from './lib/io.mjs';
import { REPORTS_DIR, ROOT } from './lib/paths.mjs';

const testsDir = path.join(ROOT, 'tests');

function listUnitTestFiles() {
  if (!fs.existsSync(testsDir)) return [];
  return fs
    .readdirSync(testsDir)
    .filter((file) => file.endsWith('.test.mjs'))
    .sort()
    .map((file) => path.join('tests', file));
}

const biomeBin = path.join(ROOT, 'node_modules', '.bin', 'biome');

const GATES = {
  lint: {
    reportFile: 'lint-report.json',
    cmd: fs.existsSync(biomeBin) ? biomeBin : 'biome',
    args: ['check', '.'],
  },
  unit: {
    reportFile: 'unit-report.json',
    cmd: process.execPath,
    args: ['--test', ...listUnitTestFiles()],
  },
  security: {
    reportFile: 'security-report.json',
    cmd: 'npm',
    args: ['audit', '--audit-level=moderate'],
  },
};

const gateName = process.argv[2];
if (!gateName || !Object.hasOwn(GATES, gateName)) {
  console.error(`Usage: node scripts/run-gate.mjs <${Object.keys(GATES).join('|')}>`);
  process.exit(1);
}

const gate = GATES[gateName];
const startedAt = Date.now();
const result = spawnSync(gate.cmd, gate.args, {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error);
}

const exitCode = result.error ? 1 : (result.status ?? 1);
const passed = exitCode === 0;

writeReportJson(
  gate.reportFile,
  {
    gate: gateName,
    passed,
    exitCode,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  },
  REPORTS_DIR
);

process.exit(exitCode);
