import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const siteDir = path.join(ROOT, '_site');

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

console.log('1. Syncing resume.json -> llms.txt & index.html JSON-LD...');
runNodeScript('scripts/sync-resume.mjs');

console.log('2. Validating single-source-of-truth parity...');
runNodeScript('scripts/validate-sync.mjs');

console.log('3. Preparing clean _site/ directory...');
fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });

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

console.log('5. Generating /resume.pdf via headless Chromium...');
runNodeScript('scripts/generate-pdf.mjs');

console.log('6. Generating initial /quality/index.html report...');
runNodeScript('scripts/generate-quality-report.mjs');

console.log('Build complete: _site/ ready.');
