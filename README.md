# Guilherme Vigneron — Portfolio & Resume

![CI](https://github.com/guilhermevigneron/guilhermevigneron.github.io/actions/workflows/ci.yml/badge.svg)

Welcome to the source code for **[guilhermevigneron.dev](https://guilhermevigneron.dev)** — my personal portfolio and resume website.

It is designed to be **fast, clean, and private**: there are no trackers, no third-party CDNs, and no heavy frameworks. Everything on the site—from the web page to the downloadable PDF resume—is generated from a single `resume.json` file and verified automatically before going live.

**Quick links on the live site:**
- **[guilhermevigneron.dev](https://guilhermevigneron.dev)** — Main portfolio & resume
- **[/resume.pdf](https://guilhermevigneron.dev/resume.pdf)** — Single-page A4 PDF generated automatically on every build
- **[/architecture/](https://guilhermevigneron.dev/architecture/)** — Visual overview of how the build & test pipeline works
- **[/quality/](https://guilhermevigneron.dev/quality/)** — Live dashboard showing the latest automated test results

---

## What Makes This Site Special

- **One File Powers Everything:** All profile details, work experience, projects, and skills live in [`resume.json`](resume.json). Updating that one file automatically updates the website, the PDF resume, the downloadable contact card (`contact.vcf`), the AI-friendly summary (`llms.txt`), and search metadata.
- **Fast & Private by Design:** Every font, icon, and image is self-hosted, and strict security headers block external requests. The entire initial mobile page load stays under 75 KB.
- **Helpful Shortcuts for Visitors:**
  - Press **`Ctrl+J`** (or **`⌘+J`** on Mac) anywhere on the site—or tap the search button on mobile—to open a quick command menu. From there, you can copy an email address, copy a Markdown version of the resume, download a contact card, or jump straight to a section.
  - Supports **Light & Dark mode** (matching your system preference or toggled manually) and prints cleanly onto a **single A4 page**.
- **Tested Like a Production App:** Every update is automatically checked for accessibility (WCAG 2.1 AA), mobile responsiveness, page speed, valid HTML, security vulnerabilities, and broken links.

---

## How It Works

Instead of maintaining separate files for a website, a PDF, and metadata, this project uses a simple pipeline:

```text
resume.json
   │
   ▼  npm run sync
Updates index.html, 404.html, llms.txt, sitemap.xml, robots.txt, etc.
   │
   ▼  npm run build
Minifies & fingerprints CSS/JS, renders /resume.pdf & social preview card,
and generates /architecture/ and /quality/
   │
   ▼
_site/  (ready to preview locally or deploy to GitHub Pages)
```

---

## Project Layout

| Path | What it's for |
| :--- | :--- |
| [`resume.json`](resume.json) | **Single source of truth** for all resume content and profile info |
| [`src/`](src/) | CSS stylesheets for screen, subpages, and printing |
| [`assets/`](assets/) | Self-hosted fonts, avatar images, icons, and small client-side scripts |
| [`scripts/`](scripts/) | Node.js scripts that sync data, build `_site/`, generate the PDF/OG card, and run checks |
| [`tests/`](tests/) & [`cypress/`](cypress/) | Unit tests, end-to-end browser tests, and accessibility audits |
| [`AGENTS.md`](AGENTS.md) | Detailed technical rules and asset budgets for contributors and AI agents |

---

## Running It Locally

### Prerequisites
- **Node.js 22+**
- **Google Chrome or Chromium** (used by Playwright and Cypress to generate the PDF and run browser tests)

### 1. Install dependencies & preview the site
```bash
npm ci
npm run build
npm run serve
```
Then open **http://127.0.0.1:4000** in your browser.

### 2. Edit resume content
Edit [`resume.json`](resume.json), then sync the changes across the repository:
```bash
npm run sync
```
*(Avoid hand-editing the synced sections in `index.html`, `404.html`, `llms.txt`, or `sitemap.xml`—`npm run sync` handles them for you.)*

### 3. Run the full verification suite
```bash
npm run verify
```
This runs linting, unit tests, a security audit, a full build, HTML validation, Cypress + `axe-core` accessibility tests, Playwright mobile performance checks, and updates the `/quality/` report.

<details>
<summary>All available npm scripts</summary>

| Command | Description |
| :--- | :--- |
| `npm run sync` | Sync `resume.json` into HTML, `llms.txt`, `sitemap.xml`, `robots.txt`, `security.txt`, and the command menu |
| `npm run test:sync` | Check that all synced files match `resume.json` |
| `npm run build` | Sync, validate, bundle/fingerprint assets, and build `_site/` (including PDF, OG card, `/quality/`, `/architecture/`) |
| `npm run serve` | Start a local static server for `_site/` at `http://127.0.0.1:4000` |
| `npm run lint` | Run Biome linter across JS, CSS, JSON, SVG, and HTML |
| `npm run lint:fix` | Auto-fix Biome lint issues |
| `npm run test:unit` | Run Node.js unit tests (`tests/unit.test.mjs`) |
| `npm run test:html` | Validate generated HTML5 files in `_site/` |
| `npm run test:e2e` | Run Cypress end-to-end, mobile, and `axe-core` accessibility tests |
| `npm run test:perf` | Run Playwright mobile Web Vitals and byte-budget checks |
| `npm run test:security` | Run `npm audit` for moderate+ vulnerabilities |
| `npm run build:quality` | Refresh `/quality/` and `/quality/report.json` with local test results |

</details>
