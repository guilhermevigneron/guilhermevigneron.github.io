import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');
const reportsDir = path.join(ROOT, '.ci-reports');

function runNodeScript(relScript) {
  execFileSync(process.execPath, [path.join(ROOT, relScript)], {
    stdio: 'inherit',
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

function rewriteHtmlAssets(relHtmlPath, replacements) {
  const target = path.join(siteDir, relHtmlPath);
  if (!fs.existsSync(target)) return;
  let html = fs.readFileSync(target, 'utf8');
  for (const [fromUrl, toUrl] of Object.entries(replacements)) {
    html = html.replaceAll(fromUrl, toUrl);
  }
  fs.writeFileSync(target, html, 'utf8');
}

console.log('1. Syncing resume.json -> llms.txt & index.html JSON-LD...');
runNodeScript('scripts/sync-resume.mjs');

console.log('2. Validating single-source-of-truth parity...');
runNodeScript('scripts/validate-sync.mjs');

console.log('3. Preparing clean _site/ directory...');
fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });
for (const staleReport of ['html-validate.json', 'cypress-results.json']) {
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
  '.nojekyll',
];

for (const file of rootFiles) {
  copyFile(file);
}
copyFile('.well-known/security.txt');
copyFile('assets/avatar.jpg');
copyDir('assets/fonts');
copyDir('assets/js');

console.log('4. Compiling and minifying Tailwind CSS...');
const tailwindBin = path.join(ROOT, 'node_modules', '.bin', 'tailwindcss');
execFileSync(
  tailwindBin,
  [
    '-i',
    path.join(ROOT, 'src', 'styles.css'),
    '-o',
    path.join(siteDir, 'assets', 'css', 'styles.css'),
    '--minify',
  ],
  { stdio: 'inherit' }
);

console.log('4b. Fingerprinting CSS and JS bundles for cache busting...');
const cssUrl = fingerprintAsset('assets/css/styles.css');
const themeJsUrl = fingerprintAsset('assets/js/theme.js');
const commandMenuJsUrl = fingerprintAsset('assets/js/command-menu.js');

const assetReplacements = {
  '/assets/css/styles.css': cssUrl,
  '/assets/js/theme.js': themeJsUrl,
  '/assets/js/command-menu.js': commandMenuJsUrl,
};
rewriteHtmlAssets('index.html', assetReplacements);
rewriteHtmlAssets('404.html', assetReplacements);

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  path.join(reportsDir, 'asset-manifest.json'),
  JSON.stringify({ cssUrl, themeJsUrl, commandMenuJsUrl }, null, 2)
);

console.log('5. Generating /resume.pdf via headless Chromium...');
runNodeScript('scripts/generate-pdf.mjs');

console.log('6. Generating initial /quality/index.html report...');
runNodeScript('scripts/generate-quality-report.mjs');

console.log('Build complete: _site/ ready.');
