export function minifyHtml(html) {
  const preserved = [];
  const tokenPrefix = '__HTML_MINIFY_PRESERVE_';

  let out = html.replace(
    /<(script|style|pre|textarea)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag, attrs, body) => {
      let processed = full;
      if (tag.toLowerCase() === 'script' && /application\/ld\+json/i.test(attrs)) {
        try {
          const safeJson = JSON.stringify(JSON.parse(body)).replace(/<\//g, '<\\/');
          processed = `<script${attrs}>${safeJson}</script>`;
        } catch {
          processed = full;
        }
      } else if (tag.toLowerCase() === 'script') {
        processed = `<script${attrs}>${body.trim()}</script>`;
      }
      const id = `${tokenPrefix}${preserved.length}__`;
      preserved.push(processed);
      return id;
    }
  );

  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/\s*\n\s*/g, ' ');
  out = out.replace(/[ \t]{2,}/g, ' ');

  const blockTags =
    'html|head|meta|link|title|body|main|header|section|footer|div|ul|ol|li|article|nav|h[1-6]|p|picture|source|script';
  const openBlockRe = new RegExp(`>\\s+<(${blockTags})\\b`, 'gi');
  const closeBlockRe = new RegExp(`</(${blockTags})>\\s+<`, 'gi');

  out = out.replace(openBlockRe, '><$1');
  out = out.replace(closeBlockRe, '</$1><');
  out = out.replace(/>\s+(__HTML_MINIFY_PRESERVE_\d+__)/g, '>$1');
  out = out.replace(/(__HTML_MINIFY_PRESERVE_\d+__)\s+</g, '$1<');

  preserved.forEach((chunk, index) => {
    out = out.replace(`${tokenPrefix}${index}__`, () => chunk);
  });

  return `${out.trim()}\n`;
}
