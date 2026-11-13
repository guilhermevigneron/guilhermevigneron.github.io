# AGENTS.md

Instructions for AI coding agents working in this repository (`guilhermevigneron.dev`).

## Project Overview

Zero-third-party-runtime-dependency personal portfolio & resume static site built with Node.js (22+), `esbuild`, Playwright, Cypress + `axe-core`, `html-validate`, and Biome.

## Core Architecture & Single Source of Truth

- **`resume.json` is the single source of truth** for all profile content, experience, projects, skills, education, publications, awards, and metadata.
- **Never hand-edit generated/synced blocks** in `index.html`, `404.html`, `llms.txt`, `site.webmanifest`, `sitemap.xml`, `robots.txt`, `.well-known/security.txt`, or `assets/js/command-menu-panel.js`. Instead, edit `resume.json` (or the template logic in `scripts/sync-resume.mjs`) and run:
  ```bash
  npm run sync
  ```
- Verify parity at any time with `npm run test:sync`.
- `_site/` and `.ci-reports/` are generated build/test outputs (gitignored; do not edit manually).

## Key Directories & Files

- `resume.json` — Canonical JSON Resume data.
- `src/` — Source stylesheets (`styles.css`, `subpage.css`, `print.css`).
- `assets/js/` — Client scripts (`theme-init.js`, `theme.js`, eager loader `command-menu.js`, lazy ES module `command-menu-panel.js`).
- `scripts/` — Build, sync, PDF/OG generation, HTML validation, perf, gate telemetry (`run-gate.mjs`), and report generators, backed by shared helpers in `scripts/lib/` (`browser.mjs`, `chrome.mjs`, `pdf.mjs`).
- `tests/unit.test.mjs` — Node built-in unit tests (`node --test`).
- `cypress/portfolio.cy.js` — E2E, mobile, CSP, lazy module loading, and WCAG 2.1 AA (`cypress-axe`) tests.

## Non-Negotiable Constraints

1. **Strict CSP & Zero External Runtime Requests:**
   - All pages enforce `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `form-action 'none'`.
   - Do **not** add inline `<script>` or `<style>` blocks, `eval()`, or external CDN/font/API requests.
2. **Performance & Asset Budgets** (enforced by `scripts/check-performance.mjs` and `scripts/generate-pdf.mjs`):
   - Screen CSS `<= 12 KB`, subpage CSS `<= 6 KB`, print CSS `<= 3 KB`
   - Initial JS (`theme-init.js` + `theme.js` + `command-menu.js`) `<= 4 KB`, lazy `command-menu-panel.js` `<= 12 KB`
   - Minified `index.html` `<= 25 KB`, initial mobile transfer `<= 75 KB`
   - `CLS <= 0.01`, `LCP <= 2500 ms`, `FCP <= 1800 ms`
   - `/resume.pdf` must remain **1 page** (`maxPdfPages: 1`).
3. **Accessibility & HTML Validity:**
   - All built HTML (`_site/index.html`, `_site/404.html`, `_site/quality/index.html`, `_site/architecture/index.html`) must pass `html-validate`.
   - Inline `<svg>` icons must include explicit dimensions, `aria-hidden="true"`, and `focusable="false"`.
   - External links must use `rel="noopener noreferrer"`.
4. **Code Style:**
   - Managed by Biome (`biome.json`): 2-space indentation, single quotes, ES5 trailing commas, 100-char line width.

## Verification Commands

Run the full verification pipeline before finalizing significant changes:

```bash
npm run verify
```

Or run targeted checks as needed:

- `npm run lint` — Biome lint across JS, CSS, JSON, and SVG/HTML (records telemetry)
- `npm run lint:fix` — Auto-fix Biome lint issues
- `npm run test:unit` — Unit tests (`tests/unit.test.mjs`, records telemetry)
- `npm run test:security` — `npm audit --audit-level=moderate` (records telemetry)
- `npm run test:sync` — Validate `resume.json` parity across synced files
- `npm run build` — Sync (skip with `-- --no-sync`), validate, bundle/fingerprint assets, generate `/resume.pdf`, OG card, `/quality/`, and `/architecture/`
- `npm run test:html` — Validate built HTML5 in `_site/`
- `npm run test:e2e` — Run Cypress + `axe-core` suite
- `npm run test:perf` — Run Playwright mobile Web Vitals & byte-budget audit
