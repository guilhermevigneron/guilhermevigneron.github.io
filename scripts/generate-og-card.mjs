import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { enforceLocalRouting, withBrowser, withStaticServer } from './lib/browser.mjs';
import { escapeHtml } from './lib/html.mjs';
import { readJson, resolveBuildTimestampMs, resolveBuildYear, writeReportJson } from './lib/io.mjs';
import { isEntrypoint, ROOT, resolveRootPaths } from './lib/paths.mjs';
import { normalizePng } from './lib/png.mjs';
import { getSiteEndpoints, THEME_COLORS } from './lib/site-config.mjs';
import { computeYearsOfExperience } from './sync-resume.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildCardHtml(resume, buildYear) {
  const endpoints = getSiteEndpoints(resume);
  const years = computeYearsOfExperience(resume, buildYear);
  const loc = [resume.basics?.location?.city, resume.basics?.location?.region]
    .filter(Boolean)
    .join(', ');
  const badgeLabel = [years !== null ? `${years}+ years` : '', loc].filter(Boolean).join(' · ');
  const highlights = (resume.skills || []).slice(0, 4).map((s) => s.name);
  const footerEndpoints = [
    endpoints.resumePdfPath,
    endpoints.resumeJsonPath,
    endpoints.qualityPath,
  ].join(' · ');

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
    background: ${THEME_COLORS.light};
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
      <span>${escapeHtml(endpoints.domain)}</span>
      ${badgeLabel ? `<span class="badge"><span class="dot"></span>${escapeHtml(badgeLabel)}</span>` : ''}
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
      <span class="endpoints">${escapeHtml(footerEndpoints)}</span>
    </div>
  </div>
</body>
</html>`;
}

async function renderOgWithPage({ browser, baseUrl, rootDir, siteDir, reportsDir, resume }) {
  const endpoints = getSiteEndpoints(resume);
  const ogRelPath = endpoints.ogImagePath.replace(/^\/+/, '');
  const ogOutPath = path.join(siteDir, ogRelPath);
  const buildTimestampMs = resolveBuildTimestampMs(rootDir);
  const buildYear = resolveBuildYear(resume, rootDir);
  const cardHtml = buildCardHtml(resume, buildYear);
  const virtualUrl = `${baseUrl}/__og-card__.html`;

  const blockedExternalRequests = [];
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  try {
    const page = await context.newPage();
    await enforceLocalRouting(page, new URL(baseUrl).origin, blockedExternalRequests, {
      [virtualUrl]: { body: cardHtml },
    });

    await page.goto(virtualUrl, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (img) => img.decode().catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    const rawPng = await page.screenshot({ type: 'png' });

    assert.equal(
      blockedExternalRequests.length,
      0,
      `External requests detected during OG card build: ${blockedExternalRequests.join(', ')}`
    );

    const pngBytes = normalizePng(rawPng);
    assert.ok(
      pngBytes.subarray(0, 8).equals(PNG_SIGNATURE),
      'Generated og-card.png does not have valid PNG magic signature'
    );
    assert.ok(
      pngBytes.length >= 5000,
      `Generated og-card.png unexpectedly small (${pngBytes.length} bytes)`
    );

    fs.mkdirSync(path.dirname(ogOutPath), { recursive: true });
    fs.writeFileSync(ogOutPath, pngBytes);

    writeReportJson(
      'og-report.json',
      {
        passed: true,
        path: endpoints.ogImagePath,
        width: 1200,
        height: 630,
        bytes: pngBytes.length,
        blockedExternalRequests: blockedExternalRequests.length,
        timestamp: new Date(buildTimestampMs).toISOString(),
      },
      reportsDir
    );

    console.log(
      `Generated _site${endpoints.ogImagePath} (1200x630, ${(pngBytes.length / 1024).toFixed(1)} KB)`
    );
  } finally {
    await context.close();
  }
}

export async function generateOgCard({
  browser = null,
  baseUrl = null,
  rootDir = ROOT,
  siteDir = null,
  reportsDir = null,
  resume: resumeArg = null,
} = {}) {
  const paths = resolveRootPaths(rootDir);
  const resolvedSiteDir = siteDir || paths.siteDir;
  const resolvedReportsDir = reportsDir || paths.reportsDir;
  const resume = resumeArg || readJson(paths.resumePath);

  if (!fs.existsSync(path.join(resolvedSiteDir, 'assets', 'avatar.jpg'))) {
    throw new Error('_site/assets/avatar.jpg not found. Copy assets before generating OG card.');
  }

  if (browser && baseUrl) {
    return renderOgWithPage({
      browser,
      baseUrl,
      rootDir,
      siteDir: resolvedSiteDir,
      reportsDir: resolvedReportsDir,
      resume,
    });
  }

  return withStaticServer(resolvedSiteDir, async ({ baseUrl: srvBaseUrl }) =>
    withBrowser(async (launchedBrowser) =>
      renderOgWithPage({
        browser: launchedBrowser,
        baseUrl: srvBaseUrl,
        rootDir,
        siteDir: resolvedSiteDir,
        reportsDir: resolvedReportsDir,
        resume,
      })
    )
  );
}

if (isEntrypoint(import.meta.url)) {
  generateOgCard().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
