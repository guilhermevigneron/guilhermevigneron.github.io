import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildArchitecturePage } from './generate-architecture.mjs';
import { generateOgCard } from './generate-og-card.mjs';
import { generatePdf } from './generate-pdf.mjs';
import { buildQualityPage } from './generate-quality-report.mjs';
import { withBrowser, withStaticServer } from './lib/browser.mjs';
import { rewriteAssetRefs } from './lib/html.mjs';
import { readJson, writeReportJson } from './lib/io.mjs';
import { isEntrypoint, REPORTS_DIR, RESUME_PATH, ROOT, SITE_DIR } from './lib/paths.mjs';
import { getSiteEndpoints } from './lib/site-config.mjs';
import { minifyCssFiles, minifyJsFiles } from './minify-assets.mjs';
import { minifyHtml } from './minify-html.mjs';
import { buildVCard, syncAllFromResume } from './sync-resume.mjs';
import { validateAllFromRoot } from './validate-sync.mjs';

export { rewriteAssetRefs };

// Preserve upstream gate reports (lint, unit, security) that run before build
const DOWNSTREAM_REPORTS = [
  'html-validate.json',
  'cypress-results.json',
  'perf-report.json',
  'og-report.json',
  'pdf-report.json',
  'asset-manifest.json',
  'sync-validation.json',
];

function copyFile(srcRel, destRel = srcRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(SITE_DIR, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyStaticAssets() {
  const srcAssets = path.join(ROOT, 'assets');
  const destAssets = path.join(SITE_DIR, 'assets');
  const srcJsDir = path.join(srcAssets, 'js');
  if (!fs.existsSync(srcAssets)) return;
  fs.cpSync(srcAssets, destAssets, {
    recursive: true,
    filter: (src) => src !== srcJsDir && !src.startsWith(`${srcJsDir}${path.sep}`),
  });
}

function fingerprintAsset(relPath) {
  const fullPath = path.join(SITE_DIR, relPath);
  if (!fs.existsSync(fullPath)) return `/${relPath}`;
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(fullPath))
    .digest('hex')
    .slice(0, 8);
  const parsed = path.posix.parse(relPath);
  const hashedRel = path.posix.join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`);
  fs.copyFileSync(fullPath, path.join(SITE_DIR, hashedRel));
  return `/${hashedRel}`;
}

function rewriteTextFile(relPath, replacements) {
  const target = path.join(SITE_DIR, relPath);
  if (!fs.existsSync(target)) return;
  const content = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, rewriteAssetRefs(content, replacements), 'utf8');
}

function cleanDownstreamReports() {
  if (!fs.existsSync(REPORTS_DIR)) return;
  for (const reportFile of DOWNSTREAM_REPORTS) {
    fs.rmSync(path.join(REPORTS_DIR, reportFile), { force: true });
  }
}

export async function runBuild({ skipSync = process.argv.includes('--no-sync') } = {}) {
  console.log('0. Clearing stale downstream build & verification telemetry...');
  cleanDownstreamReports();

  if (!skipSync) {
    console.log(
      '1. Syncing resume.json -> index.html, 404.html, llms.txt, manifest, sitemap, robots, CNAME...'
    );
    syncAllFromResume(ROOT);
  } else {
    console.log('1. Skipping sync (--no-sync); validating committed repository parity...');
  }

  console.log('2. Validating single-source-of-truth parity...');
  validateAllFromRoot(ROOT);

  console.log('3. Preparing clean _site/ directory...');
  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });

  const resume = readJson(RESUME_PATH);
  const endpoints = getSiteEndpoints(resume);

  const rootFiles = [
    'index.html',
    '404.html',
    'resume.json',
    'llms.txt',
    'robots.txt',
    'CNAME',
    'sitemap.xml',
    'favicon.ico',
    'site.webmanifest',
    '.nojekyll',
  ];

  for (const file of rootFiles) {
    copyFile(file);
  }
  copyFile('.well-known/security.txt');
  copyStaticAssets();

  const vcfPath = path.join(SITE_DIR, endpoints.contactVcfPath.replace(/^\/+/, ''));
  fs.mkdirSync(path.dirname(vcfPath), { recursive: true });
  fs.writeFileSync(vcfPath, buildVCard(resume), 'utf8');

  console.log('4. Minifying & bundling split CSS and JS via esbuild...');
  await minifyCssFiles(SITE_DIR);
  await minifyJsFiles(SITE_DIR, resume);

  console.log('4b. Fingerprinting fonts, CSS, JS, icons, and avatar assets...');
  const monoFontUrl = fingerprintAsset('assets/fonts/GeistMono-Variable.woff2');
  const pixelFontUrl = fingerprintAsset('assets/fonts/GeistPixel-Square.woff2');

  const fontReplacements = {
    '/assets/fonts/GeistMono-Variable.woff2': monoFontUrl,
    '/assets/fonts/GeistPixel-Square.woff2': pixelFontUrl,
  };
  rewriteTextFile('assets/css/styles.css', fontReplacements);

  const cssUrl = fingerprintAsset('assets/css/styles.css');
  const commandMenuCssUrl = fingerprintAsset('assets/css/command-menu.css');
  const subpageCssUrl = fingerprintAsset('assets/css/subpage.css');
  const printCssUrl = fingerprintAsset('assets/css/print.css');
  const themeInitJsUrl = fingerprintAsset('assets/js/theme-init.js');
  const themeJsUrl = fingerprintAsset('assets/js/theme.js');
  const commandMenuPanelJsUrl = fingerprintAsset('assets/js/command-menu-panel.js');
  rewriteTextFile('assets/js/command-menu.js', {
    '/assets/js/command-menu-panel.js': commandMenuPanelJsUrl,
    '/assets/css/command-menu.css': commandMenuCssUrl,
  });
  const commandMenuJsUrl = fingerprintAsset('assets/js/command-menu.js');
  const faviconSvgUrl = fingerprintAsset('assets/favicon.svg');
  const appleTouchIconUrl = fingerprintAsset('assets/apple-touch-icon.png');
  const icon192Url = fingerprintAsset('assets/icon-192.png');
  const icon512Url = fingerprintAsset('assets/icon-512.png');
  const icon512MaskableUrl = fingerprintAsset('assets/icon-512-maskable.png');

  const avatarAssets = [
    'assets/avatar-168.avif',
    'assets/avatar-224.avif',
    'assets/avatar-336.avif',
    'assets/avatar-168.webp',
    'assets/avatar-224.webp',
    'assets/avatar-336.webp',
    'assets/avatar.jpg',
  ];
  const avatarReplacements = {};
  for (const rel of avatarAssets) {
    avatarReplacements[`/${rel}`] = fingerprintAsset(rel);
  }

  const assetReplacements = {
    ...fontReplacements,
    ...avatarReplacements,
    '/assets/css/styles.css': cssUrl,
    '/assets/css/command-menu.css': commandMenuCssUrl,
    '/assets/css/subpage.css': subpageCssUrl,
    '/assets/css/print.css': printCssUrl,
    '/assets/js/theme-init.js': themeInitJsUrl,
    '/assets/js/theme.js': themeJsUrl,
    '/assets/js/command-menu.js': commandMenuJsUrl,
    '/assets/js/command-menu-panel.js': commandMenuPanelJsUrl,
    '/assets/favicon.svg': faviconSvgUrl,
    '/assets/apple-touch-icon.png': appleTouchIconUrl,
  };
  rewriteTextFile('index.html', assetReplacements);
  rewriteTextFile('404.html', assetReplacements);
  rewriteTextFile('site.webmanifest', {
    '/assets/favicon.svg': faviconSvgUrl,
    '/assets/apple-touch-icon.png': appleTouchIconUrl,
    '/assets/icon-192.png': icon192Url,
    '/assets/icon-512.png': icon512Url,
    '/assets/icon-512-maskable.png': icon512MaskableUrl,
  });

  console.log('4c. Minifying built HTML documents...');
  for (const htmlFile of ['index.html', '404.html']) {
    const full = path.join(SITE_DIR, htmlFile);
    fs.writeFileSync(full, minifyHtml(fs.readFileSync(full, 'utf8')), 'utf8');
  }

  const assetManifest = {
    cssUrl,
    commandMenuCssUrl,
    subpageCssUrl,
    printCssUrl,
    monoFontUrl,
    pixelFontUrl,
    themeInitJsUrl,
    themeJsUrl,
    commandMenuJsUrl,
    commandMenuPanelJsUrl,
    faviconSvgUrl,
    appleTouchIconUrl,
    icon192Url,
    icon512Url,
    icon512MaskableUrl,
    avatarReplacements,
  };
  writeReportJson('asset-manifest.json', assetManifest);

  console.log(
    `5. Generating ${endpoints.resumePdfPath} and ${endpoints.ogImagePath} (1200x630) via shared Chromium session...`
  );
  await withStaticServer(SITE_DIR, async ({ baseUrl }) =>
    withBrowser(async (browser, executablePath) => {
      await Promise.all([
        generatePdf({
          browser,
          baseUrl,
          executablePath,
          rootDir: ROOT,
          siteDir: SITE_DIR,
          reportsDir: REPORTS_DIR,
          resume,
        }),
        generateOgCard({
          browser,
          baseUrl,
          rootDir: ROOT,
          siteDir: SITE_DIR,
          reportsDir: REPORTS_DIR,
          resume,
        }),
      ]);
    })
  );

  console.log('5b. Fingerprinting generated /assets/og-card.png for social cache busting...');
  const ogCardUrl = fingerprintAsset('assets/og-card.png');
  const rawOgUrl = endpoints.ogImageUrl;
  const hashedOgUrl = `${endpoints.baseUrl}${ogCardUrl}`;
  rewriteTextFile('index.html', { [rawOgUrl]: hashedOgUrl });
  assetManifest.ogCardUrl = ogCardUrl;
  writeReportJson('asset-manifest.json', assetManifest);

  console.log(`6. Generating initial ${endpoints.qualityPath} & ${endpoints.qualityJsonPath}...`);
  buildQualityPage({ rootDir: ROOT, siteDir: SITE_DIR, reportsDir: REPORTS_DIR, resume });

  console.log(`7. Generating ${endpoints.architecturePath}...`);
  buildArchitecturePage({ rootDir: ROOT, siteDir: SITE_DIR, reportsDir: REPORTS_DIR, resume });

  console.log('Build complete: _site/ ready.');
}

export const buildSite = runBuild;

if (isEntrypoint(import.meta.url)) {
  runBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
