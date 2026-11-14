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

export function validatePdfBuffer(pdfBytes, maxPdfPages = 1, minBytes = 5000) {
  if (!Buffer.isBuffer(pdfBytes) || !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Generated resume.pdf does not start with %PDF- magic header');
  }
  if (pdfBytes.length < minBytes) {
    throw new Error(`Generated resume.pdf unexpectedly small (${pdfBytes.length} bytes)`);
  }

  const pdfLatin1 = pdfBytes.toString('latin1');
  const isTagged = /\/StructTreeRoot\b/.test(pdfLatin1);
  const hasType3Fonts = /\/Subtype\s*\/Type3\b/.test(pdfLatin1);
  const hasEmbeddedImages = /\/Subtype\s*\/Image\b/.test(pdfLatin1);
  const pageCount = countPdfPages(pdfBytes);

  if (!isTagged) {
    throw new Error(
      'Generated resume.pdf is missing /StructTreeRoot (tagged PDF required for ATS/a11y)'
    );
  }
  if (hasType3Fonts) {
    throw new Error(
      'Generated resume.pdf contains Type 3 fonts; use static TrueType/OpenType fonts in print CSS'
    );
  }
  if (hasEmbeddedImages) {
    throw new Error(
      'Generated resume.pdf contains embedded raster images; hide imagery in print CSS for ATS'
    );
  }
  if (pageCount < 1 || pageCount > maxPdfPages) {
    throw new Error(
      `Generated resume.pdf page count ${pageCount} violates maxPdfPages=${maxPdfPages}`
    );
  }

  return { isTagged, hasType3Fonts, hasEmbeddedImages, pageCount };
}
