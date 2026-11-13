import fs from 'node:fs';
import path from 'node:path';
import {
  closeBrowserSafely,
  launchHeadlessBrowser,
  registerCleanupSignals,
  startStaticServer,
  stopStaticServer,
} from './lib/browser.mjs';
import { atomicWriteFileSync } from './lib/chrome.mjs';
import { countPdfPages } from './lib/pdf.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const pdfOutPath = path.join(siteDir, 'resume.pdf');
const pdfTempPath = `${pdfOutPath}.tmp`;

async function generatePdf() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Build static files before generating PDF.');
  }

  const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
  const maxPdfPages = Number(resume.meta?.maxPdfPages || 1);
  const projects = resume.projects || [];
  const expectProjectsHiddenInPrint =
    projects.length > 0 && projects.every((project) => project.showInPrint === false);

  fs.rmSync(pdfTempPath, { force: true });

  const { server, baseUrl } = await startStaticServer(siteDir);

  let browser;
  let executablePath;
  const blockedExternalRequests = [];
  const pageErrors = [];
  const localFailures = [];

  const unregisterSignals = registerCleanupSignals(async () => {
    fs.rmSync(pdfTempPath, { force: true });
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  });

  try {
    ({ browser, executablePath } = await launchHeadlessBrowser(30_000));

    const context = await browser.newContext({
      colorScheme: 'light',
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(30_000);

    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
    page.on('crash', () => pageErrors.push('page crashed while rendering PDF'));

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

    // Enforce zero external network requests while rendering PDF
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
      blockedExternalRequests.push(url);
      return route.abort();
    });

    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    const navRes = await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30_000 });
    if (!navRes || navRes.status() >= 400) {
      throw new Error(
        `Unexpected status navigating to /: ${navRes ? navRes.status() : 'no response'}`
      );
    }

    const printAudit = await page.evaluate(async (expectedName) => {
      document.documentElement.classList.remove('dark');
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('fonts.ready timed out')), 10_000)
        ),
      ]);
      const avatar = document.querySelector('img.avatar');
      const avatarWrap = avatar?.closest('picture') || avatar;
      const avatarVisible = Boolean(
        avatarWrap && getComputedStyle(avatarWrap).display !== 'none'
      );
      const nameEl = document.querySelector('#resume-name') || document.querySelector('h1');
      const hasName = Boolean(
        nameEl?.textContent?.includes(expectedName) &&
          getComputedStyle(nameEl).display !== 'none'
      );
      return {
        hasName,
        avatarVisible,
        avatarReady: Boolean(avatar?.complete && avatar.naturalWidth > 0),
        projectsVisibleInPrint: Boolean(
          document.querySelector('#projects') &&
            getComputedStyle(document.querySelector('#projects')).display !== 'none'
        ),
      };
    }, resume.basics.name);

    if (pageErrors.length > 0) {
      throw new Error(`Page errors during PDF render: ${pageErrors.join('; ')}`);
    }
    if (localFailures.length > 0) {
      throw new Error(`Local asset errors during PDF render: ${localFailures.join(', ')}`);
    }
    if (!printAudit.hasName) {
      throw new Error('Print layout missing candidate name in rendered DOM');
    }
    if (printAudit.avatarVisible && !printAudit.avatarReady) {
      throw new Error('Print layout avatar image failed to load');
    }
    if (expectProjectsHiddenInPrint && printAudit.projectsVisibleInPrint) {
      throw new Error('Selected Projects section should stay hidden in print PDF layout');
    }

    await page.pdf({
      path: pdfTempPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
    });

    if (blockedExternalRequests.length > 0) {
      throw new Error(
        `External requests detected during PDF build: ${blockedExternalRequests.join(', ')}`
      );
    }

    const pdfBytes = fs.readFileSync(pdfTempPath);
    if (!pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Generated resume.pdf does not start with %PDF- magic header');
    }
    if (pdfBytes.length < 5000) {
      throw new Error(`Generated resume.pdf unexpectedly small (${pdfBytes.length} bytes)`);
    }

    const pdfLatin1 = pdfBytes.toString('latin1');
    const isTagged = /\/StructTreeRoot\b/.test(pdfLatin1);
    const hasType3Fonts = /\/Subtype\s*\/Type3\b/.test(pdfLatin1);
    const hasEmbeddedImages = /\/Subtype\s*\/Image\b/.test(pdfLatin1);
    const pageCount = countPdfPages(pdfBytes);

    if (!isTagged) {
      throw new Error(
        'Generated resume.pdf is missing /StructTreeRoot (tagged PDF required for ATS/a11y)'
      );
    }
    if (hasType3Fonts) {
      throw new Error(
        'Generated resume.pdf contains Type 3 fonts; use static TrueType/OpenType fonts in print CSS'
      );
    }
    if (hasEmbeddedImages) {
      throw new Error(
        'Generated resume.pdf contains embedded raster images; hide imagery in print CSS for ATS'
      );
    }
    if (pageCount < 1 || pageCount > maxPdfPages) {
      throw new Error(
        `Generated resume.pdf page count ${pageCount} violates maxPdfPages=${maxPdfPages}`
      );
    }

    fs.renameSync(pdfTempPath, pdfOutPath);

    fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
    atomicWriteFileSync(
      path.join(ROOT, '.ci-reports', 'pdf-report.json'),
      JSON.stringify(
        {
          passed: true,
          path: '/resume.pdf',
          bytes: pdfBytes.length,
          pages: pageCount,
          maxPages: maxPdfPages,
          tagged: isTagged,
          type3Fonts: hasType3Fonts,
          embeddedImages: hasEmbeddedImages,
          executablePath,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(
      `Generated _site/resume.pdf (${pageCount} page${pageCount === 1 ? '' : 's'}, ${(pdfBytes.length / 1024).toFixed(1)} KB, tagged=${isTagged}, type3=${hasType3Fonts}, images=${hasEmbeddedImages}) via ${executablePath}`
    );
  } finally {
    unregisterSignals();
    fs.rmSync(pdfTempPath, { force: true });
    await closeBrowserSafely(browser);
    await stopStaticServer(server);
  }
}

generatePdf().catch((err) => {
  console.error(err);
  process.exit(1);
});
