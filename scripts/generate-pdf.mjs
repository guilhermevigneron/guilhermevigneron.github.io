import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  CHROMIUM_LAUNCH_ARGS,
  blockExternalRequests,
  findBrowserExecutable,
  startStaticServer,
} from './lib/browser.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const pdfOutPath = path.join(siteDir, 'resume.pdf');

function countPdfPages(pdfBuffer) {
  const text = pdfBuffer.toString('latin1');
  const pagesDictMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d+)/);
  if (pagesDictMatch) {
    return Number(pagesDictMatch[1]);
  }
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  return pageMatches ? pageMatches.length : 0;
}

async function generatePdf() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Build static files before generating PDF.');
  }

  const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
  const maxPdfPages = Number(resume.meta?.maxPdfPages || 1);

  const executablePath = findBrowserExecutable();
  const { baseUrl, close: closeServer } = await startStaticServer(siteDir);

  let browser;
  let blockedExternalRequests = [];

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: CHROMIUM_LAUNCH_ARGS,
    });

    const context = await browser.newContext({
      colorScheme: 'light',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    // Enforce zero external network requests while rendering PDF
    blockedExternalRequests = await blockExternalRequests(page, baseUrl);

    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    const printAudit = await page.evaluate(async (expectedName) => {
      document.documentElement.classList.remove('dark');
      await document.fonts.ready;
      const avatar = document.querySelector('img.avatar');
      const text = document.body.innerText || '';
      return {
        hasName: text.includes(expectedName),
        avatarReady: Boolean(avatar && avatar.complete && avatar.naturalWidth > 0),
        projectsVisibleInPrint: Boolean(
          document.querySelector('#projects') &&
            getComputedStyle(document.querySelector('#projects')).display !== 'none'
        ),
      };
    }, resume.basics.name);

    if (!printAudit.hasName) {
      throw new Error('Print layout missing candidate name in rendered DOM');
    }
    if (!printAudit.avatarReady) {
      throw new Error('Print layout avatar image failed to load');
    }

    await page.pdf({
      path: pdfOutPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0.45in',
        right: '0.5in',
        bottom: '0.45in',
        left: '0.5in',
      },
    });

    if (blockedExternalRequests.length > 0) {
      throw new Error(
        `External requests detected during PDF build: ${blockedExternalRequests.join(', ')}`
      );
    }

    const pdfBytes = fs.readFileSync(pdfOutPath);
    if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Generated resume.pdf does not start with %PDF- magic header');
    }
    if (pdfBytes.length < 5000) {
      throw new Error(`Generated resume.pdf unexpectedly small (${pdfBytes.length} bytes)`);
    }

    const pageCount = countPdfPages(pdfBytes);
    if (pageCount < 1 || pageCount > maxPdfPages) {
      throw new Error(
        `Generated resume.pdf page count ${pageCount} violates maxPdfPages=${maxPdfPages}`
      );
    }

    fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
    fs.writeFileSync(
      path.join(ROOT, '.ci-reports', 'pdf-report.json'),
      JSON.stringify(
        {
          passed: true,
          path: '/resume.pdf',
          bytes: pdfBytes.length,
          pages: pageCount,
          maxPages: maxPdfPages,
          executablePath,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(
      `Generated _site/resume.pdf (${pageCount} page${pageCount === 1 ? '' : 's'}, ${(pdfBytes.length / 1024).toFixed(1)} KB) via ${executablePath}`
    );
  } finally {
    if (browser) await browser.close();
    await closeServer();
  }
}

generatePdf().catch((err) => {
  console.error(err);
  process.exit(1);
});
