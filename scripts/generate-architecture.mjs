import fs from 'node:fs';
import path from 'node:path';
import {
  escapeHtml,
  getAssetUrls,
  readJsonIfExists,
  renderSubpageDocument,
} from './lib/chrome.mjs';
import { minifyHtml } from './minify-html.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');
const outDir = path.join(siteDir, 'architecture');
const outFile = path.join(outDir, 'index.html');

function buildArchitecturePage() {
  const resume = readJsonIfExists(path.join(ROOT, 'resume.json'));
  const ownerName = resume?.basics?.name || 'Guilherme Vigneron de Oliveira';
  const siteUrl = String(resume?.basics?.url || 'https://guilhermevigneron.dev').replace(
    /\/$/,
    ''
  );
  const domain = siteUrl.replace(/^https?:\/\//, '');
  const repoUrl =
    resume?.projects?.find((p) => String(p.url || '').includes('github.com'))?.url ||
    'https://github.com/guilhermevigneron/guilhermevigneron.github.io';
  const currentYear = new Date().getUTCFullYear();
  const assetUrls = getAssetUrls(reportsDir, true);

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
      detail: 'Strict default-src "self" CSP · lazy command menu',
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
        'Before anything goes live, automated checks verify Biome lint, unit tests, dependency audit, HTML5 validity, mobile speed budgets, WCAG 2.1 AA accessibility, and zero broken links.',
      detail: 'Live results published to /quality/',
    },
  ];

  const mainSectionsHtml = `            <section class="cv-section">
                <h1 class="cv-name">Architecture Overview</h1>
                <p class="summary-copy">
                    <strong>${escapeHtml(domain)}</strong> is a personal portfolio and resume built like a production software product. Instead of maintaining separate web pages, PDFs, and profile files by hand, a single data file drives an automated pipeline that builds, tests, and verifies every output before publishing.
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
                        <li><a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">Source Code on GitHub</a> &mdash; Full build scripts, tests, and CI/CD workflow</li>
                    </ul>
                </div>
            </section>`;

  const html = renderSubpageDocument({
    title: `Architecture Overview - ${ownerName}`,
    description: `High-level visual architecture of ${domain}: how a single resume.json source builds and verifies the site, PDF, and quality report.`,
    canonicalUrl: `${siteUrl}/architecture/`,
    ogImageUrl: `${siteUrl}${assetUrls.ogCardUrl}`,
    ogImageAlt: resume?.meta?.ogImageAlt || `Architecture Overview - ${ownerName}`,
    ownerName,
    subtitleHtml: `<p class="entry-sub">How ${escapeHtml(domain)} Works</p>`,
    navLinks: [
      { href: '/', label: 'Portfolio' },
      { href: '/quality/', label: 'Quality Report' },
    ],
    mainSectionsHtml,
    footerLinks: [
      { href: '/', label: 'Portfolio' },
      { href: '/quality/', label: 'Quality Report' },
      { href: '/resume.json', label: 'JSON Resume' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
    copyrightHtml: `<span>&copy; ${escapeHtml(String(currentYear))} ${escapeHtml(ownerName)}</span>`,
    assetUrls,
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, minifyHtml(html), 'utf8');
  console.log(`Generated ${path.relative(ROOT, outFile)}`);
}

buildArchitecturePage();
