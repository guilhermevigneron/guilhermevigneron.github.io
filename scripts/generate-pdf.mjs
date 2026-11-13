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

async function generatePdf() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error('_site/index.html not found. Build static files before generating PDF.');
  }

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

    // Enforce zero external network requests while rendering PDF
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (
        url.startsWith(baseUrl) ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      ) {
        return route.continue();
      }
      blockedExternalRequests.push(url);
      return route.abort();
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      return document.fonts.ready;
    });
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });

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

    fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
    fs.writeFileSync(
      path.join(ROOT, '.ci-reports', 'pdf-report.json'),
      JSON.stringify(
        {
          passed: true,
          path: '/resume.pdf',
          bytes: pdfBytes.length,
          executablePath,
          blockedExternalRequests: blockedExternalRequests.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log(
      `Generated _site/resume.pdf (${(pdfBytes.length / 1024).toFixed(1)} KB) via ${executablePath}`
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
