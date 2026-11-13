import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, renderSubpageLayout, UNHASHED_ASSET_URLS } from './lib/html.mjs';
import {
  getCombinedSizeBytes,
  getFileSizeBytes,
  readJson,
  readJsonIfExists,
  resolveBuildTimestampMs,
  resolveBuildYear,
  writeJsonFile,
} from './lib/io.mjs';
import { isEntrypoint, ROOT, resolveRootPaths } from './lib/paths.mjs';
import { getSiteEndpoints } from './lib/site-config.mjs';
import { minifyHtml } from './minify-html.mjs';

function formatKb(bytes) {
  if (typeof bytes !== 'number') return 'N/A';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getSecurityExpiryDays(siteDir, securityTxtPath, referenceMs) {
  const secRel = securityTxtPath.replace(/^\/+/, '');
  const secPath = path.join(siteDir, secRel);
  if (!fs.existsSync(secPath)) return null;
  const content = fs.readFileSync(secPath, 'utf8');
  const match = content.match(/^Expires:\s*(.+)$/m);
  if (!match) return null;
  const expiresMs = Date.parse(match[1].trim());
  if (Number.isNaN(expiresMs)) return null;
  return Math.floor((expiresMs - referenceMs) / (1000 * 60 * 60 * 24));
}

function toSiteFilePath(siteDir, urlOrPath, fallbackUrl) {
  const rel = String(urlOrPath || fallbackUrl || '').replace(/^\/+/, '');
  return path.join(siteDir, rel);
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

export function evaluateQualityGates({
  lintReport = null,
  unitReport = null,
  securityReport = null,
  syncReport = null,
  pdfReport = null,
  ogReport = null,
  htmlReport = null,
  cypressReport = null,
  perfReport = null,
  lycheeExit = undefined,
  expiryDays = null,
  pdfSize = 'N/A',
  endpoints = {
    resumePdfPath: '/resume.pdf',
    resumeJsonPath: '/resume.json',
    llmsTxtPath: '/llms.txt',
    securityTxtPath: '/.well-known/security.txt',
  },
} = {}) {
  const lintStatus = lintReport ? (lintReport.passed ? 'pass' : 'fail') : 'pending';
  const unitStatus = unitReport ? (unitReport.passed ? 'pass' : 'fail') : 'pending';
  const auditStatus = securityReport ? (securityReport.passed ? 'pass' : 'fail') : 'pending';
  const codeQualityStatus = [lintStatus, unitStatus, auditStatus].includes('fail')
    ? 'fail'
    : lintStatus === 'pass' && unitStatus === 'pass' && auditStatus === 'pass'
      ? 'pass'
      : 'pending';

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
    : 'pending';
  const lycheeStatus =
    lycheeExit === 'success' ? 'pass' : lycheeExit === 'failure' ? 'fail' : 'pending';
  const secStatus = expiryDays !== null && expiryDays >= 30 ? 'pass' : 'fail';

  const syncPassedCount =
    syncReport?.passedCount ??
    (syncReport?.checks ? syncReport.checks.filter((c) => c.passed).length : 0);
  const syncTotalCount = syncReport?.totalChecks ?? syncReport?.checks?.length ?? 6;

  const cards = [
    {
      id: 'zero-third-party-network',
      title: 'Zero Third-Party Network Requests',
      status: zeroNetStatus,
      summary:
        'All CSS, fonts, images, icons, and scripts are locally bundled. Runtime network interception asserts 0 external third-party calls across pages, PDF rendering, and OG card generation.',
      metric: cypressReport?.network
        ? `${cypressReport.network.externalRequests} external calls detected (${cypressReport.network.pagesChecked} routes checked)`
        : 'Pending runtime network audit',
    },
    {
      id: 'web-vitals-budgets',
      title: 'Web Vitals & Asset Payload Budgets',
      status: perfStatus,
      summary:
        'Headless mobile emulation (390x844, 4x CPU throttle) verifying esbuild-minified CSS/JS, subsetted fonts, responsive AVIF/WebP avatar, zero 404s, and Web Vitals thresholds.',
      metric: perfReport
        ? `Transfer ${(perfReport.mobileVitals.totalTransferBytes / 1024).toFixed(1)} KB · FCP ${perfReport.mobileVitals.fcpMs}ms · LCP ${perfReport.mobileVitals.lcpMs}ms · CLS ${perfReport.mobileVitals.cls}`
        : 'Pending performance budget audit',
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
        'Automated axe-core audits executed across both Light and Dark themes on Desktop (1280x800) and Mobile (375x667) viewports plus interactive dialogs.',
      metric: cypressReport?.a11y
        ? `${cypressReport.a11y.checksRun} viewport/theme audits — ${cypressReport.a11y.violations} violations`
        : 'Pending Cypress axe-core audit run',
    },
    {
      id: 'e2e-suite',
      title: 'E2E Verification Suite (Cypress)',
      status: cypressStatus,
      summary:
        'Full browser verification covering content, lazy cross-page command menu, clipboard actions, theme persistence, resume.pdf binary payload, security.txt expiry, and parity.',
      metric: cypressReport
        ? `${cypressReport.totalPassed}/${cypressReport.totalTests} tests passed (${cypressReport.totalFailed} failed)`
        : 'Pending Cypress execution',
    },
    {
      id: 'lint-unit-security',
      title: 'Static Lint, Unit Tests & Dependency Audit',
      status: codeQualityStatus,
      summary:
        'Biome code formatting & lint rules across JS/CSS/JSON, Node.js built-in unit tests for generators & HTTP path safety, and npm audit dependency checks.',
      metric:
        lintReport && unitReport && securityReport
          ? `Biome lint: ${lintStatus} · Unit tests: ${unitStatus} · npm audit: ${auditStatus}`
          : 'Pending npm run lint, test:unit & test:security',
    },
    {
      id: 'pdf-og-rendering',
      title: 'Print PDF & Social Card Pipeline',
      status:
        pdfStatus === 'pass' && ogStatus === 'pass'
          ? 'pass'
          : pdfStatus === 'fail' || ogStatus === 'fail'
            ? 'fail'
            : 'pending',
      summary:
        'Headless Chromium print rendering enforcing single-page A4 layout bounds alongside automated 1200x630 Open Graph card generation.',
      metric:
        pdfReport && ogReport
          ? `${endpoints.resumePdfPath}: ${pdfReport.pages}/${pdfReport.maxPages} page (${pdfSize}) · og-card.png: ${formatKb(ogReport.bytes)}`
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
      status:
        syncStatus === 'pass' && secStatus === 'pass'
          ? 'pass'
          : syncStatus === 'fail' || secStatus === 'fail'
            ? 'fail'
            : 'pending',
      summary: `Automated parity across ${endpoints.resumeJsonPath}, DOM, Schema.org JSON-LD, ${endpoints.llmsTxtPath}, webmanifest, sitemap, and 404, plus RFC 9116 ${endpoints.securityTxtPath} freshness.`,
      metric: `Sync: ${syncPassedCount}/${syncTotalCount} checks passed · security.txt expires in ${expiryDays ?? '?'} days (min 30d)`,
    },
  ];

  const hasFail = cards.some((c) => c.status === 'fail');
  const hasPending = cards.some((c) => c.status === 'pending');
  const overallStatus = hasFail ? 'fail' : hasPending ? 'pending' : 'pass';
  return { cards, overallStatus };
}

export function buildQualityPage({
  rootDir = ROOT,
  siteDir = null,
  reportsDir = null,
  resume: resumeArg = null,
} = {}) {
  const paths = resolveRootPaths(rootDir);
  const resolvedSiteDir = siteDir || paths.siteDir;
  const resolvedReportsDir = reportsDir || paths.reportsDir;
  const resume = resumeArg || readJson(paths.resumePath);
  const endpoints = getSiteEndpoints(resume);
  const ownerName = resume.basics.name;
  const buildTimestampMs = resolveBuildTimestampMs(rootDir);
  const currentYear = resolveBuildYear(resume, rootDir);
  const generatedAt = new Date(buildTimestampMs).toISOString();

  const lintReport = readJsonIfExists(path.join(resolvedReportsDir, 'lint-report.json'));
  const unitReport = readJsonIfExists(path.join(resolvedReportsDir, 'unit-report.json'));
  const securityReport = readJsonIfExists(path.join(resolvedReportsDir, 'security-report.json'));
  const syncReport = readJsonIfExists(path.join(resolvedReportsDir, 'sync-validation.json'));
  const pdfReport = readJsonIfExists(path.join(resolvedReportsDir, 'pdf-report.json'));
  const ogReport = readJsonIfExists(path.join(resolvedReportsDir, 'og-report.json'));
  const htmlReport = readJsonIfExists(path.join(resolvedReportsDir, 'html-validate.json'));
  const cypressReport = readJsonIfExists(path.join(resolvedReportsDir, 'cypress-results.json'));
  const perfReport = readJsonIfExists(path.join(resolvedReportsDir, 'perf-report.json'));
  const assetManifest = readJsonIfExists(path.join(resolvedReportsDir, 'asset-manifest.json'));
  const lycheeExit = process.env.LYCHEE_STATUS;

  const cssBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, assetManifest?.cssUrl, UNHASHED_ASSET_URLS.cssUrl)
  );
  const subpageCssBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, assetManifest?.subpageCssUrl, UNHASHED_ASSET_URLS.subpageCssUrl)
  );
  const printCssBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, assetManifest?.printCssUrl, UNHASHED_ASSET_URLS.printCssUrl)
  );
  const initialJsBytes = getCombinedSizeBytes([
    toSiteFilePath(
      resolvedSiteDir,
      assetManifest?.themeInitJsUrl,
      UNHASHED_ASSET_URLS.themeInitJsUrl
    ),
    toSiteFilePath(resolvedSiteDir, assetManifest?.themeJsUrl, UNHASHED_ASSET_URLS.themeJsUrl),
    toSiteFilePath(
      resolvedSiteDir,
      assetManifest?.commandMenuJsUrl,
      UNHASHED_ASSET_URLS.commandMenuJsUrl
    ),
  ]);
  const commandMenuPanelJsBytes = getFileSizeBytes(
    toSiteFilePath(
      resolvedSiteDir,
      assetManifest?.commandMenuPanelJsUrl,
      UNHASHED_ASSET_URLS.commandMenuPanelJsUrl
    )
  );
  const fontsBytes = getCombinedSizeBytes([
    toSiteFilePath(resolvedSiteDir, assetManifest?.monoFontUrl, UNHASHED_ASSET_URLS.monoFontUrl),
    toSiteFilePath(resolvedSiteDir, assetManifest?.pixelFontUrl, UNHASHED_ASSET_URLS.pixelFontUrl),
  ]);
  const pdfBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, endpoints.resumePdfPath, '/resume.pdf')
  );
  const indexBytes = getFileSizeBytes(path.join(resolvedSiteDir, 'index.html'));
  const ogCardBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, endpoints.ogImagePath, '/assets/og-card.png')
  );
  const contactVcfBytes = getFileSizeBytes(
    toSiteFilePath(resolvedSiteDir, endpoints.contactVcfPath, '/contact.vcf')
  );
  const expiryDays = getSecurityExpiryDays(
    resolvedSiteDir,
    endpoints.securityTxtPath,
    buildTimestampMs
  );

  const cssSize = formatKb(cssBytes);
  const fontSize = formatKb(fontsBytes);
  const pdfSize = formatKb(pdfBytes);
  const indexSize = formatKb(indexBytes);

  const { cards, overallStatus } = evaluateQualityGates({
    lintReport,
    unitReport,
    securityReport,
    syncReport,
    pdfReport,
    ogReport,
    htmlReport,
    cypressReport,
    perfReport,
    lycheeExit,
    expiryDays,
    pdfSize,
    endpoints,
  });

  const commitSha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
  const branchRef = process.env.GITHUB_REF_NAME || 'workspace';
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

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
      initialJsBytes,
      commandMenuPanelJsBytes,
      fontsBytes,
      indexHtmlBytes: indexBytes,
      resumePdfBytes: pdfBytes,
      resumePdfPages: pdfReport?.pages ?? null,
      ogCardBytes,
      contactVcfBytes,
    },
    gates: cards,
    endpoints: [
      endpoints.resumePdfPath,
      endpoints.resumeJsonPath,
      endpoints.llmsTxtPath,
      endpoints.contactVcfPath,
      endpoints.ogImagePath,
      endpoints.architecturePath,
      endpoints.qualityPath,
      endpoints.qualityJsonPath,
      endpoints.securityTxtPath,
      endpoints.sitemapPath,
      '/robots.txt',
    ],
  };

  const pdfStatus = pdfReport?.passed ? 'pass' : pdfReport ? 'fail' : 'pending';
  const pdfMetaNote = pdfReport
    ? `${pdfReport.pages} page, ${pdfSize}, ${pdfStatus.toUpperCase()}`
    : pdfStatus.toUpperCase();

  const mainHtml = `            <section class="cv-section">
                <h1 class="cv-name">Quality &amp; Verification Report</h1>
                <p class="summary-copy">
                    Every build of <strong>${escapeHtml(endpoints.domain)}</strong> runs through an automated zero-third-party verification pipeline before deployment. Below is the telemetry generated from this deployment artifact.
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
                        <li><a href="${escapeHtml(endpoints.resumePdfPath)}">${escapeHtml(endpoints.resumePdfPath)}</a> &mdash; Automated headless Chromium PDF build (${escapeHtml(pdfMetaNote)})</li>
                        <li><a href="${escapeHtml(endpoints.resumeJsonPath)}">${escapeHtml(endpoints.resumeJsonPath)}</a> &mdash; Standardized JSON Resume source of truth</li>
                        <li><a href="${escapeHtml(endpoints.llmsTxtPath)}">${escapeHtml(endpoints.llmsTxtPath)}</a> &mdash; LLM-friendly markdown profile generated from resume.json</li>
                        <li><a href="${escapeHtml(endpoints.contactVcfPath)}">${escapeHtml(endpoints.contactVcfPath)}</a> &mdash; Downloadable vCard contact generated from resume.json</li>
                        <li><a href="${escapeHtml(endpoints.ogImagePath)}">${escapeHtml(endpoints.ogImagePath)}</a> &mdash; Automated 1200x630 Open Graph preview card</li>
                        <li><a href="${escapeHtml(endpoints.architecturePath)}">${escapeHtml(endpoints.architecturePath)}</a> &mdash; High-level build &amp; verification pipeline overview</li>
                        <li><a href="${escapeHtml(endpoints.qualityJsonPath)}">${escapeHtml(endpoints.qualityJsonPath)}</a> &mdash; Machine-readable CI telemetry JSON</li>
                        <li><a href="${escapeHtml(endpoints.securityTxtPath)}">${escapeHtml(endpoints.securityTxtPath)}</a> &mdash; RFC 9116 vulnerability disclosure policy</li>
                        <li><a href="${escapeHtml(endpoints.sitemapPath)}">${escapeHtml(endpoints.sitemapPath)}</a> &amp; <a href="/robots.txt">/robots.txt</a> &mdash; Search crawler directives</li>
                    </ul>
                </div>
            </section>

            <section class="cv-section">
                <h2 class="section-title">build provenance</h2>
                <div class="panel-card endpoint-list">
                    <p><strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
                    <p><strong>Ref / Commit:</strong> ${escapeHtml(branchRef)} (${escapeHtml(commitSha)})</p>${runUrl ? `\n                    <p><strong>CI Run:</strong> <a href="${escapeHtml(runUrl)}" target="_blank" rel="noopener noreferrer">GitHub Actions Execution Log</a></p>` : ''}
                </div>
            </section>`;

  const html = renderSubpageLayout({
    title: `Quality & Verification Report - ${ownerName}`,
    description: `Automated CI/CD quality, accessibility, performance, and security verification report for ${endpoints.domain}.`,
    canonicalUrl: endpoints.qualityReportUrl,
    extraHeadLinks: [
      `<link rel="alternate" type="application/json" href="${escapeHtml(endpoints.qualityJsonPath)}" title="Quality Telemetry JSON">`,
    ],
    ownerName,
    subtitleHtml:
      '<p class="entry-sub">Self-Verifying Engineering Showcase &amp; Quality Report</p>',
    navLinks: [
      { href: '/', label: 'Portfolio' },
      { href: endpoints.architecturePath, label: 'Architecture' },
    ],
    mainHtml,
    footerLinks: [
      { href: '/', label: 'Return to Portfolio' },
      { href: endpoints.architecturePath, label: 'Architecture' },
      { href: endpoints.qualityJsonPath, label: 'Telemetry JSON' },
      { href: endpoints.resumeJsonPath, label: 'JSON Resume' },
      { href: endpoints.llmsTxtPath, label: 'llms.txt' },
    ],
    copyrightYear: currentYear,
    assetManifest,
  });

  const outDir = path.join(
    resolvedSiteDir,
    endpoints.qualityPath.replace(/^\/+|\/+$/g, '') || 'quality'
  );
  const outFile = path.join(outDir, 'index.html');
  const outJsonFile = path.join(resolvedSiteDir, endpoints.qualityJsonPath.replace(/^\/+/, ''));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, minifyHtml(html), 'utf8');
  writeJsonFile(outJsonFile, reportPayload);
  console.log(
    `Generated ${path.relative(rootDir, outFile)} & ${path.relative(rootDir, outJsonFile)}`
  );
}

if (isEntrypoint(import.meta.url)) {
  buildQualityPage();
}
