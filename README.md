# Guilherme Vigneron - Portfolio & Resume

![CI](https://github.com/guilhermevigneron/guilhermevigneron.github.io/actions/workflows/ci.yml/badge.svg)

This repository contains the source code for my personal portfolio and resume website (**[guilhermevigneron.dev](https://guilhermevigneron.dev)**). It is engineered as a **zero-third-party-dependency, self-verifying static showcase** driven by a single `resume.json` source of truth, a pure Node + `esbuild` build pipeline, automated headless-Chromium resume PDF & Open Graph card generation, and a live CI quality dashboard.

---

## Architecture & Key Capabilities

### 1. Zero Third-Party Runtime Dependencies, Security & Performance
- **Minimalist CV Aesthetic:** Monochrome warm off-white light mode (`#fafaf8`) and automatic/toggleable dark mode (`#0d0c0a`), print-first A4 typography, Selected Projects (`guilhermevigneron.dev` itself as a web-only project via `.no-print`), and CSS `::after` dot separators for tag lists.
- **Lazy Cross-Page Command Palette & Recruiter Ergonomics:** Lightweight eager loader ([assets/js/command-menu.js](assets/js/command-menu.js)) listens for `Ctrl+J` / `⌘+J` (or the mobile search trigger) and dynamically imports the ARIA combobox/listbox panel ([assets/js/command-menu-panel.js](assets/js/command-menu-panel.js)) only on demand. Supports clipboard actions (`Copy Email Address`, `Copy Profile URL`, `Copy Markdown Resume`) with accessible live-region toast feedback, downloadable `/contact.vcf` vCard, and focus-aware section jump navigation.
- **esbuild-Minified & Fingerprinted Asset Pipeline:** Minified screen ([src/styles.css](src/styles.css)), subpage ([src/subpage.css](src/subpage.css)), print ([src/print.css](src/print.css)), and JS bundles via [scripts/minify-assets.mjs](scripts/minify-assets.mjs) (`esbuild`) with SHA-256 fingerprinting across CSS, JS (including nested loader-to-panel references), fonts, icons, and avatar images (`scripts/build.mjs`), plus HTML minification ([scripts/minify-html.mjs](scripts/minify-html.mjs)).
- **Self-Hosted Subsetted Typography & Responsive Avatar:** Latin-subsetted `Geist Mono` (`400..500`) and `Geist Pixel Square` with metric-matched fallbacks (`CLS = 0`), responsive `<picture>` AVIF/WebP/JPEG avatar variants, and self-hosted SVG/PNG/ICO favicons + `site.webmanifest` — zero external requests.
- **Strict CSP & Referrer Policy:** Enforces `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `form-action 'none'` — zero `'unsafe-inline'` or `'unsafe-eval'`) and `strict-origin-when-cross-origin` referrer policy across `/`, `/404.html`, `/quality/`, and `/architecture/`, with zero inline executable `<script>` tags.
- **Inline Accessible SVGs:** All social and UI icons are explicitly sized inline `<svg>` elements (`aria-hidden="true"`, `focusable="false"`), eliminating Font Awesome CDN requests.
- **Light/Dark Theme & Print Layout:** External no-FOUC initialization (`assets/js/theme-init.js`) and zero-dependency toggle (`assets/js/theme.js`) respecting `prefers-color-scheme` and syncing mobile `<meta name="theme-color">` with `localStorage` persistence, paired with `@media print` rules in [src/print.css](src/print.css) for clean single-page A4 printing.

### 2. Single Source of Truth & Machine-Readable Endpoints
- **`/resume.json`:** Standardized JSON Resume source driving automated synchronization ([scripts/sync-resume.mjs](scripts/sync-resume.mjs)) for `<title>`, `<link rel="canonical">`, Open Graph/Twitter meta tags, Schema.org `Person` JSON-LD, rendered CV sections, footer copyright year, `404.html`, `/llms.txt` (exposed via `<link rel="alternate">` discovery tags), `/site.webmanifest`, `/sitemap.xml`, `/robots.txt`, `.well-known/security.txt`, and `assets/js/command-menu-panel.js`, verified by [scripts/validate-sync.mjs](scripts/validate-sync.mjs).
- **`/contact.vcf`:** RFC 2426 compliant vCard 3.0 generated directly from `/resume.json` at build time with proper 7-field `ADR` formatting and escaping.
- **`/.well-known/security.txt`:** RFC 9116 compliant vulnerability disclosure policy with automated CI expiry checks (fails if fewer than 30 days remain).
- **`/404.html` & `/sitemap.xml`:** Branded 404 recovery page (sharing chrome with `/quality/` and `/architecture/` via `scripts/lib/chrome.mjs`) and sitemap indexing `/`, `/resume.pdf`, `/resume.json`, `/llms.txt`, `/contact.vcf`, `/architecture/`, `/quality/`, and `/quality/report.json`, matching `robots.txt`.

### 3. Automated `/resume.pdf` & Open Graph Card Pipelines
- **`scripts/generate-pdf.mjs`:** Serves `_site/` via the local static server (`scripts/serve.mjs`, which also enforces canonical `301` trailing slashes and path-traversal protection) and uses headless Chromium via `scripts/lib/browser.mjs` + `playwright-core` (blocking external requests) to generate `/resume.pdf` and enforce `maxPdfPages: 1`.
- **`scripts/generate-og-card.mjs`:** Renders a zero-external-network 1200×630 PNG preview card (`/assets/og-card.png`) from `resume.json` and locally bundled fonts/avatar on every build.

### 4. Continuous Verification, `/quality/`, `/architecture/` & Dependabot
- **`npm run lint`, `test:unit`, `test:security`:** Recorded via [scripts/run-gate.mjs](scripts/run-gate.mjs) so Biome formatting/rules, Node unit tests (`tests/unit.test.mjs`), and `npm audit --audit-level=moderate` results flow into `/quality/`.
- **`npm run test:html`:** Runs offline HTML5 validation (`html-validate`) across every generated HTML artifact (`index.html`, `404.html`, `quality/index.html`, `architecture/index.html`).
- **`npm run test:perf`:** Runs headless mobile emulation ([scripts/check-performance.mjs](scripts/check-performance.mjs)) enforcing CSS, initial/lazy JS (`<= 4 KB` initial, `<= 12 KB` panel), font, HTML, avatar, and initial mobile transfer (`<= 75 KB`) budgets, Web Vitals (`FCP`, `LCP`, `CLS`), zero eager loading of the lazy command panel, zero 404s/console errors, and zero horizontal overflow across `320px–768px` viewports.
- **`lychee-action`, Production Smoke Tests & `.github/dependabot.yml`:** Remaps canonical domain links locally during CI builds and runs weekly on `schedule` (`cron`) + `workflow_dispatch` against `https://guilhermevigneron.dev` alongside `npm run test:smoke:prod` (verifying live endpoints, lazy JS bundle, strict CSP/referrer tags, `/resume.pdf`, `/contact.vcf`, `/assets/og-card.png`, `/architecture/`, `/404.html`, `overallStatus: pass` on `/quality/report.json`, and `security.txt`), with weekly Dependabot PRs for `npm` and SHA-pinned GitHub Actions.
- **Cypress + `cypress-axe` (`npm run test:e2e`):** Verifies zero external third-party network requests, strict CSP & referrer enforcement, lazy command-menu module fetching, ARIA combobox/listbox semantics, CSS tag separators, `301` trailing-slash redirects, explicit SVG dimensions, `rel="noopener noreferrer"` on external links, mobile compatibility (`>=44px` touch targets, `320px–768px` layout including open dialog), `/resume.pdf` binary validity, `/assets/og-card.png`, `/contact.vcf`, `/quality/report.json`, `security.txt` freshness, `resume.json` parity, clipboard toast actions, theme persistence, and multi-viewport Light/Dark WCAG 2.1 AA compliance (`cypress-axe`).
- **`/quality/` & `/architecture/`:** Publishes both the human-readable verification report (10 gates) and machine-readable CI telemetry JSON (`/quality/report.json`) via [scripts/generate-quality-report.mjs](scripts/generate-quality-report.mjs), plus a visual pipeline overview at `/architecture/` via [scripts/generate-architecture.mjs](scripts/generate-architecture.mjs).
- **Hardened CI/CD Workflow (`.github/workflows/ci.yml`):** Pins all GitHub Actions to commit SHAs, disables persisted checkout credentials (`persist-credentials: false`), enforces `npm run test:sync` before `npm run build -- --no-sync`, gates GitHub Pages deployment on `overallStatus === 'pass'` in `/quality/report.json`, and scopes `pages: write` / `id-token: write` strictly to the `deploy` job.

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
npm run sync           # Synchronize resume.json -> index.html, 404.html, llms.txt, manifest, sitemap, robots, security.txt, command-menu-panel.js
npm run test:sync      # Verify parity across resume.json and synced repository files
npm run build          # Sync, validate, minify & fingerprint assets, build PDF, OG card, /quality/, and /architecture/
npm run test:html      # Validate built HTML5 documents
npm run test:perf      # Run Playwright mobile Web Vitals & byte budget audit
npm run test:e2e       # Start static server & run Cypress + mobile + axe suite
npm run build:quality  # Refresh /quality/ and /quality/report.json with local test telemetry
npm run serve          # Serve _site/ locally at http://127.0.0.1:4000
```
