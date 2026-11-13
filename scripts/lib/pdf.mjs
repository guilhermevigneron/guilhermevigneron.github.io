function formatPdfUtcDate(timestampMs, template) {
  const d = new Date(timestampMs);
  const pad2 = (n) => String(n).padStart(2, '0');
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());

  if (template.endsWith('Z')) {
    return `D:${y}${m}${day}${hh}${mm}${ss}Z`;
  }
  return `D:${y}${m}${day}${hh}${mm}${ss}+00'00'`;
}

export function normalizePdfTimestamps(pdfBuffer, timestampMs) {
  const latin1 = pdfBuffer.toString('latin1');
  const out = Buffer.from(pdfBuffer);
  const pattern = /(\/(?:CreationDate|ModDate)\s*\()([^)]*)(\))/g;

  for (const match of latin1.matchAll(pattern)) {
    const prefix = match[1];
    const origValue = match[2];
    const replacement = formatPdfUtcDate(timestampMs, origValue);
    if (replacement.length === origValue.length) {
      const valueOffset = match.index + prefix.length;
      out.write(replacement, valueOffset, origValue.length, 'latin1');
    }
  }
  return out;
}

export function countPdfPages(pdfBuffer) {
  const text = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('latin1') : String(pdfBuffer);
  const dictMatches = text.match(/<<[\s\S]{0,600}?>>/g) || [];
  let maxPagesCount = 0;
  for (const dict of dictMatches) {
    if (/\/Type\s*\/Pages\b/.test(dict)) {
      const countMatch = dict.match(/\/Count\s+(\d+)/);
      if (countMatch) {
        maxPagesCount = Math.max(maxPagesCount, Number(countMatch[1]));
      }
    }
  }
  if (maxPagesCount > 0) {
    return maxPagesCount;
  }
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  return pageMatches ? pageMatches.length : 0;
}

export function inspectPdfBuffer(pdfBuffer) {
  const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(String(pdfBuffer), 'latin1');
  const text = buf.toString('latin1');
  return {
    hasMagicHeader: buf.subarray(0, 5).equals(Buffer.from('%PDF-')),
    bytes: buf.length,
    tagged: /\/StructTreeRoot\b/.test(text),
    type3Fonts: /\/Subtype\s*\/Type3\b/.test(text),
    embeddedImages: /\/Subtype\s*\/Image\b/.test(text),
    pages: countPdfPages(buf),
  };
}

export function validatePdfBuffer(pdfBytes, maxPdfPages = 1, minBytes = 5000) {
  if (!Buffer.isBuffer(pdfBytes) || !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Generated resume.pdf does not start with %PDF- magic header');
  }
  if (pdfBytes.length < minBytes) {
    throw new Error(`Generated resume.pdf unexpectedly small (${pdfBytes.length} bytes)`);
  }

  const info = inspectPdfBuffer(pdfBytes);

  if (!info.tagged) {
    throw new Error(
      'Generated resume.pdf is missing /StructTreeRoot (tagged PDF required for ATS/a11y)'
    );
  }
  if (info.type3Fonts) {
    throw new Error(
      'Generated resume.pdf contains Type 3 fonts; use static TrueType/OpenType fonts in print CSS'
    );
  }
  if (info.embeddedImages) {
    throw new Error(
      'Generated resume.pdf contains embedded raster images; hide imagery in print CSS for ATS'
    );
  }
  if (info.pages < 1 || info.pages > maxPdfPages) {
    throw new Error(
      `Generated resume.pdf page count ${info.pages} violates maxPdfPages=${maxPdfPages}`
    );
  }

  return {
    isTagged: info.tagged,
    hasType3Fonts: info.type3Fonts,
    hasEmbeddedImages: info.embeddedImages,
    pageCount: info.pages,
  };
}
