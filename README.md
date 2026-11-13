# Guilherme Vigneron - Portfolio & Resume

![CI](https://github.com/guilhermevigneron/guilhermevigneron.github.io/actions/workflows/ci.yml/badge.svg)

This repository contains the source code for my personal portfolio and resume website (**[guilhermevigneron.dev](https://guilhermevigneron.dev)**). It is engineered as a **zero-third-party-dependency, self-verifying static showcase** driven by a single `resume.json` source of truth, a pure Node + `esbuild` build pipeline, automated headless-Chromium resume PDF & Open Graph card generation, and a live CI quality dashboard.

---

## Architecture & Key Capabilities

### 1. Zero Third-Party Runtime Dependencies, Security & Performance
- **Minimalist CV Aesthetic:** Monochrome warm off-white light mode (`#fafaf8`) and automatic/toggleable dark mode (`#0d0c0a`), print-first A4 typography, Selected Projects (`guilhermevigneron.dev` itself as a web-only project via `.no-print`), and a cross-page command palette (`Ctrl+J` / `⌘+J` on desktop, touch search trigger on mobile via `assets/js/command-menu.js`).
- **Visitor & Recruiter Ergonomics:** Command palette supports clipboard actions (`Copy Email Address`, `Copy Profile URL`, `Copy Markdown Resume`) with accessible live-region toast feedback, downloadable `/contact.vcf` vCard generation, and section jump navigation.
- **esbuild-Minified & Fingerprinted Asset Pipeline:** Minified screen ([src/styles.css](src/styles.css)), subpage ([src/subpage.css](src/subpage.css)), print ([src/print.css](src/print.css)), and JS bundles via [scripts/minify-assets.mjs](scripts/minify-assets.mjs) (`esbuild`) with SHA-256 fingerprinting across CSS, JS, fonts, icons, and avatar images (`scripts/build.mjs`), plus HTML minification ([scripts/minify-html.mjs](scripts/minify-html.mjs)).
- **Self-Hosted Subsetted Typography & Responsive Avatar:** Latin-subsetted `Geist Mono` (`400..500`) and `Geist Pixel Square` with metric-matched fallbacks (`CLS = 0`), responsive `<picture>` AVIF/WebP/JPEG avatar variants, and self-hosted SVG/PNG/ICO favicons + `site.webmanifest` — zero external requests.
- **Strict CSP & Referrer Policy:** Enforces `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `form-action 'none'` — zero `'unsafe-inline'` or `'unsafe-eval'`) and `strict-origin-when-cross-origin` referrer policy across `/`, `/404.html`, and `/quality/`, with zero inline executable `<script>` tags.
- **Inline Accessible SVGs:** All social and UI icons are explicitly sized inline `<svg>` elements (`aria-hidden="true"`, `focusable="false"`), eliminating Font Awesome CDN requests.
- **Light/Dark Theme & Print Layout:** External no-FOUC initialization (`assets/js/theme-init.js`) and zero-dependency toggle (`assets/js/theme.js`) respecting `prefers-color-scheme` and syncing mobile `<meta name="theme-color">` with `localStorage` persistence, paired with `@media print` rules in [src/print.css](src/print.css) for clean single-page A4 printing.

### 2. Single Source of Truth & Machine-Readable Endpoints
- **`/resume.json`:** Standardized JSON Resume source driving automated synchronization ([scripts/sync-resume.mjs](scripts/sync-resume.mjs)) for `<title>`, Open Graph/Twitter meta tags, Schema.org `Person` JSON-LD, rendered CV sections, footer copyright year, `404.html` metadata, `/llms.txt` (exposed via `<link rel="alternate">` discovery tags), `/site.webmanifest`, and `/sitemap.xml`, verified by [scripts/validate-sync.mjs](scripts/validate-sync.mjs).
- **`/contact.vcf`:** Standards-compliant vCard 3.0 generated directly from `/resume.json` at build time.
- **`/.well-known/security.txt`:** RFC 9116 compliant vulnerability disclosure policy with automated CI expiry checks (fails if fewer than 30 days remain).
- **`/404.html` & `/sitemap.xml`:** Branded 404 recovery page and sitemap indexing `/`, `/resume.pdf`, `/resume.json`, `/llms.txt`, `/contact.vcf`, `/quality/`, and `/quality/report.json`, matching `robots.txt`.

### 3. Automated `/resume.pdf` & Open Graph Card Pipelines
- **`scripts/generate-pdf.mjs`:** Serves the built `_site/` output via the local static server (`scripts/serve.mjs`) and uses headless Chromium via `playwright-core` (blocking any external requests) to generate a crisp, self-hosted `/resume.pdf` and enforce the single-page regression gate (`maxPdfPages: 1`).
- **`scripts/generate-og-card.mjs`:** Renders a zero-external-network 1200×630 PNG preview card (`/assets/og-card.png`) from `resume.json` and locally bundled fonts/avatar on every build.

### 4. Continuous Verification, `/quality/` & Dependabot
- **`npm run test:security`:** Fails if `npm audit --audit-level=high` detects vulnerabilities.
- **`npm run test:html`:** Runs offline HTML5 validation (`html-validate`) across every generated HTML artifact (`index.html`, `404.html`, `quality/index.html`).
- **`npm run test:perf`:** Runs headless mobile emulation ([scripts/check-performance.mjs](scripts/check-performance.mjs)) enforcing asset byte budgets (`<= 12 KB` screen CSS, `<= 75 KB` initial mobile transfer), Web Vitals (`FCP`, `LCP`, `CLS`), zero 404s/console errors, and zero horizontal overflow across `320px–768px` viewports.
- **`lychee-action`, Production Smoke Tests & `.github/dependabot.yml`:** Crawls internal assets and external links during CI and runs weekly on `schedule` (`cron`) + `workflow_dispatch` against `https://guilhermevigneron.dev` alongside `npm run test:smoke:prod` (verifying live endpoints, strict CSP/referrer tags, `/resume.pdf`, `/contact.vcf`, `/assets/og-card.png`, `/quality/report.json`, and `security.txt`), with weekly Dependabot PRs for `npm` and SHA-pinned GitHub Actions.
- **Cypress + `cypress-axe` (`npm run test:e2e`):** Verifies zero external third-party network requests, strict CSP & referrer enforcement with zero `securitypolicyviolation` events (serving `axe-core` from a same-origin test route in `cypress/support/e2e.js` without `eval()`), explicit SVG dimensions, `rel="noopener noreferrer"` on external links, mobile compatibility (`>=44px` touch targets, `320px–768px` layout, cross-page mobile command palette), `/resume.pdf` single-page binary validity, `/assets/og-card.png`, `/contact.vcf`, `/quality/report.json`, `security.txt` freshness, `resume.json` parity, clipboard toast actions, theme persistence, and 12-audit WCAG 2.1 AA compliance across Light & Dark themes on Mobile and Desktop viewports (plus the open command dialog).
- **`/quality/` & `/quality/report.json`:** Publishes both the human-readable verification report (rebuilt and re-verified in CI after all checks complete) and machine-readable CI telemetry JSON via [scripts/generate-quality-report.mjs](scripts/generate-quality-report.mjs).
- **Hardened CI/CD Workflow (`.github/workflows/ci.yml`):** Pins all GitHub Actions to commit SHAs, disables persisted checkout credentials (`persist-credentials: false`), and enforces least-privilege `permissions` (`contents: read` at workflow level; `pages: write` and `id-token: write` scoped to the `deploy` job).

---

## Local Development

Requires Node.js 22+ and a local Chrome/Chromium installation (used by `playwright-core` and Cypress).

```bash
npm ci
npm run verify         # Lint, unit tests, security audit, build, HTML validation, Cypress+axe E2E, Playwright perf, quality report
```

Individual tasks:

```bash
npm run lint           # Run Biome linter across JS, CSS, JSON, and SVG/HTML
npm run test:unit      # Run Node built-in unit tests (tests/unit.test.mjs)
npm run test:security  # Run npm audit (--audit-level=moderate)
npm run sync           # Synchronize resume.json -> index.html, 404.html, llms.txt, manifest, sitemap
npm run build          # Sync, validate, minify & fingerprint assets, build PDF, OG card & quality report
npm run test:html      # Validate built HTML5 documents
npm run test:perf      # Run Playwright mobile Web Vitals & byte budget audit
npm run test:e2e       # Start static server & run Cypress + mobile + axe suite
npm run build:quality  # Refresh /quality/ and /quality/report.json with local test telemetry
npm run serve          # Serve _site/ locally at http://127.0.0.1:4000
```
