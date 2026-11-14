import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

export const BUDGETS = {
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

function readAssetManifest(rootDir = ROOT) {
  const manifestPath = path.join(rootDir, '.ci-reports', 'asset-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveAvatarPath(manifest, relPath) {
  return (
    manifest?.avatarReplacements?.[`/${relPath}`] ||
    manifest?.avatarReplacements?.[relPath] ||
    relPath
  );
}

function fileSize(targetSiteDir, relPath) {
  const normalized = String(relPath).replace(/^\//, '');
  const full = path.join(targetSiteDir, normalized);
  if (!fs.existsSync(full)) {
    throw new Error(`Expected built asset missing: ${normalized}`);
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

function brotliSize(targetSiteDir, relPath) {
  const full = path.join(targetSiteDir, String(relPath).replace(/^\//, ''));
  return zlib.brotliCompressSync(fs.readFileSync(full)).length;
}

export function evaluateAssetBudgets(assetSizes, budgets = BUDGETS) {
  assert.ok(assetSizes && typeof assetSizes === 'object', 'assetSizes must be an object');
  const initialJsBytes =
    assetSizes.initialJsBytes ??
    assetSizes.themeInitJsBytes + assetSizes.themeJsBytes + assetSizes.commandMenuJsBytes;
  const combinedFontsBytes = assetSizes.monoFontBytes + assetSizes.pixelFontBytes;

  assert.ok(
    assetSizes.screenCssBytes <= budgets.screenCssMaxBytes,
    `Screen CSS ${assetSizes.screenCssBytes} B exceeds budget ${budgets.screenCssMaxBytes} B`
  );
  if (assetSizes.commandMenuCssBytes !== undefined) {
    assert.ok(
      assetSizes.commandMenuCssBytes <= budgets.commandMenuCssMaxBytes,
      `Command menu CSS ${assetSizes.commandMenuCssBytes} B exceeds budget ${budgets.commandMenuCssMaxBytes} B`
    );
  }
  assert.ok(
    assetSizes.subpageCssBytes <= budgets.subpageCssMaxBytes,
    `Subpage CSS ${assetSizes.subpageCssBytes} B exceeds budget ${budgets.subpageCssMaxBytes} B`
  );
  assert.ok(
    assetSizes.printCssBytes <= budgets.printCssMaxBytes,
    `Print CSS ${assetSizes.printCssBytes} B exceeds budget ${budgets.printCssMaxBytes} B`
  );
  assert.ok(
    initialJsBytes <= budgets.initialJsMaxBytes,
    `Initial JS ${initialJsBytes} B exceeds budget ${budgets.initialJsMaxBytes} B`
  );
  assert.ok(
    assetSizes.commandMenuPanelJsBytes <= budgets.lazyPanelJsMaxBytes,
    `Lazy command menu panel JS ${assetSizes.commandMenuPanelJsBytes} B exceeds budget ${budgets.lazyPanelJsMaxBytes} B`
  );
  assert.ok(
    combinedFontsBytes <= budgets.combinedFontsMaxBytes,
    `Combined fonts ${combinedFontsBytes} B exceed budget ${budgets.combinedFontsMaxBytes} B`
  );
  assert.ok(
    assetSizes.indexHtmlBytes <= budgets.indexHtmlMaxBytes,
    `index.html ${assetSizes.indexHtmlBytes} B exceeds budget ${budgets.indexHtmlMaxBytes} B`
  );
  assert.ok(
    assetSizes.notFoundHtmlBytes <= budgets.notFoundHtmlMaxBytes,
    `404.html ${assetSizes.notFoundHtmlBytes} B exceeds budget ${budgets.notFoundHtmlMaxBytes} B`
  );
  if (assetSizes.qualityHtmlBytes != null) {
    assert.ok(
      assetSizes.qualityHtmlBytes <= budgets.qualityHtmlMaxBytes,
      `quality/index.html ${assetSizes.qualityHtmlBytes} B exceeds budget ${budgets.qualityHtmlMaxBytes} B`
    );
  }
  if (assetSizes.architectureHtmlBytes != null) {
    assert.ok(
      assetSizes.architectureHtmlBytes <= budgets.architectureHtmlMaxBytes,
      `architecture/index.html ${assetSizes.architectureHtmlBytes} B exceeds budget ${budgets.architectureHtmlMaxBytes} B`
    );
  }
  assert.ok(
    assetSizes.avatarJpgBytes <= budgets.avatarJpgMaxBytes,
    `avatar.jpg ${assetSizes.avatarJpgBytes} B exceeds budget ${budgets.avatarJpgMaxBytes} B`
  );
  assert.ok(
    assetSizes.avatarAvif224Bytes <= budgets.avatarAvifMaxBytes,
    `avatar-224.avif ${assetSizes.avatarAvif224Bytes} B exceeds budget ${budgets.avatarAvifMaxBytes} B`
  );
  for (const [label, bytes] of [
    ['avatar-168.avif', assetSizes.avatarAvif168Bytes],
    ['avatar-336.avif', assetSizes.avatarAvif336Bytes],
  ]) {
    if (bytes !== undefined) {
      assert.ok(
        bytes <= budgets.avatarAvifMaxBytes,
        `${label} ${bytes} B exceeds budget ${budgets.avatarAvifMaxBytes} B`
      );
    }
  }
  for (const [label, bytes] of [
    ['avatar-168.webp', assetSizes.avatarWebp168Bytes],
    ['avatar-224.webp', assetSizes.avatarWebp224Bytes],
    ['avatar-336.webp', assetSizes.avatarWebp336Bytes],
  ]) {
    if (bytes !== undefined) {
      assert.ok(
        bytes <= budgets.avatarWebpMaxBytes,
        `${label} ${bytes} B exceeds budget ${budgets.avatarWebpMaxBytes} B`
      );
    }
  }

  return { initialJsBytes, combinedFontsBytes };
}

export function evaluateVitalsBudgets(vitals, budgets = BUDGETS, overflowChecks = []) {
  assert.ok(vitals && typeof vitals === 'object', 'vitals must be an object');
  if (vitals.eagerPanelLoaded !== undefined) {
    assert.equal(
      vitals.eagerPanelLoaded,
      false,
      'Lazy command-menu-panel JS should not load during initial page load'
    );
  }
  if (vitals.eagerCommandCssLoaded !== undefined) {
    assert.equal(
      vitals.eagerCommandCssLoaded,
      false,
      'Lazy command-menu CSS should not load during initial page load'
    );
  }
  assert.ok(
    typeof vitals.cls === 'number' &&
      !Number.isNaN(vitals.cls) &&
      vitals.cls >= 0 &&
      vitals.cls <= budgets.clsMax,
    `Mobile CLS ${vitals.cls} missing or exceeds budget ${budgets.clsMax}`
  );
  assert.ok(
    typeof vitals.lcpMs === 'number' && vitals.lcpMs > 0 && vitals.lcpMs <= budgets.lcpMaxMs,
    `Mobile LCP ${vitals.lcpMs}ms missing or exceeds budget ${budgets.lcpMaxMs}ms`
  );
  assert.ok(
    typeof vitals.fcpMs === 'number' && vitals.fcpMs > 0 && vitals.fcpMs <= budgets.fcpMaxMs,
    `Mobile FCP ${vitals.fcpMs}ms missing or exceeds budget ${budgets.fcpMaxMs}ms`
  );
  assert.ok(
    typeof vitals.totalTransferBytes === 'number' &&
      vitals.totalTransferBytes > 0 &&
      vitals.totalTransferBytes <= budgets.totalMobileTransferMaxBytes,
    `Mobile initial payload ${vitals.totalTransferBytes} B missing or exceeds budget ${budgets.totalMobileTransferMaxBytes} B`
  );
  if (vitals.domNodes !== undefined) {
    assert.ok(
      vitals.domNodes <= budgets.maxDomNodes,
      `DOM node count ${vitals.domNodes} exceeds budget ${budgets.maxDomNodes}`
    );
  }
  if (vitals.maxLongTaskMs !== undefined) {
    assert.ok(
      vitals.maxLongTaskMs <= budgets.maxLongTaskMs,
      `Max long task ${vitals.maxLongTaskMs}ms exceeds budget ${budgets.maxLongTaskMs}ms`
    );
  }

  for (const check of overflowChecks) {
    assert.ok(
      check.scrollWidth <= check.clientWidth,
      `Horizontal overflow on ${check.route} at ${check.width}px: scrollWidth=${check.scrollWidth} > clientWidth=${check.clientWidth}`
    );
  }
}

async function attachRouteInterceptor(page, baseOrigin, blockedExternalRequests, axeSource) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (axeSource) {
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseOrigin && parsed.pathname === '/__pw_axe__/axe.min.js') {
          return route.fulfill({
            status: 200,
            contentType: 'application/javascript; charset=utf-8',
            body: axeSource,
          });
        }
      } catch {
        // Continue normal check
      }
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

async function measureOverflowAtWidths(page, baseUrl, route, widths) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const results = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve({
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
              });
            });
          });
        })
    );
    results.push({ route, width, ...overflow });
    assert.ok(
      overflow.scrollWidth <= overflow.clientWidth,
      `Horizontal overflow on ${route} at ${width}px: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`
    );
  }
  return results;
}

async function verifyQualityReportArtifacts(targetSiteDir, baseUrl) {
  const reportPath = path.join(targetSiteDir, 'quality', 'report.json');
  assert.ok(fs.existsSync(reportPath), 'Missing _site/quality/report.json');
  const reportJson = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(reportJson.schemaVersion, 1, 'Unexpected quality report schemaVersion');
  assert.ok(
    Array.isArray(reportJson.gates) && reportJson.gates.length === 10,
    `Expected 10 quality gates, got ${reportJson.gates?.length}`
  );

  const failingGates = reportJson.gates.filter((g) => g.status === 'fail');
  assert.equal(
    failingGates.length,
    0,
    `Failing gates in quality/report.json: ${JSON.stringify(failingGates)}`
  );

  if (process.env.LYCHEE_STATUS === 'success') {
    assert.equal(
      reportJson.overallStatus,
      'pass',
      'Final CI quality report overallStatus must be pass'
    );
    const nonPassing = reportJson.gates.filter((g) => g.status !== 'pass');
    assert.equal(
      nonPassing.length,
      0,
      `Non-passing gates in CI quality report: ${JSON.stringify(nonPassing)}`
    );
  } else {
    const unexpectedPending = reportJson.gates.filter(
      (g) => g.status === 'pending' && g.id !== 'link-integrity'
    );
    assert.equal(
      unexpectedPending.length,
      0,
      `Unexpected pending gates before quality verification: ${JSON.stringify(unexpectedPending)}`
    );
  }

  const res = await fetch(`${baseUrl}/quality/report.json`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(res.status, 200, 'Expected HTTP 200 for /quality/report.json');
}

async function auditQualityPageAccessibilityAndTouch({
  browser,
  baseUrl,
  baseOrigin,
  axeSource,
  blockedExternalRequests,
  failedRequests,
  consoleErrors,
}) {
  const matrix = [
    {
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
      theme: 'light',
      label: 'quality-desktop-light',
    },
    {
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
      theme: 'dark',
      label: 'quality-desktop-dark',
    },
    {
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      theme: 'light',
      label: 'quality-mobile-light',
    },
    {
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
      theme: 'dark',
      label: 'quality-mobile-dark',
    },
  ];

  for (const scenario of matrix) {
    const ctx = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: scenario.isMobile ? 2 : 1,
      isMobile: scenario.isMobile,
      hasTouch: scenario.hasTouch,
    });
    const pg = await ctx.newPage();

    await attachRouteInterceptor(pg, baseOrigin, blockedExternalRequests, axeSource);
    pg.on('response', (res) => {
      const pathname = new URL(res.url()).pathname;
      if (res.status() >= 400 && pathname !== '/404.html') {
        failedRequests.push({ url: pathname, status: res.status() });
      }
    });
    pg.on('pageerror', (err) => consoleErrors.push(err.message));
    pg.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await pg.addInitScript((theme) => {
      localStorage.setItem('theme', theme);
      window.__cspViolations = [];
      window.addEventListener('securitypolicyviolation', (ev) => {
        window.__cspViolations.push(`${ev.violatedDirective}:${ev.blockedURI}`);
      });
    }, scenario.theme);

    await pg.goto(`${baseUrl}/quality/`, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);

    const isDark = await pg.evaluate(() => document.documentElement.classList.contains('dark'));
    assert.equal(isDark, scenario.theme === 'dark', `Theme mismatch for ${scenario.label}`);

    if (scenario.isMobile) {
      const touchReport = await pg.evaluate(() => {
        const navTargets = [
          ...document.querySelectorAll('.subpage-nav-actions a, .subpage-nav-actions button'),
        ]
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              text: el.textContent.trim() || el.getAttribute('aria-label') || el.id,
              width: rect.width,
              height: rect.height,
            };
          });
        const footerLinks = [...document.querySelectorAll('.cv-footer-links a')].map((el) => {
          const rect = el.getBoundingClientRect();
          return { text: el.textContent.trim(), width: rect.width, height: rect.height };
        });
        return { navTargets, footerLinks };
      });

      for (const target of touchReport.navTargets) {
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `/quality/ mobile nav target "${target.text}" too small (${target.width}x${target.height})`
        );
      }
      for (const link of touchReport.footerLinks) {
        assert.ok(
          link.height >= 44,
          `/quality/ mobile footer link "${link.text}" tap height too small (${link.height})`
        );
      }
    }

    const axeResults = await pg.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/__pw_axe__/axe.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      return window.axe.run(document);
    });

    const cspViolations = await pg.evaluate(() => window.__cspViolations || []);
    assert.equal(
      cspViolations.length,
      0,
      `CSP violations on ${scenario.label}: ${cspViolations.join(', ')}`
    );
    assert.equal(
      axeResults.violations.length,
      0,
      `WCAG violations on ${scenario.label}: ${JSON.stringify(axeResults.violations.map((v) => v.id))}`
    );

    await ctx.close();
  }
}

export async function runPerformanceAudit({ qualityOnly = false, rootDir = ROOT } = {}) {
  const targetSiteDir = path.join(rootDir, '_site');
  const targetReportsDir = path.join(rootDir, '.ci-reports');

  if (!fs.existsSync(path.join(targetSiteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Run "npm run build" first.');
  }

  const manifest = readAssetManifest(rootDir);
  const screenCssPath = manifest?.cssUrl || 'assets/css/styles.css';
  const printCssPath = manifest?.printCssUrl || 'assets/css/print.css';
  const themeInitJsPath = manifest?.themeInitJsUrl || 'assets/js/theme-init.js';
  const themeJsPath = manifest?.themeJsUrl || 'assets/js/theme.js';
  const commandMenuJsPath = manifest?.commandMenuJsUrl || 'assets/js/command-menu.js';
  const assetSizes = {
    screenCssBytes: fileSize(targetSiteDir, screenCssPath),
    commandMenuCssBytes: fileSize(
      targetSiteDir,
      manifest?.commandMenuCssUrl || 'assets/css/command-menu.css'
    ),
    subpageCssBytes: fileSize(targetSiteDir, manifest?.subpageCssUrl || 'assets/css/subpage.css'),
    printCssBytes: fileSize(targetSiteDir, printCssPath),
    themeInitJsBytes: fileSize(targetSiteDir, themeInitJsPath),
    themeJsBytes: fileSize(targetSiteDir, themeJsPath),
    commandMenuJsBytes: fileSize(targetSiteDir, commandMenuJsPath),
    commandMenuPanelJsBytes: fileSize(
      targetSiteDir,
      manifest?.commandMenuPanelJsUrl || 'assets/js/command-menu-panel.js'
    ),
    monoFontBytes: fileSize(
      targetSiteDir,
      manifest?.monoFontUrl || 'assets/fonts/GeistMono-Variable.woff2'
    ),
    pixelFontBytes: fileSize(
      targetSiteDir,
      manifest?.pixelFontUrl || 'assets/fonts/GeistPixel-Square.woff2'
    ),
    indexHtmlBytes: fileSize(targetSiteDir, 'index.html'),
    notFoundHtmlBytes: fileSize(targetSiteDir, '404.html'),
    qualityHtmlBytes: fs.existsSync(path.join(targetSiteDir, 'quality/index.html'))
      ? fileSize(targetSiteDir, 'quality/index.html')
      : null,
    architectureHtmlBytes: fs.existsSync(path.join(targetSiteDir, 'architecture/index.html'))
      ? fileSize(targetSiteDir, 'architecture/index.html')
      : null,
    avatarJpgBytes: fileSize(targetSiteDir, resolveAvatarPath(manifest, 'assets/avatar.jpg')),
    avatarAvif168Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-168.avif')
    ),
    avatarAvif224Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-224.avif')
    ),
    avatarAvif336Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-336.avif')
    ),
    avatarWebp168Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-168.webp')
    ),
    avatarWebp224Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-224.webp')
    ),
    avatarWebp336Bytes: fileSize(
      targetSiteDir,
      resolveAvatarPath(manifest, 'assets/avatar-336.webp')
    ),
  };
  const { initialJsBytes, combinedFontsBytes } = evaluateAssetBudgets(assetSizes, BUDGETS);
  const initialBrotliBytes =
    brotliSize(targetSiteDir, 'index.html') +
    brotliSize(targetSiteDir, screenCssPath) +
    brotliSize(targetSiteDir, printCssPath) +
    brotliSize(targetSiteDir, themeInitJsPath) +
    brotliSize(targetSiteDir, themeJsPath) +
    brotliSize(targetSiteDir, commandMenuJsPath) +
    assetSizes.monoFontBytes +
    assetSizes.pixelFontBytes +
    assetSizes.avatarAvif336Bytes;

  const resumePath = path.join(rootDir, 'resume.json');
  const resumeData = fs.existsSync(resumePath)
    ? JSON.parse(fs.readFileSync(resumePath, 'utf8'))
    : null;
  const projects = resumeData?.projects || [];
  const expectProjectsHiddenInPrint =
    projects.length > 0 && projects.every((project) => project.showInPrint === false);

  const axePath = path.join(rootDir, 'node_modules', 'axe-core', 'axe.min.js');
  const axeSource = qualityOnly && fs.existsSync(axePath) ? fs.readFileSync(axePath, 'utf8') : null;

  const { server, baseUrl } = await startStaticServer(targetSiteDir);

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
    await attachRouteInterceptor(page, baseOrigin, blockedExternalRequests, null);

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
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      await page.waitForFunction(
        () => window.__perfMetrics?.fcp !== null && window.__perfMetrics?.lcp !== null,
        { timeout: 10_000 }
      );

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

      await page.emulateMedia({ media: 'print', colorScheme: 'light' });
      const printAudit = await page.evaluate(() => {
        const displayOf = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).display : null;
        };
        return {
          printContactDisplay: displayOf('.print-contact'),
          headerActionsDisplay: displayOf('.header-actions'),
          avatarDisplay: displayOf('.avatar-picture'),
          footerDisplay: displayOf('.cv-footer-wrap'),
          commandBarDisplay: displayOf('.command-bar'),
          projectsDisplay: displayOf('#projects'),
        };
      });
      assert.notEqual(
        printAudit.printContactDisplay,
        'none',
        '.print-contact must be visible in @media print'
      );
      assert.equal(
        printAudit.headerActionsDisplay,
        'none',
        '.header-actions must be hidden in @media print'
      );
      assert.equal(
        printAudit.avatarDisplay,
        'none',
        '.avatar-picture must be hidden in @media print'
      );
      assert.equal(
        printAudit.footerDisplay,
        'none',
        '.cv-footer-wrap must be hidden in @media print'
      );
      assert.equal(
        printAudit.commandBarDisplay,
        'none',
        '.command-bar must be hidden in @media print'
      );
      if (expectProjectsHiddenInPrint) {
        assert.equal(
          printAudit.projectsDisplay,
          'none',
          '#projects must be hidden in @media print'
        );
      }
      await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
    }

    const routesToCheck = qualityOnly
      ? ['/quality/']
      : ['/', '/404.html', '/quality/', '/architecture/'];

    for (const route of routesToCheck) {
      const routeOverflow = await measureOverflowAtWidths(
        page,
        baseUrl,
        route,
        [320, 375, 390, 768]
      );
      overflowChecks.push(...routeOverflow);
    }

    if (qualityOnly) {
      await verifyQualityReportArtifacts(targetSiteDir, baseUrl);
      if (!axeSource) {
        throw new Error(
          'node_modules/axe-core/axe.min.js missing for --quality-only WCAG verification'
        );
      }
      await auditQualityPageAccessibilityAndTouch({
        browser,
        baseUrl,
        baseOrigin,
        axeSource,
        blockedExternalRequests,
        failedRequests,
        consoleErrors,
      });
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
        `PASS /quality/ render, report.json, mobile touch & 4-way WCAG AA audit (${overflowChecks.length} viewports, 0 console/network errors)`
      );
      return;
    }

    evaluateVitalsBudgets(vitals, BUDGETS, overflowChecks);

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

    fs.mkdirSync(targetReportsDir, { recursive: true });
    atomicWriteFileSync(
      path.join(targetReportsDir, 'perf-report.json'),
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

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const qualityOnly = process.argv.includes('--quality-only');
  runPerformanceAudit({ qualityOnly }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
