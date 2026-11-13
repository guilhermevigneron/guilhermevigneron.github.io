import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();

export async function minifyCssFiles(outSiteDir = path.join(ROOT, '_site')) {
  const bundles = [
    ['src/styles.css', 'assets/css/styles.css'],
    ['src/subpage.css', 'assets/css/subpage.css'],
    ['src/print.css', 'assets/css/print.css'],
  ];

  for (const [inputRel, outputRel] of bundles) {
    const inputPath = path.join(ROOT, inputRel);
    const outputPath = path.join(outSiteDir, outputRel);
    const source = fs.readFileSync(inputPath, 'utf8');
    const result = await esbuild.transform(source, {
      loader: 'css',
      minify: true,
      charset: 'utf8',
    });
    const compactCss = result.code
      .replace(/(--[\w-]+):\s+/g, '$1:')
      .replace(/(--font-[\w-]+:[^;]+)/g, (m) => m.replace(/,\s+/g, ','));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, compactCss, 'utf8');
  }
}

export async function minifyJsFiles(outSiteDir = path.join(ROOT, '_site')) {
  const scripts = [
    'assets/js/theme-init.js',
    'assets/js/theme.js',
    'assets/js/command-menu.js',
    'assets/js/command-menu-panel.js',
  ];

  for (const rel of scripts) {
    const targetPath = path.join(outSiteDir, rel);
    if (!fs.existsSync(targetPath)) continue;
    const source = fs.readFileSync(targetPath, 'utf8');
    const result = await esbuild.transform(source, {
      loader: 'js',
      minify: true,
      target: 'es2020',
      charset: 'utf8',
    });
    fs.writeFileSync(targetPath, result.code, 'utf8');
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const cssOnly = process.argv.includes('--css');
  await minifyCssFiles();
  if (!cssOnly) {
    await minifyJsFiles();
  }
  console.log(cssOnly ? 'Minified CSS bundles via esbuild.' : 'Minified CSS & JS bundles via esbuild.');
}
