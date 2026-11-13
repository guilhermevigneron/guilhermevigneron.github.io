import fs from 'node:fs';
import path from 'node:path';
import { minifyHtml } from './minify-html.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');
const outDir = path.join(siteDir, 'quality');
const outFile = path.join(outDir, 'index.html');
const outJsonFile = path.join(outDir, 'report.json');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getFileSizeBytes(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).size;
}

function formatKb(bytes) {
  if (typeof bytes !== 'number') return 'N/A';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getCombinedFontsSizeBytes(paths) {
  let totalBytes = 0;
  let foundAny = false;
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      totalBytes += fs.statSync(filePath).size;
      foundAny = true;
    }
  }
  return foundAny ? totalBytes : null;
}

function getSecurityExpiryDays() {
  const secPath = path.join(siteDir, '.well-known', 'security.txt');
  if (!fs.existsSync(secPath)) return null;
  const content = fs.readFileSync(secPath, 'utf8');
  const match = content.match(/^Expires:\s*(.+)$/m);
  if (!match) return null;
  const expiresMs = Date.parse(match[1].trim());
  if (Number.isNaN(expiresMs)) return null;
  return Math.floor((expiresMs - Date.now()) / (1000 * 60 * 60 * 24));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  if (status === 'pass') {
    return '<span class="status-badge status-badge--pass">PASS</span>';
  }
  if (status === 'fail') {
    return '<span class="status-badge status-badge--fail">FAIL</span>';
  }
  return '<span class="status-badge status-badge--pending">PENDING</span>';
}

function buildQualityPage() {
  const resume = readJsonIfExists(path.join(ROOT, 'resume.json'));
  const ownerName = resume?.basics?.name || 'Guilherme Vigneron de Oliveira';
  const currentYear = new Date().getUTCFullYear();

  const syncReport = readJsonIfExists(path.join(reportsDir, 'sync-validation.json'));
  const pdfReport = readJsonIfExists(path.join(reportsDir, 'pdf-report.json'));
  const ogReport = readJsonIfExists(path.join(reportsDir, 'og-report.json'));
  const htmlReport = readJsonIfExists(path.join(reportsDir, 'html-validate.json'));
  const cypressReport = readJsonIfExists(path.join(reportsDir, 'cypress-results.json'));
  const perfReport = readJsonIfExists(path.join(reportsDir, 'perf-report.json'));
  const lycheeExit = process.env.LYCHEE_STATUS;

  const assetManifest = readJsonIfExists(path.join(reportsDir, 'asset-manifest.json'));
  const cssUrl = assetManifest?.cssUrl || '/assets/css/styles.css';
  const subpageCssUrl = assetManifest?.subpageCssUrl || '/assets/css/subpage.css';
  const monoFontUrl = assetManifest?.monoFontUrl || '/assets/fonts/GeistMono-Variable.woff2';
  const pixelFontUrl = assetManifest?.pixelFontUrl || '/assets/fonts/GeistPixel-Square.woff2';
  const themeInitJsUrl = assetManifest?.themeInitJsUrl || '/assets/js/theme-init.js';
  const themeJsUrl = assetManifest?.themeJsUrl || '/assets/js/theme.js';
  const commandMenuJsUrl = assetManifest?.commandMenuJsUrl || '/assets/js/command-menu.js';
  const faviconSvgUrl = assetManifest?.faviconSvgUrl || '/assets/favicon.svg';
  const appleTouchIconUrl = assetManifest?.appleTouchIconUrl || '/assets/apple-touch-icon.png';

  const cssBytes = getFileSizeBytes(path.join(siteDir, 'assets', 'css', 'styles.css'));
  const subpageCssBytes = getFileSizeBytes(path.join(siteDir, 'assets', 'css', 'subpage.css'));
  const printCssBytes = getFileSizeBytes(path.join(siteDir, 'assets', 'css', 'print.css'));
  const fontsBytes = getCombinedFontsSizeBytes([
    path.join(siteDir, 'assets', 'fonts', 'GeistMono-Variable.woff2'),
    path.join(siteDir, 'assets', 'fonts', 'GeistPixel-Square.woff2'),
  ]);
  const pdfBytes = getFileSizeBytes(path.join(siteDir, 'resume.pdf'));
  const indexBytes = getFileSizeBytes(path.join(siteDir, 'index.html'));
  const ogCardBytes = getFileSizeBytes(path.join(siteDir, 'assets', 'og-card.png'));
  const contactVcfBytes = getFileSizeBytes(path.join(siteDir, 'contact.vcf'));
  const expiryDays = getSecurityExpiryDays();

  const cssSize = formatKb(cssBytes);
  const fontSize = formatKb(fontsBytes);
  const pdfSize = formatKb(pdfBytes);
  const indexSize = formatKb(indexBytes);

  const syncStatus = syncReport?.passed ? 'pass' : syncReport ? 'fail' : 'pending';
  const pdfStatus = pdfReport?.passed ? 'pass' : pdfReport ? 'fail' : 'pending';
  const ogStatus = ogReport?.passed ? 'pass' : ogReport ? 'fail' : 'pending';
  const htmlStatus = htmlReport ? (htmlReport.valid ? 'pass' : 'fail') : 'pending';
  const cypressStatus = cypressReport
    ? cypressReport.totalTests > 0 && cypressReport.totalFailed === 0
      ? 'pass'
      : 'fail'
    : 'pending';
  const axeStatus = cypressReport?.a11y
    ? cypressReport.a11y.violations === 0 && cypressReport.a11y.checksRun >= 16
      ? 'pass'
      : 'fail'
    : 'pending';
  const mobileStatus = cypressReport?.mobile
    ? cypressReport.mobile.failures === 0 &&
      cypressReport.mobile.checksRun >= 6 &&
      (!perfReport || perfReport.passed)
      ? 'pass'
      : 'fail'
    : perfReport
      ? perfReport.passed
        ? 'pass'
        : 'fail'
      : 'pending';
  const perfStatus = perfReport ? (perfReport.passed ? 'pass' : 'fail') : 'pending';
  const zeroNetStatus = cypressReport?.network
    ? cypressReport.network.pagesChecked >= 4 &&
      cypressReport.network.externalRequests === 0 &&
      pdfReport?.blockedExternalRequests === 0 &&
      ogReport?.blockedExternalRequests === 0
      ? 'pass'
      : 'fail'
    : (pdfReport && pdfReport.blockedExternalRequests > 0) ||
        (ogReport && ogReport.blockedExternalRequests > 0)
      ? 'fail'
      : 'pending';
  const lycheeStatus =
    lycheeExit === 'success' ? 'pass' : lycheeExit === 'failure' ? 'fail' : 'pending';
  const secStatus =
    typeof expiryDays === 'number' && expiryDays >= 30
      ? 'pass'
      : typeof expiryDays === 'number'
        ? 'fail'
        : 'pending';

  const syncPassedCount = Array.isArray(syncReport?.checks)
    ? syncReport.checks.filter((c) => c.passed).length
    : 0;
  const syncTotalCount = Array.isArray(syncReport?.checks) ? syncReport.checks.length : 0;

  const generatedAt = new Date().toISOString();
  const commitSha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
  const branchRef = process.env.GITHUB_REF_NAME || 'workspace';
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const cards = [
    {
      id: 'zero-third-party-network',
      title: 'Zero Third-Party Network Requests',
      status: zeroNetStatus,
      summary:
        'All CSS, fonts, images, icons, and scripts are locally bundled. Runtime network interception asserts 0 external third-party calls across pages, PDF rendering, and OG card generation.',
      metric:
        cypressReport?.network && cypressReport.network.pagesChecked > 0
          ? `${cypressReport.network.externalRequests} external calls detected (${cypressReport.network.pagesChecked} routes checked)`
          : pdfReport && ogReport
            ? `PDF & OG renderers: ${pdfReport.blockedExternalRequests + ogReport.blockedExternalRequests} blocked external calls (run Cypress for runtime route verification)`
            : 'Pending PDF, OG & Cypress runtime network verification',
    },
    {
      id: 'web-vitals-budgets',
      title: 'Web Vitals & Asset Payload Budgets',
      status: perfStatus,
      summary:
        'Headless mobile emulation (390x844, 4x CPU throttle) verifying esbuild-minified CSS/JS, subsetted fonts, responsive AVIF/WebP avatar, zero 404s, and Web Vitals thresholds.',
      metric: perfReport?.mobileVitals
        ? `Transfer ${(perfReport.mobileVitals.totalTransferBytes / 1024).toFixed(1)} KB · FCP ${perfReport.mobileVitals.fcpMs}ms · LCP ${perfReport.mobileVitals.lcpMs}ms · CLS ${perfReport.mobileVitals.cls}`
        : 'Pending npm run test:perf execution',
    },
    {
      id: 'mobile-compatibility',
      title: 'Mobile Compatibility & Touch Ergonomics',
      status: mobileStatus,
      summary:
        'Multi-viewport verification (320px to 768px) asserting zero horizontal overflow, >=44x44px mobile touch targets, non-zooming search input, and mobile command palette.',
      metric: cypressReport?.mobile
        ? `${cypressReport.mobile.checksRun} mobile layout checks (${cypressReport.mobile.failures} failures)`
        : perfReport
          ? `${perfReport.overflowChecksCount} viewport overflow checks completed`
          : 'Pending mobile viewport suite',
    },
    {
      id: 'html5-validation',
      title: 'HTML5 Standards Validation',
      status: htmlStatus,
      summary:
        'Offline W3C-aligned semantic and syntactic checks across all built HTML artifacts using html-validate.',
      metric: htmlReport
        ? `${htmlReport.fileCount} HTML files validated — ${htmlReport.errorCount} errors, ${htmlReport.warningCount} warnings`
        : 'Pending html-validate execution',
    },
    {
      id: 'wcag-accessibility',
      title: 'WCAG 2.1 AA Accessibility (cypress-axe)',
      status: axeStatus,
      summary:
        'Automated axe-core audits executed across both Light and Dark themes on Desktop (1280x800) and Mobile (375x667) viewports for home, 404, and Quality pages.',
      metric: cypressReport?.a11y
        ? `${cypressReport.a11y.checksRun} viewport/theme audits — ${cypressReport.a11y.violations} violations`
        : 'Pending Cypress axe-core audit run',
    },
    {
      id: 'e2e-suite',
      title: 'E2E Verification Suite (Cypress)',
      status: cypressStatus,
      summary:
        'Full browser verification covering content, cross-page command menu, clipboard actions, theme persistence, resume.pdf binary payload, security.txt expiry, and parity.',
      metric: cypressReport
        ? `${cypressReport.totalPassed}/${cypressReport.totalTests} tests passed (${cypressReport.totalFailed} failed)`
        : 'Pending Cypress execution',
    },
    {
      id: 'pdf-og-rendering',
      title: 'Print PDF & Social Card Pipeline',
      status: pdfStatus === 'pass' && ogStatus === 'pass' ? 'pass' : pdfStatus === 'fail' || ogStatus === 'fail' ? 'fail' : 'pending',
      summary:
        'Headless Chromium print rendering enforcing single-page A4 layout bounds alongside automated 1200x630 Open Graph card generation.',
      metric:
        pdfReport && ogReport
          ? `/resume.pdf: ${pdfReport.pages}/${pdfReport.maxPages} page (${pdfSize}) · og-card.png: ${formatKb(ogReport.bytes)}`
          : 'Pending PDF & Open Graph artifact generation',
    },
    {
      id: 'link-integrity',
      title: 'Link Integrity (Lychee)',
      status: lycheeStatus,
      summary:
        'Automated link crawler verifying internal routes, static assets, and external publication/profile links without broken targets.',
      metric:
        lycheeStatus === 'pass'
          ? 'All internal and external links resolved cleanly'
          : lycheeStatus === 'fail'
            ? 'Broken links detected in CI run'
            : 'Checked via lychee-action in CI & weekly production cron',
    },
    {
      id: 'source-parity-security',
      title: 'Single Source of Truth & Security Policy',
      status: syncStatus === 'pass' && secStatus === 'pass' ? 'pass' : syncStatus === 'fail' || secStatus === 'fail' ? 'fail' : 'pending',
      summary:
        'Automated parity across /resume.json, DOM, Schema.org JSON-LD, /llms.txt, webmanifest, sitemap, and 404, plus RFC 9116 /.well-known/security.txt freshness.',
      metric: `Sync: ${syncPassedCount}/${syncTotalCount} checks passed · security.txt expires in ${expiryDays ?? '?'} days (min 30d)`,
    },
  ];

  const hasFail = cards.some((c) => c.status === 'fail');
  const hasPending = cards.some((c) => c.status === 'pending');
  const overallStatus = hasFail ? 'fail' : hasPending ? 'pending' : 'pass';

  const reportPayload = {
    schemaVersion: 1,
    generatedAt,
    overallStatus,
    provenance: {
      ref: branchRef,
      commit: commitSha,
      runUrl,
    },
    artifacts: {
      cssBytes,
      subpageCssBytes,
      printCssBytes,
      fontsBytes,
      indexHtmlBytes: indexBytes,
      resumePdfBytes: pdfBytes,
      resumePdfPages: pdfReport?.pages ?? null,
      ogCardBytes,
      contactVcfBytes,
    },
    gates: cards,
    endpoints: [
      '/resume.pdf',
      '/resume.json',
      '/llms.txt',
      '/contact.vcf',
      '/assets/og-card.png',
      '/quality/',
      '/quality/report.json',
      '/.well-known/security.txt',
      '/sitemap.xml',
      '/robots.txt',
    ],
  };

  const pdfMetaNote = pdfReport
    ? `${pdfReport.pages} page, ${pdfSize}, ${pdfStatus.toUpperCase()}`
    : pdfStatus.toUpperCase();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Quality &amp; Verification Report - ${escapeHtml(ownerName)}</title>
    <meta name="description" content="Automated CI/CD quality, accessibility, performance, and security verification report for guilhermevigneron.dev.">
    <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0d0c0a" media="(prefers-color-scheme: dark)">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(faviconSvgUrl)}">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="${escapeHtml(appleTouchIconUrl)}">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="canonical" href="https://guilhermevigneron.dev/quality/">
    <link rel="alternate" type="application/json" href="/quality/report.json" title="Quality Telemetry JSON">
    <script src="${escapeHtml(themeInitJsUrl)}"></script>
    <link rel="stylesheet" href="${escapeHtml(cssUrl)}">
    <link rel="stylesheet" href="${escapeHtml(subpageCssUrl)}">
    <link rel="preload" href="${escapeHtml(monoFontUrl)}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="${escapeHtml(pixelFontUrl)}" as="font" type="font/woff2" crossorigin>
    <script src="${escapeHtml(themeJsUrl)}" defer></script>
    <script src="${escapeHtml(commandMenuJsUrl)}" defer></script>
</head>
<body class="subpage-body">
    <a href="#main-content" class="sr-only skip-link">Skip to main content</a>

    <main id="main-content" class="subpage-main">
        <div class="cv-shell">
            <header class="subpage-nav">
                <div>
                    <a href="/" class="subpage-brand">${escapeHtml(ownerName)}</a>
                    <p class="entry-sub">Self-Verifying Engineering Showcase &amp; Quality Report</p>
                </div>
                <div class="subpage-nav-actions">
                    <a href="/" class="ghost-link">Portfolio</a>
                    <button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false" title="Switch to dark theme">
                        <svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="4"></circle>
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                        </svg>
                        <svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </button>
                    <button id="command-trigger-mobile" type="button" class="icon-btn mobile-only-btn" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false" title="Open command menu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.3-4.3"></path>
                        </svg>
                    </button>
                </div>
            </header>

            <section class="cv-section">
                <h1 class="cv-name">Quality &amp; Verification Report</h1>
                <p class="summary-copy">
                    Every build of <strong>guilhermevigneron.dev</strong> runs through an automated zero-third-party verification pipeline before deployment. Below is the telemetry generated from this deployment artifact.
                </p>
                <div class="metric-grid">
                    <div class="panel-card">
                        <p class="metric-label">compiled css</p>
                        <p class="metric-value">${escapeHtml(cssSize)}</p>
                    </div>
                    <div class="panel-card">
                        <p class="metric-label">self-hosted fonts</p>
                        <p class="metric-value">${escapeHtml(fontSize)}</p>
                    </div>
                    <div class="panel-card">
                        <p class="metric-label">generated pdf</p>
                        <p class="metric-value">${escapeHtml(pdfSize)}</p>
                    </div>
                    <div class="panel-card">
                        <p class="metric-label">html payload</p>
                        <p class="metric-value">${escapeHtml(indexSize)}</p>
                    </div>
                </div>
            </section>

            <section class="cv-section">
                <h2 class="section-title">verification gates</h2>
                <div class="gate-grid">
                    ${cards
                      .map(
                        (card) => `<article class="gate-card">
                        <div>
                            <div class="gate-head">
                                <h3 class="gate-title">${escapeHtml(card.title)}</h3>
                                ${statusBadge(card.status)}
                            </div>
                            <p class="gate-summary">${escapeHtml(card.summary)}</p>
                        </div>
                        <p class="gate-metric">${escapeHtml(card.metric)}</p>
                    </article>`
                      )
                      .join('\n                    ')}
                </div>
            </section>

            <section class="cv-section">
                <h2 class="section-title">published machine-readable endpoints</h2>
                <div class="panel-card">
                    <ul class="endpoint-list">
                        <li><a href="/resume.pdf">/resume.pdf</a> &mdash; Automated headless Chromium PDF build (${escapeHtml(pdfMetaNote)})</li>
                        <li><a href="/resume.json">/resume.json</a> &mdash; Standardized JSON Resume source of truth</li>
                        <li><a href="/llms.txt">/llms.txt</a> &mdash; LLM-friendly markdown profile generated from resume.json</li>
                        <li><a href="/contact.vcf">/contact.vcf</a> &mdash; Downloadable vCard contact generated from resume.json</li>
                        <li><a href="/assets/og-card.png">/assets/og-card.png</a> &mdash; Automated 1200x630 Open Graph preview card</li>
                        <li><a href="/quality/report.json">/quality/report.json</a> &mdash; Machine-readable CI telemetry JSON</li>
                        <li><a href="/.well-known/security.txt">/.well-known/security.txt</a> &mdash; RFC 9116 vulnerability disclosure policy</li>
                        <li><a href="/sitemap.xml">/sitemap.xml</a> &amp; <a href="/robots.txt">/robots.txt</a> &mdash; Search crawler directives</li>
                    </ul>
                </div>
            </section>

            <section class="cv-section">
                <h2 class="section-title">build provenance</h2>
                <div class="panel-card endpoint-list">
                    <p><strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
                    <p><strong>Ref / Commit:</strong> ${escapeHtml(branchRef)} (${escapeHtml(commitSha)})</p>${runUrl ? `\n                    <p><strong>CI Run:</strong> <a href="${escapeHtml(runUrl)}" target="_blank" rel="noopener noreferrer">GitHub Actions Execution Log</a></p>` : ''}
                </div>
            </section>
        </div>
    </main>

    <footer class="cv-footer-wrap">
        <div class="cv-footer-inner">
            <span>&copy; ${escapeHtml(String(currentYear))} ${escapeHtml(ownerName)}</span>
            <div class="cv-footer-links">
                <a href="/">Return to Portfolio</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/architecture/">Architecture</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/quality/report.json">Telemetry JSON</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/resume.json">JSON Resume</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/llms.txt">llms.txt</a>
            </div>
        </div>
        <div class="command-bar">
            <button type="button" id="command-trigger" class="command-trigger" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                <span>Press</span>
                <kbd class="kbd-chip"><span id="command-modifier">Ctrl</span>+J</kbd>
                <span>to open the command menu</span>
            </button>
        </div>
    </footer>
</body>
</html>
`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, minifyHtml(html), 'utf8');
  fs.writeFileSync(outJsonFile, JSON.stringify(reportPayload, null, 2) + '\n', 'utf8');
  console.log('Generated _site/quality/index.html & _site/quality/report.json');
}

buildQualityPage();
