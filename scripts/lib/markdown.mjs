import { escapeHtml, sanitizeHref } from './html.mjs';

export function parseFrontmatter(raw) {
  const input = String(raw || '').replace(/\r\n/g, '\n');
  if (!input.startsWith('---\n')) {
    return { data: {}, content: input.trim() };
  }
  const endIdx = input.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    return { data: {}, content: input.trim() };
  }

  const fmBlock = input.slice(4, endIdx);
  const content = input.slice(endIdx + 5).trim();
  const data = {};
  let activeArrayKey = null;

  for (const rawLine of fmBlock.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (activeArrayKey && line.startsWith('- ')) {
      data[activeArrayKey].push(stripQuotes(line.slice(2).trim()));
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    activeArrayKey = null;

    if (!val) {
      data[key] = [];
      activeArrayKey = key;
    } else if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((item) => stripQuotes(item.trim()))
        .filter(Boolean);
    } else if (val === 'true') {
      data[key] = true;
    } else if (val === 'false') {
      data[key] = false;
    } else {
      data[key] = stripQuotes(val);
    }
  }

  return { data, content };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function estimateReadingTime(markdown) {
  const words = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_\-[\]()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function renderInline(text) {
  const codeSpans = [];
  let out = String(text || '').replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  const linkSpans = [];
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawHref) => {
    const href = sanitizeHref(rawHref, { allowRelative: true, allowMailto: true });
    const safeLabel = escapeHtml(label);
    if (!href) return safeLabel;
    const isExternal = /^https?:\/\//i.test(href);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    const idx = linkSpans.length;
    linkSpans.push(`<a href="${escapeHtml(href)}"${attrs}>${safeLabel}</a>`);
    return `\u0000LINK${idx}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional placeholder token
  out = out.replace(/\u0000LINK(\d+)\u0000/g, (_, idx) => linkSpans[Number(idx)] || '');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional placeholder token
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeSpans[Number(idx)] || '');
  return out;
}

export function renderMarkdown(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, Math.max(2, headingMatch[1].length));
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote><p>${renderInline(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ul>\n${items.join('\n')}\n</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ol>\n${items.join('\n')}\n</ol>`);
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
  }

  return html.join('\n');
}
