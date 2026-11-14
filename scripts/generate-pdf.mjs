import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  enforceLocalRouting,
  findBrowserExecutable,
  withBrowser,
  withStaticServer,
} from './lib/browser.mjs';
import { readJson, resolveBuildTimestampMs, writeReportJson } from './lib/io.mjs';
import { isEntrypoint, ROOT, resolveRootPaths } from './lib/paths.mjs';
import { inspectPdfBuffer, normalizePdfTimestamps } from './lib/pdf.mjs';
import { getSiteEndpoints } from './lib/site-config.mjs';

async function renderPdfWithPage({
  browser,
  baseUrl,
  executablePath,
  rootDir,
  siteDir,
  reportsDir,
  resume,
}) {
  const endpoints = getSiteEndpoints(resume);
  const maxPdfPages = Number(resume.meta?.maxPdfPages || 1);
  const pdfRelPath = endpoints.resumePdfPath.replace(/^\/+/, '');
  const pdfOutPath = path.join(siteDir, pdfRelPath);
  const buildTimestampMs = resolveBuildTimestampMs(rootDir);
  const expectProjectsHidden =
    Array.isArray(resume.projects) &&
    resume.projects.length > 0 &&
    resume.projects.every((p) => p.showInPrint === false);

  const blockedExternalRequests = [];
  const context = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 1280, height: 900 },
  });

  try {
    const page = await context.newPage();
    await enforceLocalRouting(page, new URL(baseUrl).origin, blockedExternalRequests);

    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });

    const printAudit = await page.evaluate(async (expectedName) => {
      document.documentElement.classList.remove('dark');
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const avatar = document.querySelector('img.avatar');
      const avatarWrap = avatar?.closest('picture') || avatar;
      const avatarVisible = Boolean(avatarWrap && getComputedStyle(avatarWrap).display !== 'none');
      const projectsEl = document.querySelector('#projects');
      const projectsVisibleInPrint = Boolean(
        projectsEl && getComputedStyle(projectsEl).display !== 'none'
      );
      const text = document.body.textContent || '';
      return {
        hasName: text.includes(expectedName),
        avatarVisible,
        projectsVisibleInPrint,
      };
    }, resume.basics.name);

    assert.ok(printAudit.hasName, 'Print layout missing candidate name in rendered DOM');
    assert.ok(!printAudit.avatarVisible, 'Print CSS should hide avatar imagery for ATS compliance');
    if (expectProjectsHidden) {
      assert.ok(
        !printAudit.projectsVisibleInPrint,
        'Selected Projects section should stay hidden in print PDF layout'
      );
    }

    fs.mkdirSync(path.dirname(pdfOutPath), { recursive: true });
    await page.pdf({
      path: pdfOutPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
    });

    assert.equal(
      blockedExternalRequests.length,
      0,
      `External requests detected during PDF build: ${blockedExternalRequests.join(', ')}`
    );

    const rawPdfBytes = fs.readFileSync(pdfOutPath);
    const pdfBytes = normalizePdfTimestamps(rawPdfBytes, buildTimestampMs);
    fs.writeFileSync(pdfOutPath, pdfBytes);

    const inspection = inspectPdfBuffer(pdfBytes);
    assert.ok(inspection.hasMagicHeader, 'Generated PDF does not start with %PDF- magic header');
    assert.ok(
      inspection.bytes >= 5000,
      `Generated PDF unexpectedly small (${inspection.bytes} bytes)`
    );
    assert.ok(
      inspection.tagged,
      'Generated PDF is missing /StructTreeRoot (tagged PDF required for ATS/a11y)'
    );
    assert.ok(
      !inspection.type3Fonts,
      'Generated PDF contains Type 3 fonts; use static TrueType/OpenType fonts in print CSS'
    );
    assert.ok(
      !inspection.embeddedImages,
      'Generated PDF contains embedded raster images; hide imagery in print CSS for ATS'
    );
    assert.ok(
      inspection.pages >= 1 && inspection.pages <= maxPdfPages,
      `Generated PDF page count ${inspection.pages} violates maxPdfPages=${maxPdfPages}`
    );

    writeReportJson(
      'pdf-report.json',
      {
        passed: true,
        path: endpoints.resumePdfPath,
        bytes: inspection.bytes,
        pages: inspection.pages,
        maxPages: maxPdfPages,
        tagged: inspection.tagged,
        type3Fonts: inspection.type3Fonts,
        embeddedImages: inspection.embeddedImages,
        executablePath,
        blockedExternalRequests: blockedExternalRequests.length,
        timestamp: new Date(buildTimestampMs).toISOString(),
      },
      reportsDir
    );

    console.log(
      `Generated _site${endpoints.resumePdfPath} (${inspection.pages} page${inspection.pages === 1 ? '' : 's'}, ${(inspection.bytes / 1024).toFixed(1)} KB, tagged=${inspection.tagged}, type3=${inspection.type3Fonts}, images=${inspection.embeddedImages}) via ${executablePath}`
    );
  } finally {
    await context.close();
  }
}

export async function generatePdf({
  browser = null,
  baseUrl = null,
  executablePath = null,
  rootDir = ROOT,
  siteDir = null,
  reportsDir = null,
  resume: resumeArg = null,
} = {}) {
  const paths = resolveRootPaths(rootDir);
  const resolvedSiteDir = siteDir || paths.siteDir;
  const resolvedReportsDir = reportsDir || paths.reportsDir;
  const resume = resumeArg || readJson(paths.resumePath);

  if (!fs.existsSync(path.join(resolvedSiteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Build static files before generating PDF.');
  }

  if (browser && baseUrl) {
    return renderPdfWithPage({
      browser,
      baseUrl,
      executablePath: executablePath || findBrowserExecutable(),
      rootDir,
      siteDir: resolvedSiteDir,
      reportsDir: resolvedReportsDir,
      resume,
    });
  }

  return withStaticServer(resolvedSiteDir, async ({ baseUrl: srvBaseUrl }) =>
    withBrowser(async (launchedBrowser, exePath) =>
      renderPdfWithPage({
        browser: launchedBrowser,
        baseUrl: srvBaseUrl,
        executablePath: exePath,
        rootDir,
        siteDir: resolvedSiteDir,
        reportsDir: resolvedReportsDir,
        resume,
      })
    )
  );
}

if (isEntrypoint(import.meta.url)) {
  generatePdf().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
