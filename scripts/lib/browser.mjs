import fs from 'node:fs';
import { createStaticServer } from '../serve.mjs';

export const CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

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
  throw new Error(
    'No Chromium/Chrome executable found. Set CHROME_PATH environment variable.'
  );
}

/**
 * Starts the static server on an ephemeral 127.0.0.1 port.
 * Resolves to { server, baseUrl, close }.
 */
export async function startStaticServer(siteDir) {
  const server = createStaticServer(siteDir);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const close = async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  };
  return { server, baseUrl, close };
}

/**
 * Aborts every request that does not target baseUrl's origin (data:/blob: allowed)
 * and records the blocked URLs in the returned array.
 */
export async function blockExternalRequests(page, baseUrl) {
  const baseOrigin = new URL(baseUrl).origin;
  const blocked = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    try {
      if (new URL(url).origin === baseOrigin) {
        return route.continue();
      }
    } catch {
      // Fall through to block invalid URLs
    }
    blocked.push(url);
    return route.abort();
  });
  return blocked;
}
