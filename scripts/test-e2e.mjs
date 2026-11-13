import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createStaticServer } from './serve.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const port = Number(process.env.PORT || 4000);
const host = '127.0.0.1';

function resolveBrowser() {
  if (process.env.CYPRESS_BROWSER) {
    return process.env.CYPRESS_BROWSER;
  }
  try {
    const resolved = fs.realpathSync('/usr/bin/google-chrome');
    if (resolved.includes('chromium')) {
      return 'chromium';
    }
  } catch {
    // Fall back to chrome if /usr/bin/google-chrome is unavailable
  }
  return 'chrome';
}

function runCommandAsync(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ status: code, signal });
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Run "npm run build" first.');
  }

  const server = createStaticServer(siteDir);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const browser = resolveBrowser();
  const cypressBin = path.join(ROOT, 'node_modules', '.bin', 'cypress');
  console.log(`Static server listening at http://${host}:${port}; running Cypress (${browser})...`);

  try {
    const result = await runCommandAsync(cypressBin, ['run', '--browser', browser], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CYPRESS_BASE_URL: `http://${host}:${port}`,
      },
    });
    process.exitCode = result.status ?? 1;
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
