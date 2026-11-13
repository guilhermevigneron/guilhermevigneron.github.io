import fs from 'node:fs';
import path from 'node:path';
import { minifyHtml } from './minify-html.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');
const outDir = path.join(siteDir, 'architecture');
const outFile = path.join(outDir, 'index.html');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildArchitecturePage() {
  const resume = readJsonIfExists(path.join(ROOT, 'resume.json'));
  const ownerName = resume?.basics?.name || 'Guilherme Vigneron de Oliveira';
  const currentYear = new Date().getUTCFullYear();

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

  const arrowSvg =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>';

  const pillars = [
    {
      title: '1. Edit Once, Sync Everywhere',
      summary:
        'Instead of updating a website, a PDF resume, and metadata separately, everything starts in one structured resume.json file. Every build automatically keeps them in sync.',
      detail: 'Single source of truth · zero copy-paste drift',
    },
    {
      title: '2. Zero Third-Party Dependencies',
      summary:
        'All fonts, icons, styles, and scripts are self-hosted and bundled locally. There are no external trackers, ad networks, cookies, or third-party CDNs.',
      detail: 'Strict default-src "self" CSP · instant loads',
    },
    {
      title: '3. Automated PDF & Social Previews',
      summary:
        'On every build, a headless browser prints the page to a clean, single-page A4 resume (/resume.pdf) and renders a 1200x630 social preview card.',
      detail: 'Always-fresh PDF · 1-page layout gate',
    },
    {
      title: '4. Built-In Quality Gates',
      summary:
        'Before anything goes live, automated checks verify HTML5 validity, mobile speed budgets, 12-audit WCAG 2.1 AA accessibility, and zero broken links.',
      detail: 'Live results published to /quality/',
    },
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Architecture Overview - ${escapeHtml(ownerName)}</title>
    <meta name="description" content="High-level visual architecture of guilhermevigneron.dev: how a single resume.json source builds and verifies the site, PDF, and quality report.">
    <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0d0c0a" media="(prefers-color-scheme: dark)">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(faviconSvgUrl)}">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="${escapeHtml(appleTouchIconUrl)}">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="canonical" href="https://guilhermevigneron.dev/architecture/">
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
                    <p class="entry-sub">How guilhermevigneron.dev Works</p>
                </div>
                <div class="subpage-nav-actions">
                    <a href="/" class="ghost-link">Portfolio</a>
                    <a href="/quality/" class="ghost-link">Quality Report</a>
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
                <h1 class="cv-name">Architecture Overview</h1>
                <p class="summary-copy">
                    <strong>guilhermevigneron.dev</strong> is a personal portfolio and resume built like a production software product. Instead of maintaining separate web pages, PDFs, and profile files by hand, a single data file drives an automated pipeline that builds, tests, and verifies every output before publishing.
                </p>
            </section>

            <section class="cv-section" aria-labelledby="pipeline-heading">
                <h2 id="pipeline-heading" class="section-title">high-level pipeline</h2>
                <div class="arch-flow">
                    <div class="arch-stage arch-stage--source">
                        <p class="arch-step">01 · single source</p>
                        <h3 class="arch-title">resume.json</h3>
                        <p class="arch-desc">One structured file holds all career history, projects, skills, and contact details.</p>
                        <div class="arch-items">
                            <div class="arch-chip">Experience &amp; Skills</div>
                            <div class="arch-chip">Projects &amp; Awards</div>
                            <div class="arch-chip">Contact &amp; Metadata</div>
                        </div>
                    </div>

                    <div class="arch-arrow" aria-hidden="true">${arrowSvg}</div>

                    <div class="arch-stage">
                        <p class="arch-step">02 · automated build</p>
                        <h3 class="arch-title">Generate Outputs</h3>
                        <p class="arch-desc">Node.js scripts and headless Chromium compile every human and machine format.</p>
                        <div class="arch-items">
                            <div class="arch-chip">Website <span>(/)</span></div>
                            <div class="arch-chip">A4 PDF <span>(/resume.pdf)</span></div>
                            <div class="arch-chip">Contact <span>(/contact.vcf)</span></div>
                            <div class="arch-chip">AI &amp; Search <span>(/llms.txt, JSON-LD)</span></div>
                        </div>
                    </div>

                    <div class="arch-arrow" aria-hidden="true">${arrowSvg}</div>

                    <div class="arch-stage">
                        <p class="arch-step">03 · quality gates</p>
                        <h3 class="arch-title">Verify &amp; Deploy</h3>
                        <p class="arch-desc">Automated checks must pass before GitHub Actions publishes the site.</p>
                        <div class="arch-items">
                            <div class="arch-chip">Accessibility <span>(WCAG 2.1 AA)</span></div>
                            <div class="arch-chip">Mobile Speed <span>(Web Vitals)</span></div>
                            <div class="arch-chip">Security <span>(Strict CSP)</span></div>
                            <div class="arch-chip">Live Report <span>(/quality/)</span></div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="cv-section" aria-labelledby="pillars-heading">
                <h2 id="pillars-heading" class="section-title">how it works</h2>
                <div class="gate-grid">
                    ${pillars
                      .map(
                        (pillar) => `<article class="gate-card">
                        <div>
                            <h3 class="gate-title">${escapeHtml(pillar.title)}</h3>
                            <p class="gate-summary">${escapeHtml(pillar.summary)}</p>
                        </div>
                        <p class="gate-metric">${escapeHtml(pillar.detail)}</p>
                    </article>`
                      )
                      .join('\n                    ')}
                </div>
            </section>

            <section class="cv-section" aria-labelledby="explore-heading">
                <h2 id="explore-heading" class="section-title">explore further</h2>
                <div class="panel-card">
                    <ul class="endpoint-list">
                        <li><a href="/">Portfolio &amp; Resume (/)</a> &mdash; Main CV view generated from resume.json</li>
                        <li><a href="/quality/">Live Quality Report (/quality/)</a> &mdash; Real-time test, accessibility, and payload telemetry from the latest build</li>
                        <li><a href="/resume.pdf">/resume.pdf</a> &mdash; Single-page A4 resume rendered by headless Chromium</li>
                        <li><a href="/resume.json">/resume.json</a> &mdash; The single source-of-truth JSON Resume file</li>
                        <li><a href="https://github.com/guilhermevigneron/guilhermevigneron.github.io" target="_blank" rel="noopener noreferrer">Source Code on GitHub</a> &mdash; Full build scripts, tests, and CI/CD workflow</li>
                    </ul>
                </div>
            </section>
        </div>
    </main>

    <footer class="cv-footer-wrap">
        <div class="cv-footer-inner">
            <span>&copy; ${currentYear} ${escapeHtml(ownerName)}</span>
            <div class="cv-footer-links">
                <a href="/">Portfolio</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/quality/">Quality Report</a>
                <span aria-hidden="true">&middot;</span>
                <a href="/resume.json">JSON Resume</a>
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
  console.log(`Generated ${path.relative(ROOT, outFile)}`);
}

buildArchitecturePage();
