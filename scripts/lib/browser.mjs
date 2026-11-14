import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { startStaticServer, stopStaticServer } from '../serve.mjs';

export { startStaticServer, stopStaticServer };

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

export async function withStaticServer(siteDir, fn, { host = '127.0.0.1', port = 0 } = {}) {
  const { server, baseUrl, port: boundPort } = await startStaticServer(siteDir, host, port);
  const unregister = registerCleanupSignals(async () => {
    await stopStaticServer(server);
  });
  try {
    return await fn({ server, baseUrl, port: boundPort, host });
  } finally {
    unregister();
    await stopStaticServer(server);
  }
}

export async function withBrowser(fn, timeoutMs = 30_000) {
  let browser;
  const unregister = registerCleanupSignals(async () => {
    await closeBrowserSafely(browser);
  });
  try {
    const launched = await launchHeadlessBrowser(timeoutMs);
    browser = launched.browser;
    return await fn(browser, launched.executablePath);
  } finally {
    unregister();
    await closeBrowserSafely(browser);
  }
}

export async function enforceLocalRouting(
  page,
  baseOrigin,
  blockedExternalRequests,
  virtualRoutes = {}
) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (Object.hasOwn(virtualRoutes, url)) {
      const entry = virtualRoutes[url];
      return route.fulfill({
        status: entry.status ?? 200,
        contentType: entry.contentType ?? 'text/html; charset=utf-8',
        body: entry.body,
      });
    }
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    try {
      if (new URL(url).origin === baseOrigin) {
        return route.continue();
      }
    } catch {
      // Fall through to abort invalid URLs
    }
    blockedExternalRequests.push(url);
    return route.abort();
  });
}
