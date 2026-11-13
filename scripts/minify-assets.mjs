import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { readJson } from './lib/io.mjs';
import { ASSETS_DIR, isEntrypoint, RESUME_PATH, SITE_DIR, SRC_DIR } from './lib/paths.mjs';
import { buildCommandMenuConfig } from './lib/site-config.mjs';

export async function minifyCssFiles(outSiteDir = SITE_DIR, srcDir = SRC_DIR) {
  const bundles = [
    ['styles.css', 'assets/css/styles.css'],
    ['command-menu.css', 'assets/css/command-menu.css'],
    ['subpage.css', 'assets/css/subpage.css'],
    ['print.css', 'assets/css/print.css'],
  ];

  for (const [inputFile, outputRel] of bundles) {
    const inputPath = path.join(srcDir, inputFile);
    if (!fs.existsSync(inputPath)) continue;
    const outputPath = path.join(outSiteDir, outputRel);
    const source = fs.readFileSync(inputPath, 'utf8');
    const result = await esbuild.transform(source, {
      loader: 'css',
      minify: true,
      charset: 'utf8',
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.code, 'utf8');
  }
}

export async function minifyJsFiles(
  outSiteDir = SITE_DIR,
  resumeData = null,
  assetsDir = ASSETS_DIR
) {
  const resume = resumeData ?? readJson(RESUME_PATH);
  const cfg = buildCommandMenuConfig(resume);
  const ep = cfg.endpoints;
  // Serialize a compact wire payload to preserve strict mobile byte budgets
  const compactConfig = {
    email: cfg.email,
    host: cfg.host,
    siteUrl: cfg.siteUrl,
    toggleEvent: cfg.toggleEvent,
    profiles: cfg.profiles.map((p) => [p.network, p.display, p.url]),
    sections: cfg.sections.map((s) => [s.id, s.title, s.extras]),
    ep: [
      ep.resumePdf,
      ep.resumeJson,
      ep.contactVcf,
      ep.contactVcfFilename,
      ep.architecture,
      ep.quality,
      ep.qualityJson,
      ep.llmsTxt,
    ],
  };

  const siteConfigPlugin = {
    name: 'site-config',
    setup(build) {
      build.onResolve({ filter: /^site-config$/ }, () => ({
        path: 'site-config',
        namespace: 'site-config-ns',
      }));
      build.onLoad({ filter: /.*/, namespace: 'site-config-ns' }, () => ({
        contents: `export default ${JSON.stringify(compactConfig)};`,
        loader: 'js',
      }));
    },
  };

  const targets = [
    { file: 'theme-init.js', format: 'iife' },
    { file: 'theme.js', format: 'iife' },
    { file: 'command-menu.js', format: 'iife' },
    { file: 'command-menu-panel.js', format: 'esm' },
  ];

  await Promise.all(
    targets.map(async ({ file, format }) => {
      const entryPoint = path.join(assetsDir, 'js', file);
      if (!fs.existsSync(entryPoint)) return;
      const outfile = path.join(outSiteDir, 'assets', 'js', file);
      fs.mkdirSync(path.dirname(outfile), { recursive: true });
      await esbuild.build({
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        minify: true,
        format,
        target: 'es2020',
        charset: 'utf8',
        plugins: [siteConfigPlugin],
      });
    })
  );
}

if (isEntrypoint(import.meta.url)) {
  const cssOnly = process.argv.includes('--css');
  await minifyCssFiles();
  if (!cssOnly) {
    await minifyJsFiles();
  }
  console.log(
    cssOnly ? 'Minified CSS bundles via esbuild.' : 'Minified & bundled CSS/JS via esbuild.'
  );
}
