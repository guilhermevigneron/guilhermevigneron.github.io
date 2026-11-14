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
- **Grounded "Ask / Match My Resume" in the Command Menu (`⌘K` / `⌘J`):**
  - Press **`Ctrl+K` / `⌘+K`** or **`Ctrl+J` / `⌘+J`** anywhere on the site—or tap the search button on mobile—to open the command menu.
  - Type natural-language questions or job-description keywords (e.g., `"Azure DevOps CI/CD"`, `"Selenium C#"`, `"flaky test triage"`, `"AI workflows"`) to get instant, cited **Resume Matches** hydrated from `/llms.txt` (`src/js/resume-search.mjs`) with **zero external LLM API calls** and 100% CSP compliance.
- **Deterministic LLM Quality & Retrieval Eval Gate (`scripts/lib/ai-evals.mjs`):**
  - Every build and sync check runs a golden benchmark of recruiter & hiring-manager queries against `/llms.txt` and `resume.json`, enforcing **100% `Pass@1`**, **100% `Hit@3`**, **100% citation groundedness** (blocking ungrounded or hallucinated claims), and a strict token budget (`<= 1,600` tokens).
  - Live benchmark scorecards are published to **[/quality/](https://guilhermevigneron.dev/quality/)** and **[/quality/report.json](https://guilhermevigneron.dev/quality/report.json)**.
- **CI Flaky Test Triage & Failure Clustering Engine (`scripts/lib/flaky-triage.mjs`):**
  - Multi-framework failure classifier covering **Selenium / C# (`NUnit`)**, **Playwright**, **Cypress + `axe-core`**, and **Azure DevOps** logs.
  - Strips volatile runtime noise (timestamps, session UUIDs, hex memory addresses, ephemeral ports, and durations) to deduplicate multi-shard traces into canonical root-cause clusters, separating transient infrastructure flakes from PR-blocking regressions with a **zero-false-suppression** safety invariant.
- **Fast, Accessible & Private by Design:** Every font, icon, and image is self-hosted, strict security headers (`default-src 'self'`) block external requests, the initial mobile page load stays under 75 KB, and every build is verified for WCAG 2.1 AA accessibility (`cypress-axe`), HTML5 validity, and single-page A4 print layout.

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
Runs AI retrieval & flaky-triage eval gates, minifies & fingerprints CSS/JS,
renders /resume.pdf & social preview card, and generates /architecture/ & /quality/
   │
   ▼
_site/  (ready to preview locally or deploy to GitHub Pages)
```

---

## Project Layout

| Path                                        | What it's for                                                                                                                 |
| :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------- |
| [`resume.json`](resume.json)                | **Single source of truth** for all resume content and profile info                                                            |
| [`src/`](src/)                              | CSS stylesheets, HTML shell template, and client/build shared resume search (`js/resume-search.mjs`)                          |
| [`assets/`](assets/)                        | Self-hosted fonts, avatar images, icons, and client-side scripts (`command-menu-panel.js`)                                    |
| [`scripts/`](scripts/)                      | Build, sync, PDF/OG generation, AI retrieval eval gate (`lib/ai-evals.mjs`), and flaky triage engine (`lib/flaky-triage.mjs`) |
| [`tests/`](tests/) & [`cypress/`](cypress/) | Unit tests, end-to-end browser tests, and accessibility audits                                                                |
| [`AGENTS.md`](AGENTS.md)                    | Detailed technical rules and asset budgets for contributors and AI agents                                                     |

---

## Running It Locally

### Prerequisites

- **Node.js 22+** (CI runs on Node `22.x` via `.node-version`)
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
_(Avoid hand-editing the synced sections in `index.html`, `404.html`, `llms.txt`, or `sitemap.xml`—`npm run sync` handles them for you.)_

### 3. Run the full verification suite

```bash
npm run verify
```
This runs sync parity, Biome check (lint + format), unit tests, a security audit, a full build, HTML validation, Cypress + `axe-core` accessibility tests, Playwright mobile performance checks, and updates and validates the `/quality/` report.

<details>
<summary>All available npm scripts</summary>

| Command                     | Description                                                                                                           |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `npm run sync`              | Sync `resume.json` into HTML, `llms.txt`, `sitemap.xml`, `robots.txt`, `security.txt`, and the command menu           |
| `npm run test:sync`         | Check that all synced files match `resume.json`                                                                       |
| `npm run build`             | Sync, validate, bundle/fingerprint assets, and build `_site/` (including PDF, OG card, `/quality/`, `/architecture/`) |
| `npm run serve`             | Start a local static server for `_site/` at `http://127.0.0.1:4000`                                                   |
| `npm run lint`              | Run Biome check (lint + format) across JS, CSS, JSON, and HTML                                                        |
| `npm run lint:fix`          | Auto-fix Biome lint and formatting issues                                                                             |
| `npm run test:unit`         | Run Node.js unit tests and enforce code coverage thresholds (`>= 80%` lines, `>= 85%` funcs, `>= 70%` branches)       |
| `npm run test:html`         | Validate generated HTML5 files in `_site/`                                                                            |
| `npm run test:e2e`          | Run Cypress end-to-end, mobile, and `axe-core` accessibility tests                                                    |
| `npm run test:perf`         | Run Playwright mobile Web Vitals and byte-budget checks                                                               |
| `npm run test:perf:quality` | Run Playwright render and horizontal overflow audit on `/quality/`                                                    |
| `npm run test:security`     | Run `npm audit` for moderate+ vulnerabilities                                                                         |
| `npm run test:smoke:prod`   | Run production endpoint and security smoke tests                                                                      |
| `npm run build:quality`     | Refresh `/quality/` and `/quality/report.json` with local test results                                                |

</details>
