import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rewriteAssetRefs } from './lib/chrome.mjs';
import { minifyCssFiles, minifyJsFiles } from './minify-assets.mjs';
import { minifyHtml } from './minify-html.mjs';
import { buildVCard } from './sync-resume.mjs';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');
const skipSync = process.argv.includes('--no-sync');

function runNodeScript(relScript) {
  execFileSync(process.execPath, [path.join(ROOT, relScript)], {
    stdio: 'inherit',
  });
}

function runNodeScriptAsync(relScript) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, relScript)], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${relScript} exited with code ${code}`));
      }
    });
  });
}

function copyFile(srcRel, destRel = srcRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(siteDir, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcRel, destRel = srcRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(siteDir, destRel);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function fingerprintAsset(relPath) {
  const fullPath = path.join(siteDir, relPath);
  if (!fs.existsSync(fullPath)) return `/${relPath}`;
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(fullPath))
    .digest('hex')
    .slice(0, 8);
  const parsed = path.posix.parse(relPath);
  const hashedRel = path.posix.join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`);
  fs.copyFileSync(fullPath, path.join(siteDir, hashedRel));
  return `/${hashedRel}`;
}

function rewriteTextFile(relPath, replacements) {
  const target = path.join(siteDir, relPath);
  if (!fs.existsSync(target)) return;
  const content = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, rewriteAssetRefs(content, replacements), 'utf8');
}

export { rewriteAssetRefs };

export async function buildSite() {
  if (!skipSync) {
    console.log('1. Syncing resume.json -> index.html, 404.html, llms.txt, manifest, sitemap...');
    runNodeScript('scripts/sync-resume.mjs');
  } else {
    console.log('1. Skipping sync (--no-sync); validating committed repository parity...');
  }

  console.log('2. Validating single-source-of-truth parity...');
  runNodeScript('scripts/validate-sync.mjs');

  console.log('3. Preparing clean _site/ directory...');
  fs.rmSync(siteDir, { recursive: true, force: true });
  fs.mkdirSync(siteDir, { recursive: true });
  for (const staleReport of [
    'html-validate.json',
    'cypress-results.json',
    'perf-report.json',
    'og-report.json',
    'pdf-report.json',
  ]) {
    fs.rmSync(path.join(reportsDir, staleReport), { force: true });
  }

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
  copyDir('assets');

  const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
  fs.writeFileSync(path.join(siteDir, 'contact.vcf'), buildVCard(resume), 'utf8');

  console.log('4. Minifying split CSS and JS bundles via esbuild...');
  await minifyCssFiles(siteDir);
  await minifyJsFiles(siteDir);

  console.log('4b. Fingerprinting fonts, CSS, JS, icons, and avatar assets...');
  const monoFontUrl = fingerprintAsset('assets/fonts/GeistMono-Variable.woff2');
  const pixelFontUrl = fingerprintAsset('assets/fonts/GeistPixel-Square.woff2');

  const fontReplacements = {
    '/assets/fonts/GeistMono-Variable.woff2': monoFontUrl,
    '/assets/fonts/GeistPixel-Square.woff2': pixelFontUrl,
  };
  rewriteTextFile('assets/css/styles.css', fontReplacements);

  const cssUrl = fingerprintAsset('assets/css/styles.css');
  const subpageCssUrl = fingerprintAsset('assets/css/subpage.css');
  const printCssUrl = fingerprintAsset('assets/css/print.css');
  const themeInitJsUrl = fingerprintAsset('assets/js/theme-init.js');
  const themeJsUrl = fingerprintAsset('assets/js/theme.js');
  const commandMenuPanelJsUrl = fingerprintAsset('assets/js/command-menu-panel.js');
  rewriteTextFile('assets/js/command-menu.js', {
    '/assets/js/command-menu-panel.js': commandMenuPanelJsUrl,
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
    const full = path.join(siteDir, htmlFile);
    fs.writeFileSync(full, minifyHtml(fs.readFileSync(full, 'utf8')), 'utf8');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'asset-manifest.json'),
    JSON.stringify(
      {
        cssUrl,
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
        avatarReplacements,
      },
      null,
      2
    )
  );

  console.log('5. Generating /resume.pdf and /assets/og-card.png (1200x630) in parallel...');
  await Promise.all([
    runNodeScriptAsync('scripts/generate-pdf.mjs'),
    runNodeScriptAsync('scripts/generate-og-card.mjs'),
  ]);

  console.log('6. Generating initial /quality/index.html & /quality/report.json...');
  runNodeScript('scripts/generate-quality-report.mjs');

  console.log('7. Generating /architecture/index.html...');
  runNodeScript('scripts/generate-architecture.mjs');

  console.log('Build complete: _site/ ready.');
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  await buildSite();
}
