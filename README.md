# Guilherme Vigneron - Portfolio & Resume

![CI](https://github.com/guilhermevigneron/guilhermevigneron.github.io/actions/workflows/ci.yml/badge.svg)

This repository contains the source code for my personal portfolio and resume website (**[guilhermevigneron.dev](https://guilhermevigneron.dev)**). It is engineered as a **zero-third-party-dependency, self-verifying static showcase** with a pure Node build pipeline, automated headless-Chromium resume PDF generation, and a live CI quality dashboard.

---

## Architecture & Key Capabilities

### 1. Zero Third-Party Runtime Dependencies, Security & Performance
- **Minimalist CV Aesthetic:** Monochrome warm off-white light mode (`#fafaf8`) and automatic/toggleable dark mode (`#0d0c0a`), print-first A4 typography, and responsive command palette (`Ctrl+J` / `⌘+J` on desktop, touch search trigger on mobile via `assets/js/command-menu.js`).
- **Split & Fingerprinted Asset Pipeline:** Minified screen ([src/styles.css](src/styles.css)), subpage ([src/subpage.css](src/subpage.css)), and print ([src/print.css](src/print.css)) CSS bundles with SHA-256 fingerprinting across CSS, JS, fonts, icons, and avatar images (`scripts/build.mjs`), plus HTML minification ([scripts/minify-html.mjs](scripts/minify-html.mjs)).
- **Self-Hosted Subsetted Typography & Responsive Avatar:** Latin-subsetted `Geist Mono` (`400..500`) and `Geist Pixel Square` with metric-matched fallbacks, responsive `<picture>` AVIF/WebP/JPEG avatar variants, and self-hosted SVG/PNG/ICO favicons + `site.webmanifest` — zero external requests.
- **Strict CSP & Referrer Policy:** Enforces `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `form-action 'none'` — zero `'unsafe-inline'` or `'unsafe-eval'`) and `strict-origin-when-cross-origin` referrer policy across `/`, `/404.html`, and `/quality/`, with zero inline executable `<script>` tags.
- **Inline Accessible SVGs:** All social and UI icons are explicitly sized inline `<svg>` elements (`aria-hidden="true"`, `focusable="false"`), eliminating Font Awesome CDN requests.
- **Light/Dark Theme & Print Layout:** External no-FOUC initialization (`assets/js/theme-init.js`) and zero-dependency toggle (`assets/js/theme.js`) respecting `prefers-color-scheme` and syncing mobile `<meta name="theme-color">` with `localStorage` persistence, paired with `@media print` rules in [src/print.css](src/print.css) for clean single-page A4 printing.

### 2. Single Source of Truth & Machine-Readable Endpoints
- **`/resume.json`:** Standardized JSON Resume file driving automated synchronization (`scripts/sync-resume.mjs`) for Schema.org `Person` JSON-LD in `index.html` and `/llms.txt` (exposed via `<link rel="alternate">` discovery tags), verified against DOM content by `scripts/validate-sync.mjs`.
- **`/.well-known/security.txt`:** RFC 9116 compliant vulnerability disclosure policy with automated CI expiry checks (fails if fewer than 30 days remain).
- **`/404.html` & `/sitemap.xml`:** Branded 404 recovery page and sitemap indexing `/`, `/resume.pdf`, `/resume.json`, `/llms.txt`, and `/quality/`, matching `robots.txt`.

### 3. Automated `/resume.pdf` Pipeline
- **`scripts/generate-pdf.mjs`:** Serves the built `_site/` output via the local static server (`scripts/serve.mjs`) and uses headless Chromium via `playwright-core` (blocking any external requests) to generate a crisp, self-hosted `/resume.pdf` on every build.

### 4. Continuous Verification & `/quality/` Dashboard
- **`npm run test:security`:** Fails if `npm audit --audit-level=high` detects vulnerabilities.
- **`npm run test:html`:** Runs offline HTML5 validation (`html-validate`) across every generated HTML artifact (`index.html`, `404.html`, `quality/index.html`).
- **`npm run test:perf`:** Runs headless mobile emulation (`scripts/check-performance.mjs`) enforcing asset byte budgets, Web Vitals (`FCP`, `LCP`, `CLS`), zero 404s/console errors, and zero horizontal overflow across `320px–768px` viewports.
- **`lychee-action` & Production Smoke Tests:** Crawls internal assets and external links during CI and runs weekly on `schedule` (`cron`) + `workflow_dispatch` against `https://guilhermevigneron.dev` alongside `npm run test:smoke:prod` (verifying live endpoints, strict CSP/referrer tags, `/resume.pdf`, and `security.txt`).
- **Cypress + `cypress-axe` (`npm run test:e2e`):** Verifies zero external third-party network requests, strict CSP & referrer enforcement with zero `securitypolicyviolation` events (serving `axe-core` from a same-origin test route in `cypress/support/e2e.js` without `eval()`), explicit SVG dimensions, `rel="noopener noreferrer"` on external links, mobile compatibility (`>=44px` touch targets, `320px–768px` layout, mobile command palette), `/resume.pdf` binary validity, `security.txt` freshness, `resume.json`/`llms.txt`/JSON-LD parity, theme persistence, and 12-audit WCAG 2.1 AA compliance across Light & Dark themes on Mobile and Desktop viewports (plus the open command dialog).
- **`/quality/`:** Publishes a live static verification summary generated by `scripts/generate-quality-report.mjs` (rebuilt in CI after all checks complete) and linked from the portfolio footer.
- **Hardened CI/CD Workflow (`.github/workflows/ci.yml`):** Pins all GitHub Actions to commit SHAs, disables persisted checkout credentials (`persist-credentials: false`), and enforces least-privilege `permissions` (`contents: read` at workflow level; `pages: write` and `id-token: write` scoped to the `deploy` job).

---

## Local Development

Requires Node.js 22+ and a local Chrome/Chromium installation (used by `playwright-core` and Cypress).

```bash
npm ci
npm run test:security
npm run build          # Syncs resume.json, compiles/fingerprints assets, builds /resume.pdf & /quality/
npm run test:html
npm run test:perf      # Runs Playwright mobile Web Vitals & asset budget audit
npm run test:e2e       # Starts static server & runs Cypress + mobile + axe suite
npm run build:quality  # Optional: refreshes /quality/ with local test report telemetry
npm run serve          # Serves _site/ locally at http://127.0.0.1:4000
```
