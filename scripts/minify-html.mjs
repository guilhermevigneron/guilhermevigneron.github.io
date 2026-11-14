export function minifyHtml(html) {
  const preserved = [];
  const tokenPrefix = '__HTML_MINIFY_PRESERVE_';
  const stripAroundTokens = new Set();

  let out = html.replace(
    /<(script|style|pre|textarea)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag, attrs, body) => {
      const lowerTag = tag.toLowerCase();
      let processed = full;
      if (lowerTag === 'script' && /application\/ld\+json/i.test(attrs)) {
        try {
          const safeJson = JSON.stringify(JSON.parse(body)).replace(/<\//g, '<\\/');
          processed = `<script${attrs}>${safeJson}</script>`;
        } catch {
          processed = full;
        }
      } else if (lowerTag === 'script') {
        processed = `<script${attrs}>${body.trim()}</script>`;
      } else if (lowerTag === 'style') {
        const compactStyle = body
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\s*\n\s*/g, ' ')
          .replace(/\s*([{}:;,])\s*/g, '$1')
          .replace(/;}/g, '}')
          .trim();
        processed = `<style${attrs}>${compactStyle}</style>`;
      }
      const index = preserved.length;
      if (lowerTag === 'script' || lowerTag === 'style') {
        stripAroundTokens.add(index);
      }
      preserved.push(processed);
      return `${tokenPrefix}${index}__`;
    }
  );

  out = out.replace(/<!--[\s\S]*?-->/g, '');
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

  preserved.forEach((chunk, index) => {
    out = out.replace(`${tokenPrefix}${index}__`, () => chunk);
  });

  return `${out.trim()}\n`;
}
