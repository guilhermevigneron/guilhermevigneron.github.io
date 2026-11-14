import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createStaticServer } from '../serve.mjs';

export function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('No Chromium/Chrome executable found. Set CHROME_PATH environment variable.');
}

export async function launchHeadlessBrowser(timeoutMs = 30_000) {
  const executablePath = findBrowserExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    timeout: timeoutMs,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return { browser, executablePath };
}

export async function startStaticServer(siteDir, host = '127.0.0.1', port = 0) {
  const server = createStaticServer(siteDir);
  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  server.on('error', (err) => {
    console.error(`Static server error: ${err.message}`);
  });

  const address = server.address();
  if (!address || typeof address !== 'object') {
    await stopStaticServer(server);
    throw new Error('Static server failed to bind a valid TCP address');
  }

  return {
    server,
    baseUrl: `http://${host}:${address.port}`,
    port: address.port,
  };
}

export async function stopStaticServer(server, timeoutMs = 3000) {
  if (!server?.listening) return;
  let timer;
  try {
    server.closeAllConnections?.();
    await Promise.race([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch (err) {
    console.error(`Error closing static server: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function closeBrowserSafely(browser, timeoutMs = 5000) {
  if (!browser) return;
  let timer;
  try {
    const proc = typeof browser.process === 'function' ? browser.process() : null;
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser close timed out')), timeoutMs);
        timer.unref?.();
      }),
    ]);
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      proc.kill('SIGKILL');
    }
  } catch {
    try {
      const proc = typeof browser.process === 'function' ? browser.process() : null;
      if (proc && proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Ignore already-terminated browser process
    }
  } finally {
    clearTimeout(timer);
  }
}

export function registerCleanupSignals(onSignal) {
  let handling = false;
  const handler = async (signal) => {
    if (handling) return;
    handling = true;
    try {
      await onSignal(signal);
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };
  const sigint = () => void handler('SIGINT');
  const sigterm = () => void handler('SIGTERM');
  process.once('SIGINT', sigint);
  process.once('SIGTERM', sigterm);
  return () => {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  };
}
