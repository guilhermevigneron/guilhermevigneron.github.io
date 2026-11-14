import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeReportJson } from './lib/io.mjs';
import { isEntrypoint, REPORTS_DIR, ROOT } from './lib/paths.mjs';

const testsDir = path.join(ROOT, 'tests');

export const COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 85,
  branches: 70,
};

export function parseNodeCoverageReport(output) {
  const match = String(output || '').match(
    /\ball files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/i
  );
  if (!match) return null;
  const lines = Number(match[1]);
  const branches = Number(match[2]);
  const functions = Number(match[3]);
  if ([lines, branches, functions].some((n) => Number.isNaN(n))) return null;
  return { lines, branches, functions };
}

export function evaluateCoverageThresholds(coverage, thresholds = COVERAGE_THRESHOLDS) {
  if (!coverage) {
    return {
      passed: false,
      coverage: null,
      thresholds,
      failures: ['Missing coverage summary table from node --test --experimental-test-coverage'],
    };
  }

  const failures = [];
  if (coverage.lines < thresholds.lines) {
    failures.push(`line coverage ${coverage.lines.toFixed(2)}% < ${thresholds.lines}%`);
  }
  if (coverage.functions < thresholds.functions) {
    failures.push(`function coverage ${coverage.functions.toFixed(2)}% < ${thresholds.functions}%`);
  }
  if (coverage.branches < thresholds.branches) {
    failures.push(`branch coverage ${coverage.branches.toFixed(2)}% < ${thresholds.branches}%`);
  }

  return {
    passed: failures.length === 0,
    coverage,
    thresholds,
    failures,
  };
}

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
    args: ['--test', '--experimental-test-coverage', ...listUnitTestFiles()],
    enforceCoverage: true,
  },
  security: {
    reportFile: 'security-report.json',
    cmd: 'npm',
    args: ['audit', '--audit-level=moderate'],
  },
};

export function runCliGate(gateName = process.argv[2]) {
  if (!gateName || !Object.hasOwn(GATES, gateName)) {
    console.error(`Usage: node scripts/run-gate.mjs <${Object.keys(GATES).join('|')}>`);
    process.exit(1);
  }

  const gate = GATES[gateName];
  const startedAt = Date.now();
  const result = spawnSync(gate.cmd, gate.args, {
    cwd: ROOT,
    stdio: gate.enforceCoverage ? 'pipe' : 'inherit',
    encoding: gate.enforceCoverage ? 'utf8' : undefined,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  if (gate.enforceCoverage) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(result.error);
  }

  let exitCode = result.error ? 1 : (result.status ?? 1);
  let coverageEvaluation = null;

  if (gate.enforceCoverage && exitCode === 0) {
    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
    const parsedCoverage = parseNodeCoverageReport(combinedOutput);
    coverageEvaluation = evaluateCoverageThresholds(parsedCoverage, COVERAGE_THRESHOLDS);
    if (!coverageEvaluation.passed) {
      console.error(`Coverage gate failed: ${coverageEvaluation.failures.join('; ')}`);
      exitCode = 1;
    }
  }

  const passed = exitCode === 0;

  writeReportJson(
    gate.reportFile,
    {
      gate: gateName,
      passed,
      exitCode,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      ...(coverageEvaluation ? { coverage: coverageEvaluation } : {}),
    },
    REPORTS_DIR
  );

  process.exit(exitCode);
}

if (isEntrypoint(import.meta.url)) {
  runCliGate();
}
