import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessBrowser } from './lib/browser.mjs';
import { escapeHtml } from './lib/chrome.mjs';
import { createStaticServer } from './serve.mjs';
import { computeYearsOfExperience } from './sync-resume.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const ogOutPath = path.join(siteDir, 'assets', 'og-card.png');

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
      <span class="endpoints">/resume.pdf &middot; /resume.json &middot; /quality/</span>
    </div>
  </div>
</body>
</html>`;
}

async function generateOgCard() {
  if (!fs.existsSync(path.join(siteDir, 'assets', 'avatar.jpg'))) {
    throw new Error('_site/assets/avatar.jpg not found. Copy assets before generating OG card.');
  }

  const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
  const cardHtml = buildCardHtml(resume);

  const server = createStaticServer(siteDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const virtualUrl = `${baseUrl}/__og-card__.html`;

  let browser;
  const blockedExternalRequests = [];

  try {
    ({ browser } = await launchHeadlessBrowser());

    const context = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const baseOrigin = new URL(baseUrl).origin;
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

    await page.goto(virtualUrl, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    fs.mkdirSync(path.dirname(ogOutPath), { recursive: true });
    await page.screenshot({ path: ogOutPath, type: 'png' });

    if (blockedExternalRequests.length > 0) {
      throw new Error(
        `External requests detected during OG card build: ${blockedExternalRequests.join(', ')}`
      );
    }

    const pngBytes = fs.readFileSync(ogOutPath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!pngBytes.subarray(0, 8).equals(pngSignature)) {
      throw new Error('Generated og-card.png does not have valid PNG magic signature');
    }
    if (pngBytes.length < 5000) {
      throw new Error(`Generated og-card.png unexpectedly small (${pngBytes.length} bytes)`);
    }

    fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
    fs.writeFileSync(
      path.join(ROOT, '.ci-reports', 'og-report.json'),
      JSON.stringify(
        {
          passed: true,
          path: '/assets/og-card.png',
          width: 1200,
          height: 630,
          bytes: pngBytes.length,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(
      `Generated _site/assets/og-card.png (1200x630, ${(pngBytes.length / 1024).toFixed(1)} KB)`
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

generateOgCard().catch((err) => {
  console.error(err);
  process.exit(1);
});
