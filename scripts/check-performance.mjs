import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  closeBrowserSafely,
  launchHeadlessBrowser,
  registerCleanupSignals,
  startStaticServer,
  stopStaticServer,
} from './lib/browser.mjs';
import { atomicWriteFileSync } from './lib/chrome.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');

const BUDGETS = {
  screenCssMaxBytes: 12 * 1024,
  commandMenuCssMaxBytes: 4 * 1024,
  subpageCssMaxBytes: 6 * 1024,
  printCssMaxBytes: 3 * 1024,
  initialJsMaxBytes: 4 * 1024,
  lazyPanelJsMaxBytes: 12 * 1024,
  combinedFontsMaxBytes: 32 * 1024,
  indexHtmlMaxBytes: 25 * 1024,
  notFoundHtmlMaxBytes: 8 * 1024,
  qualityHtmlMaxBytes: 35 * 1024,
  architectureHtmlMaxBytes: 25 * 1024,
  avatarJpgMaxBytes: 8 * 1024,
  avatarAvifMaxBytes: 4 * 1024,
  avatarWebpMaxBytes: 5 * 1024,
  totalMobileTransferMaxBytes: 75 * 1024,
  clsMax: 0.01,
  lcpMaxMs: 2500,
  fcpMaxMs: 1800,
  maxDomNodes: 500,
  maxLongTaskMs: 100,
};

function fileSize(relPath) {
  const full = path.join(siteDir, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Expected built asset missing: ${relPath}`);
  }
  return fs.statSync(full).size;
}

async function waitForFontsReady(page) {
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('document.fonts.ready timed out')), 10_000)
      ),
    ])
  );
}

function brotliSize(relPath) {
  const full = path.join(siteDir, relPath);
  return zlib.brotliCompressSync(fs.readFileSync(full)).length;
}

async function main() {
  const qualityOnly = process.argv.includes('--quality-only');

  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Run "npm run build" first.');
  }

  const assetSizes = {
    screenCssBytes: fileSize('assets/css/styles.css'),
    commandMenuCssBytes: fileSize('assets/css/command-menu.css'),
    subpageCssBytes: fileSize('assets/css/subpage.css'),
    printCssBytes: fileSize('assets/css/print.css'),
    themeInitJsBytes: fileSize('assets/js/theme-init.js'),
    themeJsBytes: fileSize('assets/js/theme.js'),
    commandMenuJsBytes: fileSize('assets/js/command-menu.js'),
    commandMenuPanelJsBytes: fileSize('assets/js/command-menu-panel.js'),
    monoFontBytes: fileSize('assets/fonts/GeistMono-Variable.woff2'),
    pixelFontBytes: fileSize('assets/fonts/GeistPixel-Square.woff2'),
    indexHtmlBytes: fileSize('index.html'),
    notFoundHtmlBytes: fileSize('404.html'),
    qualityHtmlBytes: fs.existsSync(path.join(siteDir, 'quality/index.html'))
      ? fileSize('quality/index.html')
      : null,
    architectureHtmlBytes: fs.existsSync(path.join(siteDir, 'architecture/index.html'))
      ? fileSize('architecture/index.html')
      : null,
    avatarJpgBytes: fileSize('assets/avatar.jpg'),
    avatarAvif168Bytes: fileSize('assets/avatar-168.avif'),
    avatarAvif224Bytes: fileSize('assets/avatar-224.avif'),
    avatarAvif336Bytes: fileSize('assets/avatar-336.avif'),
    avatarWebp168Bytes: fileSize('assets/avatar-168.webp'),
    avatarWebp224Bytes: fileSize('assets/avatar-224.webp'),
    avatarWebp336Bytes: fileSize('assets/avatar-336.webp'),
  };
  const initialJsBytes =
    assetSizes.themeInitJsBytes + assetSizes.themeJsBytes + assetSizes.commandMenuJsBytes;
  const combinedFontsBytes = assetSizes.monoFontBytes + assetSizes.pixelFontBytes;
  const initialBrotliBytes =
    brotliSize('index.html') +
    brotliSize('assets/css/styles.css') +
    brotliSize('assets/css/print.css') +
    brotliSize('assets/js/theme-init.js') +
    brotliSize('assets/js/theme.js') +
    brotliSize('assets/js/command-menu.js') +
    assetSizes.monoFontBytes +
    assetSizes.pixelFontBytes +
    assetSizes.avatarAvif336Bytes;

  assert.ok(
    assetSizes.screenCssBytes <= BUDGETS.screenCssMaxBytes,
    `Screen CSS ${assetSizes.screenCssBytes} B exceeds budget ${BUDGETS.screenCssMaxBytes} B`
  );
  assert.ok(
    assetSizes.commandMenuCssBytes <= BUDGETS.commandMenuCssMaxBytes,
    `Command menu CSS ${assetSizes.commandMenuCssBytes} B exceeds budget ${BUDGETS.commandMenuCssMaxBytes} B`
  );
  assert.ok(
    assetSizes.subpageCssBytes <= BUDGETS.subpageCssMaxBytes,
    `Subpage CSS ${assetSizes.subpageCssBytes} B exceeds budget ${BUDGETS.subpageCssMaxBytes} B`
  );
  assert.ok(
    assetSizes.printCssBytes <= BUDGETS.printCssMaxBytes,
    `Print CSS ${assetSizes.printCssBytes} B exceeds budget ${BUDGETS.printCssMaxBytes} B`
  );
  assert.ok(
    initialJsBytes <= BUDGETS.initialJsMaxBytes,
    `Initial JS ${initialJsBytes} B exceeds budget ${BUDGETS.initialJsMaxBytes} B`
  );
  assert.ok(
    assetSizes.commandMenuPanelJsBytes <= BUDGETS.lazyPanelJsMaxBytes,
    `Lazy command menu panel JS ${assetSizes.commandMenuPanelJsBytes} B exceeds budget ${BUDGETS.lazyPanelJsMaxBytes} B`
  );
  assert.ok(
    combinedFontsBytes <= BUDGETS.combinedFontsMaxBytes,
    `Combined fonts ${combinedFontsBytes} B exceed budget ${BUDGETS.combinedFontsMaxBytes} B`
  );
  assert.ok(
    assetSizes.indexHtmlBytes <= BUDGETS.indexHtmlMaxBytes,
    `index.html ${assetSizes.indexHtmlBytes} B exceeds budget ${BUDGETS.indexHtmlMaxBytes} B`
  );
  assert.ok(
    assetSizes.notFoundHtmlBytes <= BUDGETS.notFoundHtmlMaxBytes,
    `404.html ${assetSizes.notFoundHtmlBytes} B exceeds budget ${BUDGETS.notFoundHtmlMaxBytes} B`
  );
  if (assetSizes.qualityHtmlBytes !== null) {
    assert.ok(
      assetSizes.qualityHtmlBytes <= BUDGETS.qualityHtmlMaxBytes,
      `quality/index.html ${assetSizes.qualityHtmlBytes} B exceeds budget ${BUDGETS.qualityHtmlMaxBytes} B`
    );
  }
  if (assetSizes.architectureHtmlBytes !== null) {
    assert.ok(
      assetSizes.architectureHtmlBytes <= BUDGETS.architectureHtmlMaxBytes,
      `architecture/index.html ${assetSizes.architectureHtmlBytes} B exceeds budget ${BUDGETS.architectureHtmlMaxBytes} B`
    );
  }
  assert.ok(
    assetSizes.avatarJpgBytes <= BUDGETS.avatarJpgMaxBytes,
    `avatar.jpg ${assetSizes.avatarJpgBytes} B exceeds budget ${BUDGETS.avatarJpgMaxBytes} B`
  );
  for (const [label, bytes] of [
    ['avatar-168.avif', assetSizes.avatarAvif168Bytes],
    ['avatar-224.avif', assetSizes.avatarAvif224Bytes],
    ['avatar-336.avif', assetSizes.avatarAvif336Bytes],
  ]) {
    assert.ok(
      bytes <= BUDGETS.avatarAvifMaxBytes,
      `${label} ${bytes} B exceeds budget ${BUDGETS.avatarAvifMaxBytes} B`
    );
  }
  for (const [label, bytes] of [
    ['avatar-168.webp', assetSizes.avatarWebp168Bytes],
    ['avatar-224.webp', assetSizes.avatarWebp224Bytes],
    ['avatar-336.webp', assetSizes.avatarWebp336Bytes],
  ]) {
    assert.ok(
      bytes <= BUDGETS.avatarWebpMaxBytes,
      `${label} ${bytes} B exceeds budget ${BUDGETS.avatarWebpMaxBytes} B`
    );
  }

  const { server, baseUrl } = await startStaticServer(siteDir);

  let browser;
  const failedRequests = [];
  const consoleErrors = [];
  const overflowChecks = [];
  const blockedExternalRequests = [];
  const baseOrigin = new URL(baseUrl).origin;

  const unregisterSignals = registerCleanupSignals(async () => {
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  });

  try {
    ({ browser } = await launchHeadlessBrowser(30_000));

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(30_000);

    const page = await context.newPage();

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
        // Fall through to abort invalid URLs
      }
      blockedExternalRequests.push(url);
      return route.abort();
    });

    page.on('response', (res) => {
      try {
        const pathname = new URL(res.url()).pathname;
        if (res.status() >= 400 && pathname !== '/404.html' && !pathname.includes('nonexistent')) {
          failedRequests.push({ url: pathname, status: res.status() });
        }
      } catch {
        // Ignore non-standard response URLs (e.g. data: / blob:)
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('crash', () => consoleErrors.push('page crashed during performance audit'));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.addInitScript(() => {
      window.__perfMetrics = { cls: 0, lcp: null, fcp: null, maxLongTaskMs: 0, longTasksCount: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__perfMetrics.cls += entry.value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });

        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            window.__perfMetrics.lcp = entries[entries.length - 1].startTime;
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              window.__perfMetrics.fcp = entry.startTime;
            }
          }
        }).observe({ type: 'paint', buffered: true });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__perfMetrics.longTasksCount += 1;
            if (entry.duration > window.__perfMetrics.maxLongTaskMs) {
              window.__perfMetrics.maxLongTaskMs = entry.duration;
            }
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Ignore unsupported observer entries
      }
    });

    let vitals = null;
    if (!qualityOnly) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });

      const navRes = await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30_000 });
      assert.ok(
        navRes && navRes.status() < 400,
        `Unexpected HTTP status navigating to /: ${navRes ? navRes.status() : 'no response'}`
      );
      await waitForFontsReady(page);
      await page.waitForTimeout(450);

      vitals = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const resourceTransferBytes = resources.reduce(
          (sum, r) => sum + (r.encodedBodySize || r.transferSize || 0),
          0
        );
        const docBytes = nav ? nav.encodedBodySize || nav.transferSize || 0 : 0;
        const avatarImg = document.querySelector('img.avatar');
        return {
          fcpMs: window.__perfMetrics.fcp === null ? null : Math.round(window.__perfMetrics.fcp),
          lcpMs: window.__perfMetrics.lcp === null ? null : Math.round(window.__perfMetrics.lcp),
          cls: Number((window.__perfMetrics.cls || 0).toFixed(4)),
          maxLongTaskMs: Math.round(window.__perfMetrics.maxLongTaskMs || 0),
          longTasksCount: window.__perfMetrics.longTasksCount || 0,
          domNodes: document.querySelectorAll('*').length,
          totalTransferBytes: docBytes + resourceTransferBytes,
          resourceCount: resources.length,
          avatarCurrentSrc: avatarImg ? avatarImg.currentSrc : '',
          eagerPanelLoaded: resources.some((r) => r.name.includes('command-menu-panel')),
          eagerCommandCssLoaded: resources.some(
            (r) => r.name.includes('command-menu.') && r.name.endsWith('.css')
          ),
        };
      });

      assert.equal(
        vitals.eagerPanelLoaded,
        false,
        'Lazy command-menu-panel JS should not load during initial page load'
      );
      assert.equal(
        vitals.eagerCommandCssLoaded,
        false,
        'Lazy command-menu CSS should not load during initial page load'
      );

      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }

    // Check overflow across mobile viewports & routes (navigate once per route, resize in-place)
    const routesToCheck = qualityOnly
      ? ['/quality/']
      : ['/', '/404.html', '/quality/', '/architecture/'];

    for (const route of routesToCheck) {
      const navRes = await page.goto(`${baseUrl}${route}`, {
        waitUntil: 'load',
        timeout: 30_000,
      });
      assert.ok(
        navRes && navRes.status() < 400,
        `Unexpected HTTP status navigating to ${route}: ${navRes ? navRes.status() : 'no response'}`
      );
      await waitForFontsReady(page);
      for (const width of [320, 375, 390, 768]) {
        await page.setViewportSize({ width, height: 800 });
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        overflowChecks.push({ route, width, ...overflow });
        assert.ok(
          overflow.scrollWidth <= overflow.clientWidth,
          `Horizontal overflow on ${route} at ${width}px: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`
        );
      }
    }

    assert.equal(
      blockedExternalRequests.length,
      0,
      `External requests detected during perf audit: ${blockedExternalRequests.join(', ')}`
    );
    assert.equal(
      failedRequests.length,
      0,
      `Failed subresource requests detected: ${JSON.stringify(failedRequests)}`
    );
    assert.equal(
      consoleErrors.length,
      0,
      `Browser console errors detected: ${consoleErrors.join('; ')}`
    );

    if (qualityOnly) {
      console.log(
        `PASS /quality/ render & overflow audit (${overflowChecks.length} viewports, 0 console/network errors)`
      );
      return;
    }

    assert.ok(
      vitals.cls <= BUDGETS.clsMax,
      `Mobile CLS ${vitals.cls} exceeds budget ${BUDGETS.clsMax}`
    );
    assert.ok(
      typeof vitals.lcpMs === 'number' && vitals.lcpMs > 0 && vitals.lcpMs <= BUDGETS.lcpMaxMs,
      `Mobile LCP ${vitals.lcpMs}ms missing or exceeds budget ${BUDGETS.lcpMaxMs}ms`
    );
    assert.ok(
      typeof vitals.fcpMs === 'number' && vitals.fcpMs > 0 && vitals.fcpMs <= BUDGETS.fcpMaxMs,
      `Mobile FCP ${vitals.fcpMs}ms missing or exceeds budget ${BUDGETS.fcpMaxMs}ms`
    );
    assert.ok(
      vitals.totalTransferBytes <= BUDGETS.totalMobileTransferMaxBytes,
      `Mobile initial payload ${vitals.totalTransferBytes} B exceeds budget ${BUDGETS.totalMobileTransferMaxBytes} B`
    );
    assert.ok(
      vitals.domNodes <= BUDGETS.maxDomNodes,
      `DOM node count ${vitals.domNodes} exceeds budget ${BUDGETS.maxDomNodes}`
    );
    assert.ok(
      vitals.maxLongTaskMs <= BUDGETS.maxLongTaskMs,
      `Max long task ${vitals.maxLongTaskMs}ms exceeds budget ${BUDGETS.maxLongTaskMs}ms`
    );

    const report = {
      passed: true,
      budgets: BUDGETS,
      assetSizes: {
        ...assetSizes,
        initialJsBytes,
        combinedFontsBytes,
        initialBrotliBytes,
      },
      mobileVitals: vitals,
      overflowChecksCount: overflowChecks.length,
      failedRequestsCount: failedRequests.length,
      timestamp: new Date().toISOString(),
    };

    fs.mkdirSync(reportsDir, { recursive: true });
    atomicWriteFileSync(
      path.join(reportsDir, 'perf-report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log(
      `PASS performance & mobile audit: screen CSS ${(assetSizes.screenCssBytes / 1024).toFixed(1)} KB, initial JS ${(initialJsBytes / 1024).toFixed(1)} KB, fonts ${(combinedFontsBytes / 1024).toFixed(1)} KB, mobile transfer ${(vitals.totalTransferBytes / 1024).toFixed(1)} KB (Brotli ~${(initialBrotliBytes / 1024).toFixed(1)} KB), DOM ${vitals.domNodes} nodes, FCP ${vitals.fcpMs}ms, LCP ${vitals.lcpMs}ms, CLS ${vitals.cls}`
    );
  } finally {
    unregisterSignals();
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
