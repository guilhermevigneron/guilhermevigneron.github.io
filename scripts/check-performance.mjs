import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessBrowser } from './lib/browser.mjs';
import { createStaticServer } from './serve.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');

const BUDGETS = {
  screenCssMaxBytes: 12 * 1024,
  subpageCssMaxBytes: 6 * 1024,
  printCssMaxBytes: 3 * 1024,
  initialJsMaxBytes: 4 * 1024,
  lazyPanelJsMaxBytes: 12 * 1024,
  combinedFontsMaxBytes: 32 * 1024,
  indexHtmlMaxBytes: 25 * 1024,
  avatarJpgMaxBytes: 8 * 1024,
  avatarAvifMaxBytes: 4 * 1024,
  totalMobileTransferMaxBytes: 75 * 1024,
  clsMax: 0.01,
  lcpMaxMs: 2500,
  fcpMaxMs: 1800,
};

function fileSize(relPath) {
  const full = path.join(siteDir, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Expected built asset missing: ${relPath}`);
  }
  return fs.statSync(full).size;
}

async function main() {
  const qualityOnly = process.argv.includes('--quality-only');

  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Run "npm run build" first.');
  }

  const assetSizes = {
    screenCssBytes: fileSize('assets/css/styles.css'),
    subpageCssBytes: fileSize('assets/css/subpage.css'),
    printCssBytes: fileSize('assets/css/print.css'),
    themeInitJsBytes: fileSize('assets/js/theme-init.js'),
    themeJsBytes: fileSize('assets/js/theme.js'),
    commandMenuJsBytes: fileSize('assets/js/command-menu.js'),
    commandMenuPanelJsBytes: fileSize('assets/js/command-menu-panel.js'),
    monoFontBytes: fileSize('assets/fonts/GeistMono-Variable.woff2'),
    pixelFontBytes: fileSize('assets/fonts/GeistPixel-Square.woff2'),
    indexHtmlBytes: fileSize('index.html'),
    avatarJpgBytes: fileSize('assets/avatar.jpg'),
    avatarAvif224Bytes: fileSize('assets/avatar-224.avif'),
  };
  const initialJsBytes =
    assetSizes.themeInitJsBytes + assetSizes.themeJsBytes + assetSizes.commandMenuJsBytes;
  const combinedFontsBytes = assetSizes.monoFontBytes + assetSizes.pixelFontBytes;

  assert.ok(
    assetSizes.screenCssBytes <= BUDGETS.screenCssMaxBytes,
    `Screen CSS ${assetSizes.screenCssBytes} B exceeds budget ${BUDGETS.screenCssMaxBytes} B`
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
    assetSizes.avatarJpgBytes <= BUDGETS.avatarJpgMaxBytes,
    `avatar.jpg ${assetSizes.avatarJpgBytes} B exceeds budget ${BUDGETS.avatarJpgMaxBytes} B`
  );
  assert.ok(
    assetSizes.avatarAvif224Bytes <= BUDGETS.avatarAvifMaxBytes,
    `avatar-224.avif ${assetSizes.avatarAvif224Bytes} B exceeds budget ${BUDGETS.avatarAvifMaxBytes} B`
  );

  const server = createStaticServer(siteDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  const failedRequests = [];
  const consoleErrors = [];
  const overflowChecks = [];
  const blockedExternalRequests = [];
  const baseOrigin = new URL(baseUrl).origin;

  try {
    ({ browser } = await launchHeadlessBrowser());

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

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
      const url = res.url();
      const pathname = new URL(url).pathname;
      if (res.status() >= 400 && pathname !== '/404.html' && !pathname.includes('nonexistent')) {
        failedRequests.push({ url: pathname, status: res.status() });
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.addInitScript(() => {
      window.__perfMetrics = { cls: 0, lcp: null, fcp: null };
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
      } catch {
        // Ignore unsupported observer entries
      }
    });

    let vitals = null;
    if (!qualityOnly) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
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
          totalTransferBytes: docBytes + resourceTransferBytes,
          resourceCount: resources.length,
          avatarCurrentSrc: avatarImg ? avatarImg.currentSrc : '',
          eagerPanelLoaded: resources.some((r) => r.name.includes('command-menu-panel')),
        };
      });

      assert.equal(
        vitals.eagerPanelLoaded,
        false,
        'Lazy command-menu-panel JS should not load during initial page load'
      );

      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }

    // Check overflow across mobile viewports & routes (navigate once per route, resize in-place)
    const routesToCheck = qualityOnly
      ? ['/quality/']
      : ['/', '/404.html', '/quality/', '/architecture/'];

    for (const route of routesToCheck) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
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

    const report = {
      passed: true,
      budgets: BUDGETS,
      assetSizes: {
        ...assetSizes,
        initialJsBytes,
        combinedFontsBytes,
      },
      mobileVitals: vitals,
      overflowChecksCount: overflowChecks.length,
      failedRequestsCount: failedRequests.length,
      timestamp: new Date().toISOString(),
    };

    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'perf-report.json'), JSON.stringify(report, null, 2));

    console.log(
      `PASS performance & mobile audit: screen CSS ${(assetSizes.screenCssBytes / 1024).toFixed(1)} KB, initial JS ${(initialJsBytes / 1024).toFixed(1)} KB, fonts ${(combinedFontsBytes / 1024).toFixed(1)} KB, mobile transfer ${(vitals.totalTransferBytes / 1024).toFixed(1)} KB, FCP ${vitals.fcpMs}ms, LCP ${vitals.lcpMs}ms, CLS ${vitals.cls}`
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
