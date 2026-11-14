import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startStaticServer, stopStaticServer } from './lib/browser.mjs';
import { validatePdfBuffer } from './lib/pdf.mjs';

const ROOT = process.cwd();
const DEFAULT_BASE_URL = 'https://guilhermevigneron.dev';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 3;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'guilhermevigneron-dev-smoke/1.0';

function parseBaseUrl(rawValue, fallbackUrl = DEFAULT_BASE_URL) {
  const normalized = String(rawValue || fallbackUrl)
    .trim()
    .replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid SMOKE_BASE_URL: "${rawValue}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Unsupported SMOKE_BASE_URL protocol "${parsed.protocol}" (expected https: or http:)`
    );
  }
  return {
    baseUrl: normalized,
    origin: parsed.origin,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  const base = 400 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchOnceWithSafeRedirects(initialUrl, targetOrigin, options = {}) {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, {
      ...options,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        ...options.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) {
        throw new Error(
          `Redirect HTTP ${response.status} without Location header at ${currentUrl}`
        );
      }
      const fromParsed = new URL(currentUrl);
      const nextParsed = new URL(location, fromParsed);
      if (fromParsed.protocol === 'https:' && nextParsed.protocol !== 'https:') {
        throw new Error(`Unsafe HTTPS -> ${nextParsed.protocol} redirect to ${nextParsed.href}`);
      }
      if (nextParsed.origin !== targetOrigin) {
        throw new Error(`Unexpected off-origin redirect from ${currentUrl} to ${nextParsed.href}`);
      }
      currentUrl = nextParsed.href;
      continue;
    }

    return response;
  }

  throw new Error(`Exceeded maximum redirect hops (${MAX_REDIRECTS}) for ${initialUrl}`);
}

function createSmokeClient(baseUrl, targetOrigin) {
  async function fetchWithRetry(endpointPath, expectedStatus = 200) {
    const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    const url = `${baseUrl}${normalizedPath}`;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchOnceWithSafeRedirects(url, targetOrigin);
        if (response.status === 429 || response.status >= 500) {
          if (attempt < MAX_RETRY_ATTEMPTS) {
            const delayMs = parseRetryDelayMs(response, attempt);
            await response.body?.cancel().catch(() => {});
            await sleep(delayMs);
            continue;
          }
        }
        if (response.status !== expectedStatus) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`Expected HTTP ${expectedStatus} for ${url}, got ${response.status}`);
        }
        return response;
      } catch (err) {
        lastError = err;
        const statusMismatch =
          typeof err?.message === 'string' && err.message.startsWith('Expected HTTP ');
        const unsafeRedirect =
          typeof err?.message === 'string' &&
          (err.message.includes('redirect') || err.message.includes('Redirect'));
        if (attempt === MAX_RETRY_ATTEMPTS || statusMismatch || unsafeRedirect) {
          throw lastError;
        }
        await sleep(parseRetryDelayMs(null, attempt));
      }
    }

    throw lastError;
  }

  async function fetchCheckedAsset(endpointPath, expectedContentType, minBytes = 1) {
    const res = await fetchWithRetry(endpointPath, 200);
    const contentType = res.headers.get('content-type') || '';
    if (expectedContentType) {
      const expected = Array.isArray(expectedContentType)
        ? expectedContentType
        : [expectedContentType];
      assert.ok(
        expected.some((type) => contentType.toLowerCase().includes(type)),
        `Unexpected content-type for ${endpointPath}: "${contentType}" (expected "${expected.join(' | ')}")`
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(
      buf.length >= minBytes,
      `Asset ${endpointPath} too small: ${buf.length} B (min ${minBytes} B)`
    );
    return { res, buf, contentType };
  }

  return { fetchWithRetry, fetchCheckedAsset };
}

function readAttr(attrString, name) {
  const match = attrString.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function assertStrictCsp(html, label) {
  let csp = null;
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    if (readAttr(match[1], 'http-equiv')?.toLowerCase() === 'content-security-policy') {
      csp = readAttr(match[1], 'content');
      break;
    }
  }
  assert.ok(csp, `${label} missing Content-Security-Policy meta tag`);
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ]) {
    assert.ok(csp.includes(directive), `${label} CSP missing directive "${directive}"`);
  }
  assert.ok(!csp.includes("'unsafe-inline'"), `${label} CSP must not allow 'unsafe-inline'`);
  assert.ok(!csp.includes("'unsafe-eval'"), `${label} CSP must not allow 'unsafe-eval'`);
}

function extractAssetRefs(html) {
  const stylesheets = [];
  const fontPreloads = [];
  const iconHrefs = [];

  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = match[1];
    const rel = (readAttr(attrs, 'rel') || '').toLowerCase().split(/\s+/);
    const href = readAttr(attrs, 'href');
    if (!href) continue;
    if (rel.includes('stylesheet')) stylesheets.push(href);
    if (rel.includes('preload') && readAttr(attrs, 'as')?.toLowerCase() === 'font') {
      fontPreloads.push(href);
    }
    if (rel.includes('icon') || rel.includes('apple-touch-icon')) {
      iconHrefs.push(href);
    }
  }

  const scripts = [...html.matchAll(/<script\b([^>]+)>/gi)]
    .map((m) => readAttr(m[1], 'src'))
    .filter(Boolean);

  const srcsetUrls = [];
  for (const match of html.matchAll(/<(?:source|img)\b([^>]+)>/gi)) {
    const srcset = readAttr(match[1], 'srcset');
    if (!srcset) continue;
    for (const part of srcset.split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) srcsetUrls.push(url);
    }
  }
  const imgSrcs = [...html.matchAll(/<img\b([^>]+)>/gi)]
    .map((m) => readAttr(m[1], 'src'))
    .filter(Boolean);

  return {
    stylesheets: [...new Set(stylesheets)],
    scripts: [...new Set(scripts)],
    fonts: [...new Set(fontPreloads)],
    images: [...new Set([...srcsetUrls, ...imgSrcs])],
    icons: [...new Set(iconHrefs)],
  };
}

function contentTypeForAsset(assetPath) {
  if (assetPath.endsWith('.css')) return 'text/css';
  if (assetPath.endsWith('.js')) return 'javascript';
  if (assetPath.endsWith('.woff2')) return 'font/woff2';
  if (assetPath.endsWith('.avif')) return 'image/avif';
  if (assetPath.endsWith('.webp')) return 'image/webp';
  if (assetPath.endsWith('.jpg') || assetPath.endsWith('.jpeg')) return 'image/jpeg';
  if (assetPath.endsWith('.png')) return 'image/png';
  if (assetPath.endsWith('.svg')) return 'image/svg';
  if (assetPath.endsWith('.ico')) return 'image/';
  return '';
}

function readPngDimensions(pngBuf) {
  assert.ok(
    pngBuf.length >= 24 && pngBuf.toString('ascii', 12, 16) === 'IHDR',
    'OG card missing PNG IHDR chunk'
  );
  return {
    width: pngBuf.readUInt32BE(16),
    height: pngBuf.readUInt32BE(20),
  };
}

async function verifySubpageHtml(client, route, labels) {
  const res = await client.fetchWithRetry(route, 200);
  const ct = res.headers.get('content-type') || '';
  assert.ok(ct.includes('text/html'), `${route} unexpected content-type: ${ct}`);
  const html = await res.text();
  const expectedLabels = Array.isArray(labels) ? labels : [labels];
  assert.ok(
    expectedLabels.some((label) => html.includes(label)),
    `${route} missing expected content "${expectedLabels[0]}"`
  );
  assertStrictCsp(html, route);

  const refs = extractAssetRefs(html);
  const stylesMatch = refs.stylesheets.find((u) =>
    /^\/assets\/css\/styles(?:\.[a-f0-9]+)?\.css$/.test(u)
  );
  const subpageMatch = refs.stylesheets.find((u) =>
    /^\/assets\/css\/subpage(?:\.[a-f0-9]+)?\.css$/.test(u)
  );
  const printMatch = refs.stylesheets.find((u) =>
    /^\/assets\/css\/print(?:\.[a-f0-9]+)?\.css$/.test(u)
  );
  const cmdMatch = refs.scripts.find((u) =>
    /^\/assets\/js\/command-menu(?:\.[a-f0-9]+)?\.js$/.test(u)
  );
  assert.ok(stylesMatch, `${route} missing compiled styles stylesheet link`);
  assert.ok(subpageMatch, `${route} missing compiled subpage stylesheet link`);
  assert.ok(printMatch, `${route} missing compiled print stylesheet link`);
  assert.ok(cmdMatch, `${route} missing command-menu loader script`);
  assert.ok(
    refs.scripts.length >= 3,
    `${route} expected theme-init, theme, and command-menu scripts`
  );

  for (const url of [...refs.stylesheets, ...refs.scripts]) {
    await client.fetchCheckedAsset(url, contentTypeForAsset(url), 100);
  }
}

export async function runSmokeTests({
  baseUrl,
  allowLocalPending = process.env.SMOKE_ALLOW_LOCAL_PENDING === '1',
  rootDir = ROOT,
} = {}) {
  const resume = JSON.parse(fs.readFileSync(path.join(rootDir, 'resume.json'), 'utf8'));
  const canonicalUrl = String(
    resume.meta?.canonical || resume.basics?.url || DEFAULT_BASE_URL
  ).replace(/\/+$/, '');
  const ownerName = resume.basics.name;
  const maxPdfPages = Number(resume.meta?.maxPdfPages || 1);
  const { baseUrl: targetBaseUrl, origin: targetOrigin } = parseBaseUrl(
    baseUrl || process.env.SMOKE_BASE_URL,
    canonicalUrl
  );
  const client = createSmokeClient(targetBaseUrl, targetOrigin);
  const { fetchWithRetry, fetchCheckedAsset } = client;

  console.log(`Running smoke tests against ${targetBaseUrl}...`);
  const failures = [];
  const allowPending = allowLocalPending || process.env.SMOKE_ALLOW_PENDING === '1';

  const runCheck = async (name, fn) => {
    try {
      await fn();
    } catch (err) {
      failures.push(`[${name}] ${err.message}`);
      console.error(`FAIL [${name}]: ${err.message}`);
    }
  };

  let homeHtml = '';

  await runCheck('homepage', async () => {
    const homeRes = await fetchWithRetry('/', 200);
    const homeType = homeRes.headers.get('content-type') || '';
    assert.ok(homeType.includes('text/html'), `Unexpected homepage content-type: ${homeType}`);
    homeHtml = await homeRes.text();

    assert.ok(homeHtml.includes(ownerName), 'Homepage missing owner name');
    assert.ok(homeHtml.includes('Selected Projects'), 'Homepage missing Selected Projects section');
    assert.ok(homeHtml.includes('href="/resume.pdf"'), 'Homepage missing /resume.pdf link');
    assert.ok(homeHtml.includes('href="/quality/"'), 'Homepage missing /quality/ link');
    assert.ok(homeHtml.includes('href="/architecture/"'), 'Homepage missing /architecture/ link');
    assert.ok(homeHtml.includes('assets/og-card'), 'Homepage missing og-card meta tag');
    assertStrictCsp(homeHtml, '/');
    assert.ok(homeHtml.includes('name="referrer"'), 'Homepage missing referrer policy meta tag');

    for (const banned of [
      'cdn.tailwindcss.com',
      'cdnjs.cloudflare.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'drive.google.com',
    ]) {
      assert.ok(
        !homeHtml.includes(banned),
        `Homepage still references third-party host: ${banned}`
      );
    }
    console.log(
      'PASS / (200, strict CSP, Selected Projects, OG card, zero third-party references)'
    );
  });

  await runCheck('homepage-referenced-assets', async () => {
    assert.ok(homeHtml, 'Skipping referenced asset checks because / failed to load');
    const refs = extractAssetRefs(homeHtml);
    const activeCssUrl = refs.stylesheets.find((u) =>
      /^\/assets\/css\/styles(?:\.[a-f0-9]+)?\.css$/.test(u)
    );
    const activePrintUrl = refs.stylesheets.find((u) =>
      /^\/assets\/css\/print(?:\.[a-f0-9]+)?\.css$/.test(u)
    );
    const cmdLoaderUrl = refs.scripts.find((u) =>
      /^\/assets\/js\/command-menu(?:\.[a-f0-9]+)?\.js$/.test(u)
    );
    assert.ok(activeCssUrl, 'Homepage missing compiled screen stylesheet link');
    assert.ok(activePrintUrl, 'Homepage missing compiled print stylesheet link');
    assert.ok(cmdLoaderUrl, 'Homepage missing command-menu loader script');
    assert.ok(refs.scripts.length >= 3, 'Homepage missing expected bundled scripts');
    assert.ok(refs.fonts.length >= 2, 'Homepage missing font preload links');
    assert.ok(refs.images.length >= 7, 'Homepage missing responsive avatar sources');

    const { buf: activeCssBuf } = await fetchCheckedAsset(activeCssUrl, 'text/css', 1000);
    const activeCssText = activeCssBuf.toString('utf8');
    assert.ok(activeCssText.includes('.icon-btn svg'), 'Active CSS missing .icon-btn svg rule');

    const { buf: cmdLoaderBuf } = await fetchCheckedAsset(cmdLoaderUrl, 'javascript', 200);
    const cmdLoaderJs = cmdLoaderBuf.toString('utf8');
    const cmdPanelMatch = cmdLoaderJs.match(/\/assets\/js\/command-menu-panel(?:\.[a-f0-9]+)?\.js/);
    assert.ok(cmdPanelMatch, 'command-menu loader missing command-menu-panel reference');
    const { buf: cmdPanelBuf } = await fetchCheckedAsset(cmdPanelMatch[0], 'javascript', 1000);
    const cmdPanelJs = cmdPanelBuf.toString('utf8');
    assert.ok(cmdPanelJs.includes('initCommandMenuPanel'), 'command-menu-panel missing export');

    const cssFontUrls = [
      ...activeCssText.matchAll(/url\((['"]?)(\/assets\/fonts\/[^)'"\s]+)\1\)/g),
    ].map((m) => m[2]);
    assert.ok(cssFontUrls.length >= 2, 'Active CSS missing @font-face woff2 references');

    const allAssetUrls = new Set([
      ...refs.stylesheets,
      ...refs.scripts,
      ...refs.fonts,
      ...refs.images,
      ...refs.icons,
      ...cssFontUrls,
      '/assets/css/styles.css',
      '/assets/css/subpage.css',
      '/assets/css/print.css',
      '/assets/fonts/GeistMono-Variable.woff2',
      '/assets/fonts/GeistPixel-Square.woff2',
      '/assets/avatar.jpg',
      '/assets/avatar-224.avif',
      '/assets/favicon.svg',
      '/favicon.ico',
    ]);

    for (const assetUrl of allAssetUrls) {
      assert.ok(assetUrl.startsWith('/'), `Non-local asset URL referenced: ${assetUrl}`);
      const minSize = assetUrl.endsWith('.woff2') ? 2000 : assetUrl.endsWith('.avif') ? 500 : 100;
      await fetchCheckedAsset(assetUrl, contentTypeForAsset(assetUrl), minSize);
    }

    console.log(
      `PASS ${activeCssUrl}, ${cmdPanelMatch[0]} & ${allAssetUrls.size} referenced/canonical static assets`
    );
  });

  await runCheck('manifest-and-og-card', async () => {
    const { buf: manifestBuf } = await fetchCheckedAsset('/site.webmanifest', 'json', 100);
    const manifest = JSON.parse(manifestBuf.toString('utf8'));
    assert.equal(manifest.short_name, resume.meta?.shortName || ownerName);
    assert.equal(manifest.description, resume.meta?.manifestDescription || resume.basics.label);
    assert.ok(
      Array.isArray(manifest.icons) && manifest.icons.length >= 3,
      'site.webmanifest missing icons'
    );
    for (const icon of manifest.icons) {
      assert.ok(icon.src?.startsWith('/'), `Manifest icon must be local path: ${icon.src}`);
      await fetchCheckedAsset(icon.src, contentTypeForAsset(icon.src), 100);
    }

    const { buf: ogBuf } = await fetchCheckedAsset('/assets/og-card.png', 'image/png', 5000);
    assert.ok(
      ogBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'Invalid PNG signature for /assets/og-card.png'
    );
    const { width, height } = readPngDimensions(ogBuf);
    assert.equal(width, 1200, `Expected OG card width 1200, got ${width}`);
    assert.equal(height, 630, `Expected OG card height 630, got ${height}`);
    console.log(
      `PASS site.webmanifest (${manifest.icons.length} icons) & og-card.png (${width}x${height}, ${(ogBuf.length / 1024).toFixed(1)} KB)`
    );
  });

  await runCheck('resume-pdf', async () => {
    const { buf: pdfBuf } = await fetchCheckedAsset('/resume.pdf', 'application/pdf', 5000);
    const pdfMeta = validatePdfBuffer(pdfBuf, maxPdfPages);
    console.log(
      `PASS /resume.pdf (${pdfMeta.pageCount} page, tagged=${pdfMeta.isTagged}, ${(pdfBuf.length / 1024).toFixed(1)} KB)`
    );
  });

  await runCheck('machine-endpoints', async () => {
    const { buf: resumeBuf } = await fetchCheckedAsset('/resume.json', 'application/json', 500);
    const resumeJson = JSON.parse(resumeBuf.toString('utf8'));
    assert.equal(resumeJson.basics?.name, ownerName);
    assert.ok(
      Array.isArray(resumeJson.projects) && resumeJson.projects.length >= 1,
      'resume.json missing projects'
    );

    const { buf: llmsBuf } = await fetchCheckedAsset('/llms.txt', 'text/plain', 500);
    const llmsText = llmsBuf.toString('utf8');
    assert.ok(llmsText.includes('/resume.pdf'), 'llms.txt missing /resume.pdf');
    assert.ok(llmsText.includes('/contact.vcf'), 'llms.txt missing /contact.vcf');
    assert.ok(llmsText.includes('/architecture/'), 'llms.txt missing /architecture/');
    assert.ok(llmsText.includes('/quality/report.json'), 'llms.txt missing /quality/report.json');

    const { buf: vcfBuf } = await fetchCheckedAsset(
      '/contact.vcf',
      ['text/vcard', 'text/x-vcard'],
      100
    );
    const vcfText = vcfBuf.toString('utf8');
    assert.ok(vcfText.includes('BEGIN:VCARD'), 'contact.vcf missing BEGIN:VCARD');
    assert.ok(vcfText.includes(`FN:${ownerName}`), 'contact.vcf missing FN');
    assert.ok(vcfText.includes('END:VCARD'), 'contact.vcf missing END:VCARD');
  });

  await runCheck('security-txt', async () => {
    const { buf: secBuf } = await fetchCheckedAsset('/.well-known/security.txt', 'text/plain', 50);
    const secText = secBuf.toString('utf8');
    assert.ok(
      secText.includes(`Contact: mailto:${resume.basics.email}`),
      'security.txt Contact mismatch'
    );
    assert.ok(
      secText.includes(`Canonical: ${canonicalUrl}/.well-known/security.txt`),
      'security.txt Canonical mismatch'
    );
    assert.match(secText, /^Preferred-Languages:\s*en,\s*pt$/m);
    const expMatch = secText.match(/^Expires:\s*(.+)$/m);
    assert.ok(expMatch, 'security.txt missing Expires field');
    const expiresMs = Date.parse(expMatch[1].trim());
    assert.ok(
      !Number.isNaN(expiresMs),
      `security.txt invalid Expires timestamp: "${expMatch[1].trim()}"`
    );
    const daysRemaining = (expiresMs - Date.now()) / (1000 * 60 * 60 * 24);
    assert.ok(
      daysRemaining >= 30,
      `security.txt Expires is less than 30 days away (${daysRemaining.toFixed(1)} days remaining)`
    );
    console.log(`PASS /.well-known/security.txt (${Math.floor(daysRemaining)} days remaining)`);
  });

  await runCheck('quality-and-architecture-pages', async () => {
    await verifySubpageHtml(client, '/quality/', [
      'Quality &amp; Verification Report',
      'Quality & Verification Report',
    ]);
    await verifySubpageHtml(client, '/architecture/', 'Architecture Overview');

    const { buf: qualityJsonBuf } = await fetchCheckedAsset(
      '/quality/report.json',
      'application/json',
      200
    );
    const qualityJson = JSON.parse(qualityJsonBuf.toString('utf8'));
    assert.equal(qualityJson.schemaVersion, 1);
    assert.ok(
      Array.isArray(qualityJson.gates) && qualityJson.gates.length === 10,
      `quality/report.json expected 10 gates, got ${qualityJson.gates?.length}`
    );
    const failingGates = qualityJson.gates.filter((g) => g.status === 'fail');
    assert.equal(
      failingGates.length,
      0,
      `Failing gates in report.json: ${JSON.stringify(failingGates)}`
    );
    if (allowPending) {
      const unexpectedPending = qualityJson.gates.filter(
        (g) => g.status !== 'pass' && !(g.id === 'link-integrity' && g.status === 'pending')
      );
      assert.equal(
        unexpectedPending.length,
        0,
        `Unexpected non-passing gates in local smoke check: ${JSON.stringify(unexpectedPending)}`
      );
    } else {
      const pendingGates = qualityJson.gates.filter((g) => g.status !== 'pass');
      assert.equal(
        pendingGates.length,
        0,
        `Non-passing gates in production report.json: ${JSON.stringify(pendingGates)}`
      );
      assert.equal(
        qualityJson.overallStatus,
        'pass',
        `Expected quality report overallStatus === 'pass', got '${qualityJson.overallStatus}'`
      );
    }

    const { buf: sitemapBuf } = await fetchCheckedAsset('/sitemap.xml', 'xml', 100);
    const sitemapText = sitemapBuf.toString('utf8');
    assert.ok(sitemapText.includes(`${canonicalUrl}/`), 'sitemap.xml missing homepage');
    assert.ok(
      sitemapText.includes(`${canonicalUrl}/resume.pdf`),
      'sitemap.xml missing /resume.pdf'
    );
    assert.ok(
      sitemapText.includes(`${canonicalUrl}/architecture/`),
      'sitemap.xml missing /architecture/'
    );
    assert.ok(sitemapText.includes(`${canonicalUrl}/quality/`), 'sitemap.xml missing /quality/');
  });

  await runCheck('not-found-handler', async () => {
    await verifySubpageHtml(client, '/404.html', 'Page Not Found');

    for (const missingPath of [
      '/nonexistent-smoke-check-404',
      '/nonexistent-nested/deep/smoke-check',
    ]) {
      const res = await fetchWithRetry(missingPath, 404);
      const ct = res.headers.get('content-type') || '';
      assert.ok(ct.includes('text/html'), `Expected text/html 404 page, got: ${ct}`);
      const body = await res.text();
      assertStrictCsp(body, missingPath);
      assert.ok(body.includes('Page Not Found'), '404 response missing "Page Not Found" heading');
      assert.ok(body.includes('href="/"'), '404 response missing return link to /');
    }
    console.log(
      'PASS /quality/, /quality/report.json, /architecture/, /sitemap.xml, /404.html, and 404 handling'
    );
  });

  if (failures.length > 0) {
    throw new Error(
      `Smoke test failed with ${failures.length} error(s):\n - ${failures.join('\n - ')}`
    );
  }

  console.log('All smoke tests passed!');
}
async function main() {
  const useLocal = process.argv.includes('--local');
  const allowLocalPending =
    process.env.SMOKE_ALLOW_LOCAL_PENDING === '1' || process.argv.includes('--allow-local-pending');
  if (!useLocal || process.env.SMOKE_BASE_URL) {
    await runSmokeTests({
      baseUrl: process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL,
      allowLocalPending,
    });
    return;
  }

  const siteDir = path.join(ROOT, '_site');
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
    throw new Error(
      '_site/index.html not found. Run "npm run build" before "--local" smoke tests.'
    );
  }

  const { server, baseUrl } = await startStaticServer(siteDir);
  try {
    await runSmokeTests({
      baseUrl,
      allowLocalPending,
      rootDir: ROOT,
    });
  } finally {
    await stopStaticServer(server);
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
