export function countPdfPages(pdfBuffer) {
  const text = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('latin1') : String(pdfBuffer);
  const pagesDictMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d+)/);
  if (pagesDictMatch) {
    return Number(pagesDictMatch[1]);
  }
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  return pageMatches ? pageMatches.length : 0;
}
