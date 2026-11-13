import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createStaticServer } from './serve.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const pdfOutPath = path.join(siteDir, 'resume.pdf');

function findBrowserExecutable() {
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
  const server = createStaticServer(siteDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let browser;
  const blockedExternalRequests = [];

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      colorScheme: 'light',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    const baseOrigin = new URL(baseUrl).origin;

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
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
    const printAudit = await page.evaluate(async (expectedName) => {
      document.documentElement.classList.remove('dark');
      await document.fonts.ready;
      const avatar = document.querySelector('img.avatar');
      const avatarWrap = avatar?.closest('picture') || avatar;
      const avatarVisible = Boolean(
        avatarWrap && getComputedStyle(avatarWrap).display !== 'none'
      );
      const text = document.body.innerText || '';
      return {
        hasName: text.includes(expectedName),
        avatarVisible,
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
    if (printAudit.avatarVisible && !printAudit.avatarReady) {
      throw new Error('Print layout avatar image failed to load');
    }
    if (printAudit.projectsVisibleInPrint) {
      throw new Error('Selected Projects section should stay hidden in print PDF layout');
    }

    await page.pdf({
      path: pdfOutPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
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

    const pdfLatin1 = pdfBytes.toString('latin1');
    const isTagged = /\/StructTreeRoot\b/.test(pdfLatin1);
    const hasType3Fonts = /\/Subtype\s*\/Type3\b/.test(pdfLatin1);
    const hasEmbeddedImages = /\/Subtype\s*\/Image\b/.test(pdfLatin1);
    const pageCount = countPdfPages(pdfBytes);

    if (!isTagged) {
      throw new Error('Generated resume.pdf is missing /StructTreeRoot (tagged PDF required for ATS/a11y)');
    }
    if (hasType3Fonts) {
      throw new Error('Generated resume.pdf contains Type 3 fonts; use static TrueType/OpenType fonts in print CSS');
    }
    if (hasEmbeddedImages) {
      throw new Error('Generated resume.pdf contains embedded raster images; hide imagery in print CSS for ATS');
    }
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
          tagged: isTagged,
          type3Fonts: hasType3Fonts,
          embeddedImages: hasEmbeddedImages,
          executablePath,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(
      `Generated _site/resume.pdf (${pageCount} page${pageCount === 1 ? '' : 's'}, ${(pdfBytes.length / 1024).toFixed(1)} KB, tagged=${isTagged}, type3=${hasType3Fonts}, images=${hasEmbeddedImages}) via ${executablePath}`
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

generatePdf().catch((err) => {
  console.error(err);
  process.exit(1);
});
