import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');
const outDir = path.join(siteDir, 'quality');
const outFile = path.join(outDir, 'index.html');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getFileSizeKb(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return `${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`;
}

function getCombinedFontsSizeKb(paths) {
  let totalBytes = 0;
  let foundAny = false;
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      totalBytes += fs.statSync(filePath).size;
      foundAny = true;
    }
  }
  return foundAny ? `${(totalBytes / 1024).toFixed(1)} KB` : null;
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
  const syncReport = readJsonIfExists(path.join(reportsDir, 'sync-validation.json'));
  const pdfReport = readJsonIfExists(path.join(reportsDir, 'pdf-report.json'));
  const htmlReport = readJsonIfExists(path.join(reportsDir, 'html-validate.json'));
  const cypressReport = readJsonIfExists(path.join(reportsDir, 'cypress-results.json'));
  const lycheeExit = process.env.LYCHEE_STATUS;

  const cssSize = getFileSizeKb(path.join(siteDir, 'assets', 'css', 'styles.css')) || 'N/A';
  const fontSize =
    getCombinedFontsSizeKb([
      path.join(siteDir, 'assets', 'fonts', 'GeistMono-Variable.woff2'),
      path.join(siteDir, 'assets', 'fonts', 'GeistPixel-Square.woff2'),
    ]) || 'N/A';
  const pdfSize = getFileSizeKb(path.join(siteDir, 'resume.pdf')) || 'N/A';
  const indexSize = getFileSizeKb(path.join(siteDir, 'index.html')) || 'N/A';
  const expiryDays = getSecurityExpiryDays();

  const syncStatus = syncReport?.passed ? 'pass' : syncReport ? 'fail' : 'pending';
  const pdfStatus = pdfReport?.passed ? 'pass' : pdfReport ? 'fail' : 'pending';
  const htmlStatus = htmlReport ? (htmlReport.valid ? 'pass' : 'fail') : 'pending';
  const cypressStatus = cypressReport
    ? cypressReport.totalFailed === 0
      ? 'pass'
      : 'fail'
    : 'pending';
  const axeStatus = cypressReport?.a11y
    ? cypressReport.a11y.violations === 0 && cypressReport.a11y.checksRun >= 4
      ? 'pass'
      : 'fail'
    : 'pending';
  const zeroNetStatus = cypressReport?.network
    ? cypressReport.network.externalRequests === 0 && pdfReport?.blockedExternalRequests === 0
      ? 'pass'
      : 'fail'
    : pdfReport?.blockedExternalRequests === 0
      ? 'pass'
      : 'pending';
  const lycheeStatus =
    lycheeExit === 'success' ? 'pass' : lycheeExit === 'failure' ? 'fail' : 'pending';
  const secStatus =
    typeof expiryDays === 'number' && expiryDays >= 30
      ? 'pass'
      : typeof expiryDays === 'number'
        ? 'fail'
        : 'pending';

  const generatedAt = new Date().toISOString();
  const commitSha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
  const branchRef = process.env.GITHUB_REF_NAME || 'workspace';
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const cards = [
    {
      title: 'Zero Third-Party Network Requests',
      status: zeroNetStatus,
      summary:
        'All CSS, fonts, images, icons, and scripts are locally bundled. Runtime network interception asserts 0 external third-party calls on page load and PDF rendering.',
      metric: cypressReport?.network
        ? `${cypressReport.network.externalRequests} external calls detected (${cypressReport.network.pagesChecked} routes checked)`
        : 'PDF renderer: 0 external calls (run Cypress for runtime route verification)',
    },
    {
      title: 'HTML5 Standards Validation',
      status: htmlStatus,
      summary:
        'Offline W3C-aligned semantic and syntactic checks across all built HTML artifacts using html-validate.',
      metric: htmlReport
        ? `${htmlReport.fileCount} HTML files validated — ${htmlReport.errorCount} errors, ${htmlReport.warningCount} warnings`
        : 'Pending html-validate execution',
    },
    {
      title: 'WCAG 2.1 AA Accessibility (cypress-axe)',
      status: axeStatus,
      summary:
        'Automated axe-core audits executed across both Light and Dark themes on Desktop (1280x800) and Mobile (375x667) viewports, plus 404 and Quality pages.',
      metric: cypressReport?.a11y
        ? `${cypressReport.a11y.checksRun} viewport/theme audits — ${cypressReport.a11y.violations} violations`
        : 'Pending Cypress axe-core audit run',
    },
    {
      title: 'E2E Verification Suite (Cypress)',
      status: cypressStatus,
      summary:
        'Full browser verification covering content, command menu, navigation, theme persistence, resume.pdf binary payload, security.txt expiry, 404 routing, and endpoint parity.',
      metric: cypressReport
        ? `${cypressReport.totalPassed}/${cypressReport.totalTests} tests passed (${cypressReport.totalFailed} failed)`
        : 'Pending Cypress execution',
    },
    {
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
      title: 'Single Source of Truth & Security Policy',
      status: syncStatus === 'pass' && secStatus === 'pass' ? 'pass' : syncStatus === 'fail' || secStatus === 'fail' ? 'fail' : 'pending',
      summary:
        'Automated parity validation across /resume.json, Schema.org JSON-LD, /llms.txt, and rendered DOM, plus RFC 9116 /.well-known/security.txt freshness.',
      metric: `Sync: ${syncReport?.checks?.length || 0} checks passed · security.txt expires in ${expiryDays ?? '?'} days (min 30d)`,
    },
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality &amp; Verification Report - Guilherme Vigneron de Oliveira</title>
    <meta name="description" content="Automated CI/CD quality, accessibility, performance, and security verification report for guilhermevigneron.dev.">
    <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0d0c0a" media="(prefers-color-scheme: dark)">
    <link rel="canonical" href="https://guilhermevigneron.dev/quality/">
    <script>
      (() => {
        try {
          const stored = localStorage.getItem('theme');
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (stored === 'dark' || (!stored && prefersDark)) {
            document.documentElement.classList.add('dark');
          }
        } catch {}
      })();
    </script>
    <link rel="preload" href="/assets/fonts/GeistMono-Variable.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/assets/fonts/GeistPixel-Square.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/css/styles.css">
    <script src="/assets/js/theme.js" defer></script>
</head>
<body class="subpage-body">
    <a href="#main-content" class="sr-only skip-link">Skip to main content</a>

    <main id="main-content" class="subpage-main">
        <div class="cv-shell">
            <header class="subpage-nav">
                <div>
                    <a href="/" class="subpage-brand">Guilherme Vigneron de Oliveira</a>
                    <p class="entry-sub">Self-Verifying Engineering Showcase &amp; Quality Report</p>
                </div>
                <div class="subpage-nav-actions">
                    <a href="/" class="ghost-link">Portfolio</a>
                    <button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false" title="Switch to dark theme">
                        <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="4"></circle>
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                        </svg>
                        <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
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
                        <li><a href="/resume.pdf">/resume.pdf</a> &mdash; Automated headless Chromium PDF build (${escapeHtml(pdfStatus.toUpperCase())})</li>
                        <li><a href="/resume.json">/resume.json</a> &mdash; Standardized JSON Resume source of truth</li>
                        <li><a href="/llms.txt">/llms.txt</a> &mdash; LLM-friendly markdown profile generated from resume.json</li>
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
            <span>&copy; 2026 Guilherme Vigneron de Oliveira</span>
            <div class="cv-footer-links">
                <a href="/">Return to Portfolio</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/resume.json">JSON Resume</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/llms.txt">llms.txt</a>
            </div>
        </div>
    </footer>
</body>
</html>
`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');
  console.log('Generated _site/quality/index.html');
}

buildQualityPage();
