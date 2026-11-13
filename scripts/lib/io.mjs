import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPORTS_DIR, ROOT } from './paths.mjs';

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

export function writeTextIfChanged(filePath, content) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prev === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeReportJson(fileName, data, reportsDir = REPORTS_DIR) {
  writeJsonFile(path.join(reportsDir, fileName), data);
}

export function getFileSizeBytes(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).size;
}

export function getCombinedSizeBytes(paths) {
  let totalBytes = 0;
  let foundAny = false;
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      totalBytes += fs.statSync(filePath).size;
      foundAny = true;
    }
  }
  return foundAny ? totalBytes : null;
}

export function normalizeBaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '');
}

export function toPathname(urlOrPath, fallback = '/') {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('/')) return raw;
  try {
    return new URL(raw).pathname || fallback;
  } catch {
    return fallback;
  }
}

export function resolveBuildTimestampMs(rootDir = ROOT) {
  const envEpoch = process.env.SOURCE_DATE_EPOCH;
  if (envEpoch !== undefined && envEpoch !== '') {
    const parsed = Number(envEpoch);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed * 1000;
    }
  }

  try {
    const gitEpoch = execFileSync('git', ['log', '-1', '--format=%ct'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const parsedGit = Number(gitEpoch);
    if (Number.isFinite(parsedGit) && parsedGit > 0) {
      return parsedGit * 1000;
    }
  } catch {
    // Fallback when running outside a git repository
  }

  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function resolveBuildYear(data, rootDir = ROOT) {
  const envEpoch = process.env.SOURCE_DATE_EPOCH;
  if (envEpoch !== undefined && envEpoch !== '') {
    const parsed = Number(envEpoch);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return new Date(parsed * 1000).getUTCFullYear();
    }
  }
  if (Number.isInteger(data?.meta?.copyrightYear)) {
    return data.meta.copyrightYear;
  }
  return new Date(resolveBuildTimestampMs(rootDir)).getUTCFullYear();
}

export function runCommandAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ status: code, signal });
    });
  });
}
