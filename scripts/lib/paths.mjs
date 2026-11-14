import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(LIB_DIR, '..', '..');
export const SITE_DIR = path.join(ROOT, '_site');
export const REPORTS_DIR = path.join(ROOT, '.ci-reports');
export const SRC_DIR = path.join(ROOT, 'src');
export const TEMPLATES_DIR = path.join(SRC_DIR, 'templates');
export const ASSETS_DIR = path.join(ROOT, 'assets');
export const RESUME_PATH = path.join(ROOT, 'resume.json');

export function resolveRootPaths(rootDir = ROOT) {
  return {
    rootDir,
    siteDir: path.join(rootDir, '_site'),
    reportsDir: path.join(rootDir, '.ci-reports'),
    srcDir: path.join(rootDir, 'src'),
    templatesDir: path.join(rootDir, 'src', 'templates'),
    assetsDir: path.join(rootDir, 'assets'),
    resumePath: path.join(rootDir, 'resume.json'),
  };
}

export function isEntrypoint(metaUrl) {
  return (
    Boolean(process.argv[1]) && metaUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href
  );
}
