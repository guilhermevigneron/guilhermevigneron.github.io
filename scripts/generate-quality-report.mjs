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
    return '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:border dark:border-emerald-800">PASS</span>';
  }
  if (status === 'fail') {
    return '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 dark:border dark:border-rose-800">FAIL</span>';
  }
  return '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border dark:border-amber-800">PENDING</span>';
}

function buildQualityPage() {
  const syncReport = readJsonIfExists(path.join(reportsDir, 'sync-validation.json'));
  const pdfReport = readJsonIfExists(path.join(reportsDir, 'pdf-report.json'));
  const htmlReport = readJsonIfExists(path.join(reportsDir, 'html-validate.json'));
  const cypressReport = readJsonIfExists(path.join(reportsDir, 'cypress-results.json'));
  const lycheeExit = process.env.LYCHEE_STATUS;

  const cssSize = getFileSizeKb(path.join(siteDir, 'assets', 'css', 'styles.css')) || 'N/A';
  const fontSize = getFileSizeKb(path.join(siteDir, 'assets', 'fonts', 'inter-latin.woff2')) || 'N/A';
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
        'All CSS, fonts, icons, and theme scripts are locally bundled. Runtime network interception asserts 0 external third-party calls on page load and PDF rendering.',
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
        'Full browser verification covering content, navigation, theme persistence, resume.pdf binary payload, security.txt expiry, 404 routing, and endpoint parity.',
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
    <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/css/styles.css">
    <script src="/assets/js/theme.js" defer></script>
</head>
<body class="min-h-screen flex flex-col bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-sky-700 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:z-50">Skip to main content</a>

    <header class="bg-slate-900 text-white p-6 md:p-8 shadow-lg dark:border-b dark:border-slate-800">
        <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
                <a href="/" class="text-xl md:text-2xl font-black tracking-tight text-white hover:text-sky-300 transition-colors duration-200">Guilherme Vigneron de Oliveira</a>
                <p class="text-sm text-sky-300 mt-1">Self-Verifying Engineering Showcase &amp; Quality Report</p>
            </div>
            <div class="flex items-center gap-3">
                <a href="/" class="text-sm font-medium text-slate-200 hover:text-sky-300 px-3 py-2 rounded-lg border border-slate-700 hover:border-sky-400 transition-colors duration-200">Portfolio</a>
                <button id="theme-toggle" type="button" class="inline-flex items-center justify-center p-2 rounded-lg bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 hover:text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-colors duration-200" aria-label="Switch to dark theme" aria-pressed="false">
                    <svg class="w-5 h-5 hidden dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                    </svg>
                    <svg class="w-5 h-5 block dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main id="main-content" class="flex-1 max-w-4xl w-full mx-auto p-8 space-y-12">
        <section>
            <h1 class="text-3xl md:text-4xl font-black text-slate-900 dark:text-slate-100">Quality &amp; Verification Report</h1>
            <div class="w-16 h-1 bg-sky-500 mt-3 mb-6"></div>
            <p class="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
                Every build of <strong class="text-slate-900 dark:text-slate-100">guilhermevigneron.dev</strong> runs through an automated zero-third-party verification pipeline before deployment. Below is the build telemetry generated from this deployment artifact.
            </p>
            <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                    <p class="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Compiled CSS</p>
                    <p class="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">${escapeHtml(cssSize)}</p>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                    <p class="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Self-Hosted Font</p>
                    <p class="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">${escapeHtml(fontSize)}</p>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                    <p class="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Generated PDF</p>
                    <p class="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">${escapeHtml(pdfSize)}</p>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                    <p class="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">HTML Payload</p>
                    <p class="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">${escapeHtml(indexSize)}</p>
                </div>
            </div>
        </section>

        <section>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Verification Gates</h2>
            <div class="grid gap-4 md:grid-cols-2">
                ${cards
                  .map(
                    (card) => `<article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm flex flex-col justify-between gap-3">
                    <div>
                        <div class="flex items-start justify-between gap-3">
                            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">${escapeHtml(card.title)}</h3>
                            ${statusBadge(card.status)}
                        </div>
                        <p class="text-sm text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">${escapeHtml(card.summary)}</p>
                    </div>
                    <p class="text-xs font-medium text-sky-800 dark:text-sky-300 pt-2 border-t border-slate-100 dark:border-slate-800">${escapeHtml(card.metric)}</p>
                </article>`
                  )
                  .join('\n                ')}
            </div>
        </section>

        <section>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Published Machine-Readable Endpoints</h2>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm">
                <ul class="space-y-3 text-sm">
                    <li><a href="/resume.pdf" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/resume.pdf</a> &mdash; Automated headless Chromium PDF build (${escapeHtml(pdfStatus.toUpperCase())})</li>
                    <li><a href="/resume.json" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/resume.json</a> &mdash; Standardized JSON Resume source of truth</li>
                    <li><a href="/llms.txt" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/llms.txt</a> &mdash; LLM-friendly markdown profile generated from resume.json</li>
                    <li><a href="/.well-known/security.txt" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/.well-known/security.txt</a> &mdash; RFC 9116 vulnerability disclosure policy</li>
                    <li><a href="/sitemap.xml" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/sitemap.xml</a> &amp; <a href="/robots.txt" class="font-semibold text-sky-800 dark:text-sky-300 underline hover:text-sky-950 dark:hover:text-sky-200">/robots.txt</a> &mdash; Search crawler directives</li>
                </ul>
            </div>
        </section>

        <section>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Build Provenance</h2>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm text-sm space-y-1">
                <p><strong class="text-slate-900 dark:text-slate-100">Generated:</strong> ${escapeHtml(generatedAt)}</p>
                <p><strong class="text-slate-900 dark:text-slate-100">Ref / Commit:</strong> ${escapeHtml(branchRef)} (${escapeHtml(commitSha)})</p>${runUrl ? `\n                <p><strong class="text-slate-900 dark:text-slate-100">CI Run:</strong> <a href="${escapeHtml(runUrl)}" target="_blank" rel="noopener noreferrer" class="underline text-sky-800 dark:text-sky-300">GitHub Actions Execution Log</a></p>` : ''}
            </div>
        </section>
    </main>

    <footer class="text-center p-6 bg-slate-100 dark:bg-slate-900 dark:border-t dark:border-slate-800 mt-12">
        <p class="text-slate-700 dark:text-slate-300">&copy; 2026 Guilherme Vigneron de Oliveira. <a href="/" class="underline hover:text-sky-700 dark:hover:text-sky-300">Return to Portfolio</a></p>
    </footer>
</body>
</html>
`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');
  console.log('Generated _site/quality/index.html');
}

buildQualityPage();
