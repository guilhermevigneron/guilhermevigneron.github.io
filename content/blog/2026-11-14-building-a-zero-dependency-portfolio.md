---

title: Building a Zero-Dependency Static Portfolio
date: 2026-11-14
summary: Why this site avoids runtime frameworks, enforces a strict Content Security Policy, and validates every build with automated quality gates.
tags: [architecture, performance, security]
slug: building-a-zero-dependency-portfolio
---

Personal websites rarely need a heavy client-side framework. When your content is mostly structured text, links, and typography, shipping hundreds of kilobytes of JavaScript slows down mobile visitors and creates unnecessary maintenance overhead.

## Single Source of Truth

All profile data, work history, projects, and metadata live in `resume.json`. A build-time sync step compiles that data into:

- Semantic HTML (`index.html` and `404.html`)
- A single-page A4 PDF (`/resume.pdf`) via headless Chromium
- Machine-readable endpoints (`/resume.json`, `/llms.txt`, `/contact.vcf`)
- Static subpages like `/architecture/`, `/quality/`, and now `/blog/`

## Strict CSP and Byte Budgets

Every page ships with `default-src 'self'` and zero third-party runtime requests. Fonts are self-hosted, assets are fingerprinted, and `esbuild` bundles only a tiny amount of progressive enhancement for theme switching and the `Ctrl+J` / `Cmd+J` command menu.

```js
// Build-time checks enforce strict mobile transfer and Web Vitals limits
CLS <= 0.01
LCP <= 2500ms
FCP <= 1800ms
```

## Automated Verification

Before any change is published, `npm run verify` runs Biome linting, unit tests, `npm audit`, HTML5 validation, Cypress + `axe-core` accessibility checks, and Playwright mobile performance budgets.
