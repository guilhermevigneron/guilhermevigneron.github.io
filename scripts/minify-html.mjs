import fs from 'node:fs';
import path from 'node:path';
import { isEntrypoint, SITE_DIR } from './lib/paths.mjs';

function stripCssComments(css) {
  let out = '';
  let pos = 0;
  while (pos < css.length) {
    const start = css.indexOf('/*', pos);
    if (start === -1) {
      out += css.slice(pos);
      break;
    }
    out += css.slice(pos, start);
    const end = css.indexOf('*/', start + 2);
    if (end === -1) break;
    pos = end + 2;
  }
  return out;
}

function isTagBoundary(ch) {
  return ch === '>' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/';
}

function scanAndPreserveBlocks(html) {
  const preserved = [];
  const stripAroundTokens = new Set();
  const tokenPrefix = '__HTML_MINIFY_PRESERVE_';
  const lower = html.toLowerCase();
  const rawTags = ['script', 'style', 'pre', 'textarea'];

  let out = '';
  let pos = 0;

  while (pos < html.length) {
    const lt = html.indexOf('<', pos);
    if (lt === -1) {
      out += html.slice(pos);
      break;
    }

    if (lower.startsWith('<!--', lt)) {
      out += html.slice(pos, lt);
      const commentEnd = html.indexOf('-->', lt + 4);
      pos = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    let matchedTag = null;
    for (const tag of rawTags) {
      if (lower.startsWith(`<${tag}`, lt)) {
        const boundaryChar = html[lt + 1 + tag.length];
        if (boundaryChar && isTagBoundary(boundaryChar)) {
          matchedTag = tag;
          break;
        }
      }
    }

    if (!matchedTag) {
      out += html.slice(pos, lt + 1);
      pos = lt + 1;
      continue;
    }

    const openEnd = html.indexOf('>', lt + 1 + matchedTag.length);
    if (openEnd === -1) {
      out += html.slice(pos);
      break;
    }

    const closeNeedle = `</${matchedTag}`;
    let searchFrom = openEnd + 1;
    let closeStart = -1;
    let closeEnd = -1;

    while (searchFrom < html.length) {
      const candidate = lower.indexOf(closeNeedle, searchFrom);
      if (candidate === -1) break;
      const afterName = html[candidate + closeNeedle.length];
      if (afterName === '>' || (afterName && /\s/.test(afterName))) {
        const gt = html.indexOf('>', candidate + closeNeedle.length);
        if (gt !== -1) {
          closeStart = candidate;
          closeEnd = gt + 1;
          break;
        }
      }
      searchFrom = candidate + 1;
    }

    if (closeStart === -1) {
      out += html.slice(pos);
      break;
    }

    out += html.slice(pos, lt);

    const attrs = html.slice(lt + 1 + matchedTag.length, openEnd);
    const body = html.slice(openEnd + 1, closeStart);
    const full = html.slice(lt, closeEnd);

    let processed = full;
    if (matchedTag === 'script' && /application\/ld\+json/i.test(attrs)) {
      try {
        const safeJson = JSON.stringify(JSON.parse(body)).replace(/<\//g, '<\\/');
        processed = `<script${attrs}>${safeJson}</script>`;
      } catch {
        processed = full;
      }
    } else if (matchedTag === 'script') {
      processed = `<script${attrs}>${body.trim()}</script>`;
    } else if (matchedTag === 'style') {
      const compactStyle = stripCssComments(body)
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
      processed = `<style${attrs}>${compactStyle}</style>`;
    }

    const index = preserved.length;
    if (matchedTag === 'script' || matchedTag === 'style') {
      stripAroundTokens.add(index);
    }
    preserved.push(processed);
    out += `${tokenPrefix}${index}__`;
    pos = closeEnd;
  }

  return { out, preserved, stripAroundTokens, tokenPrefix };
}

export function minifyHtml(html) {
  const { out: scanned, preserved, stripAroundTokens, tokenPrefix } = scanAndPreserveBlocks(html);
  let out = scanned;

  out = out.replace(/\s*\n\s*/g, ' ');
  out = out.replace(/[ \t]{2,}/g, ' ');

  const blockTags =
    'html|head|meta|link|title|body|main|header|section|footer|div|ul|ol|li|article|nav|h[1-6]|p|picture|source|img|button|script|path|circle|rect';
  const openBlockRe = new RegExp(`>\\s+(?=<(?:${blockTags})\\b)`, 'gi');
  const openContainerRe = new RegExp(`(<(?:${blockTags})\\b[^>]*>)\\s+(?=<)`, 'gi');
  const closeBlockRe = new RegExp(`</(${blockTags})>\\s+(?=<)`, 'gi');
  const beforeCloseBlockRe = new RegExp(`>\\s+(?=</(?:${blockTags})\\b)`, 'gi');

  out = out.replace(openBlockRe, '>');
  out = out.replace(openContainerRe, '$1');
  out = out.replace(closeBlockRe, '</$1>');
  out = out.replace(beforeCloseBlockRe, '>');
  out = out.replace(/>\s+(__HTML_MINIFY_PRESERVE_(\d+)__)/g, (m, token, idx) =>
    stripAroundTokens.has(Number(idx)) ? `>${token}` : m
  );
  out = out.replace(
    /(__HTML_MINIFY_PRESERVE_(\d+)__)\s+(?=<|__HTML_MINIFY_PRESERVE_)/g,
    (m, token, idx) => (stripAroundTokens.has(Number(idx)) ? token : m)
  );

  for (let i = 0; i < preserved.length; i += 1) {
    out = out.replace(`${tokenPrefix}${i}__`, () => preserved[i]);
  }

  return `${out.trim()}\n`;
}

if (isEntrypoint(import.meta.url)) {
  const htmlFiles = [
    path.join(SITE_DIR, 'index.html'),
    path.join(SITE_DIR, '404.html'),
    path.join(SITE_DIR, 'quality', 'index.html'),
    path.join(SITE_DIR, 'architecture', 'index.html'),
  ].filter((file) => fs.existsSync(file));

  for (const file of htmlFiles) {
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, minifyHtml(original), 'utf8');
  }

  console.log(`Minified ${htmlFiles.length} HTML files.`);
}
