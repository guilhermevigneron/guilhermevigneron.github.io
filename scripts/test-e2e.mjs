import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startStaticServer, stopStaticServer } from './lib/browser.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const host = '127.0.0.1';

function parsePort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') return 0;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}". Must be an integer between 0 and 65535.`);
  }
  return port;
}

function parseTimeoutMs() {
  const raw = process.env.E2E_TIMEOUT_MS;
  if (raw === undefined || raw === '') return 600_000;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`Invalid E2E_TIMEOUT_MS "${raw}". Must be a positive number.`);
  }
  return ms;
}

export function resolveBrowser() {
  if (process.env.CYPRESS_BROWSER) {
    return process.env.CYPRESS_BROWSER;
  }
  try {
    const resolved = fs.realpathSync('/usr/bin/google-chrome');
    if (resolved.includes('chromium')) {
      return 'chromium';
    }
    return 'chrome';
  } catch {
    // Probe chromium binaries when /usr/bin/google-chrome is unavailable
  }
  for (const candidate of ['/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(candidate)) {
      return 'chromium';
    }
  }
  return 'chrome';
}

function killProcessTree(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) {
    return;
  }
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Process already exited
    }
  }
}

function runCypress(cmd, args, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      detached: process.platform !== 'win32',
    });

    let settled = false;
    let forceKillTimer = null;

    const terminateChild = (signal) => {
      killProcessTree(child, signal);
      if (!forceKillTimer) {
        forceKillTimer = setTimeout(() => killProcessTree(child, 'SIGKILL'), 5000);
        forceKillTimer.unref?.();
      }
    };

    const timeoutTimer = setTimeout(() => {
      terminateChild('SIGTERM');
      if (!settled) {
        settled = true;
        reject(new Error(`Cypress timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    timeoutTimer.unref?.();

    const onSignal = (signal) => {
      terminateChild(signal);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    };

    child.on('error', (err) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      cleanup();
      if (!settled) {
        settled = true;
        resolve({ status: code, signal });
      }
    });
  });
}

export async function runE2E() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Run "npm run build" first.');
  }

  const port = parsePort();
  const timeoutMs = parseTimeoutMs();
  const { server, baseUrl } = await startStaticServer(siteDir, host, port);
  const browser = resolveBrowser();
  const cypressBin = path.join(ROOT, 'node_modules', '.bin', 'cypress');
  console.log(`Static server listening at ${baseUrl}; running Cypress (${browser})...`);

  try {
    const result = await runCypress(
      cypressBin,
      ['run', '--browser', browser],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          CYPRESS_BASE_URL: baseUrl,
        },
      },
      timeoutMs
    );
    if (result.signal) {
      console.error(`Cypress terminated by signal ${result.signal}`);
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
    }
  } finally {
    await stopStaticServer(server);
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  runE2E().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
