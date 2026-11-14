import fs from 'node:fs';
import path from 'node:path';
import {
  closeBrowserSafely,
  launchHeadlessBrowser,
  registerCleanupSignals,
  startStaticServer,
  stopStaticServer,
} from './lib/browser.mjs';
import { atomicWriteFileSync, escapeHtml } from './lib/chrome.mjs';
import { computeYearsOfExperience } from './sync-resume.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const ogOutPath = path.join(siteDir, 'assets', 'og-card.png');
const ogTempPath = `${ogOutPath}.tmp`;

function buildCardHtml(resume) {
  const years = computeYearsOfExperience(resume) || 18;
  const domain = String(resume.basics.url || '').replace(/^https?:\/\//, '');
  const loc = [resume.basics.location?.city, resume.basics.location?.region]
    .filter(Boolean)
    .join(', ');
  const highlights = (resume.skills || []).slice(0, 4).map((s) => s.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @font-face {
    font-family: "Geist Mono";
    src: url("/assets/fonts/GeistMono-Variable.woff2") format("woff2");
    font-weight: 400 500;
    font-style: normal;
  }
  @font-face {
    font-family: "Geist Pixel Square";
    src: url("/assets/fonts/GeistPixel-Square.woff2") format("woff2");
    font-weight: 500;
    font-style: normal;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1200px;
    height: 630px;
    background: #f2f0ed;
    color: #1a1815;
    font-family: "Geist Mono", ui-monospace, monospace;
    -webkit-font-smoothing: antialiased;
  }
  body {
    padding: 36px;
    display: flex;
  }
  .card {
    flex: 1;
    width: 100%;
    min-width: 0;
    background: #fafaf8;
    border: 1px solid #dbd8d3;
    border-radius: 18px;
    padding: 52px 56px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 20px;
    color: #5c5955;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border: 1px solid #e3e1de;
    border-radius: 9999px;
    background: #f2f0ed;
    font-size: 16px;
    color: #1a1815;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: #14532d;
  }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 36px;
  }
  .hero-text {
    flex: 1;
    min-width: 0;
  }
  h1 {
    font-family: "Geist Pixel Square", "Geist Mono", monospace;
    font-weight: 500;
    font-size: 52px;
    line-height: 1.08;
    letter-spacing: -0.02em;
    color: #1a1815;
    margin-bottom: 20px;
  }
  .tagline {
    font-size: 24px;
    line-height: 1.45;
    color: #4a4744;
    margin-bottom: 18px;
  }
  .meta {
    font-size: 15.5px;
    color: #716e6c;
    white-space: nowrap;
  }
  .avatar {
    width: 204px;
    height: 204px;
    border-radius: 20px;
    object-fit: cover;
    border: 1px solid #e3e1de;
    background: #f2f0ed;
    flex-shrink: 0;
  }
  .footer {
    padding-top: 26px;
    border-top: 1px solid #e3e1de;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 17px;
    color: #5c5955;
  }
  .endpoints {
    color: #1a1815;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top-bar">
      <span>${escapeHtml(domain)}</span>
      <span class="badge"><span class="dot"></span>${escapeHtml(String(years))}+ years &middot; ${escapeHtml(loc)}</span>
    </div>
    <div class="hero">
      <div class="hero-text">
        <h1>${escapeHtml(resume.basics.name)}</h1>
        <p class="tagline">${escapeHtml(resume.basics.label)}</p>
        <p class="meta">${escapeHtml(highlights.join(' · '))}</p>
      </div>
      <img class="avatar" src="/assets/avatar.jpg" alt="">
    </div>
    <div class="footer">
      <span>Zero-Third-Party &middot; WCAG 2.1 AA &middot; Strict CSP</span>
      <span class="endpoints">${escapeHtml(resume.meta?.resumePdf || '/resume.pdf')} &middot; /resume.json &middot; ${escapeHtml(new URL(resume.meta?.qualityReportUrl || 'https://guilhermevigneron.dev/quality/').pathname)}</span>
    </div>
  </div>
</body>
</html>`;
}

function readPngDimensions(pngBytes) {
  if (pngBytes.length < 24 || pngBytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Generated og-card.png is missing valid IHDR chunk');
  }
  return {
    width: pngBytes.readUInt32BE(16),
    height: pngBytes.readUInt32BE(20),
  };
}

async function generateOgCard() {
  if (!fs.existsSync(path.join(siteDir, 'assets', 'avatar.jpg'))) {
    throw new Error('_site/assets/avatar.jpg not found. Copy assets before generating OG card.');
  }

  const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
  const cardHtml = buildCardHtml(resume);

  fs.mkdirSync(path.dirname(ogOutPath), { recursive: true });
  fs.rmSync(ogTempPath, { force: true });

  const { server, baseUrl } = await startStaticServer(siteDir);
  const virtualUrl = `${baseUrl}/__og-card__.html`;

  let browser;
  const blockedExternalRequests = [];
  const pageErrors = [];
  const localFailures = [];

  const unregisterSignals = registerCleanupSignals(async () => {
    fs.rmSync(ogTempPath, { force: true });
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  });

  try {
    ({ browser } = await launchHeadlessBrowser(30_000));

    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(30_000);

    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('crash', () => pageErrors.push('page crashed while rendering OG card'));

    const baseOrigin = new URL(baseUrl).origin;
    page.on('response', (res) => {
      try {
        if (new URL(res.url()).origin === baseOrigin && res.status() >= 400) {
          localFailures.push(`${res.status()} ${new URL(res.url()).pathname}`);
        }
      } catch {
        // Ignore non-URL responses
      }
    });

    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url === virtualUrl) {
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: cardHtml,
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
        // Fall through to block invalid URLs
      }
      blockedExternalRequests.push(url);
      return route.abort();
    });

    await page.goto(virtualUrl, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('fonts.ready timed out')), 10_000)
        ),
      ]);
      const avatar = document.querySelector('img.avatar');
      if (!avatar?.complete || avatar.naturalWidth === 0) {
        throw new Error('OG card avatar image failed to load');
      }
      if (
        !document.fonts.check('400 16px "Geist Mono"') ||
        !document.fonts.check('500 24px "Geist Pixel Square"')
      ) {
        throw new Error('OG card web fonts failed to load');
      }
    });

    if (pageErrors.length > 0) {
      throw new Error(`Page errors during OG card render: ${pageErrors.join('; ')}`);
    }
    if (localFailures.length > 0) {
      throw new Error(`Local asset errors during OG card render: ${localFailures.join(', ')}`);
    }

    await page.screenshot({ path: ogTempPath, type: 'png' });

    if (blockedExternalRequests.length > 0) {
      throw new Error(
        `External requests detected during OG card build: ${blockedExternalRequests.join(', ')}`
      );
    }

    const pngBytes = fs.readFileSync(ogTempPath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!pngBytes.subarray(0, 8).equals(pngSignature)) {
      throw new Error('Generated og-card.png does not have valid PNG magic signature');
    }
    const { width, height } = readPngDimensions(pngBytes);
    if (width !== 1200 || height !== 630) {
      throw new Error(
        `Generated og-card.png has invalid dimensions ${width}x${height} (expected 1200x630)`
      );
    }
    if (pngBytes.length < 5000) {
      throw new Error(`Generated og-card.png unexpectedly small (${pngBytes.length} bytes)`);
    }

    fs.renameSync(ogTempPath, ogOutPath);

    fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
    atomicWriteFileSync(
      path.join(ROOT, '.ci-reports', 'og-report.json'),
      JSON.stringify(
        {
          passed: true,
          path: '/assets/og-card.png',
          width,
          height,
          bytes: pngBytes.length,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(
      `Generated _site/assets/og-card.png (${width}x${height}, ${(pngBytes.length / 1024).toFixed(1)} KB)`
    );
  } finally {
    unregisterSignals();
    fs.rmSync(ogTempPath, { force: true });
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  }
}

generateOgCard().catch((err) => {
  console.error(err);
  process.exit(1);
});
