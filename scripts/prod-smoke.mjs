import assert from 'node:assert/strict';

const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://guilhermevigneron.dev').replace(
  /\/$/,
  ''
);

async function checkEndpoint(path, expectedStatus = 200) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, { redirect: 'follow' });
  assert.equal(
    response.status,
    expectedStatus,
    `Expected HTTP ${expectedStatus} for ${url}, got ${response.status}`
  );
  return response;
}

async function main() {
  console.log(`Running production smoke tests against ${BASE_URL}...`);

  // 1. Homepage HTML & zero third-party CDNs
  const homeRes = await checkEndpoint('/', 200);
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes('Guilherme Vigneron de Oliveira'), 'Homepage missing name');
  assert.ok(homeHtml.includes('Selected Projects'), 'Homepage missing Selected Projects section');
  assert.ok(homeHtml.includes('href="/resume.pdf"'), 'Homepage missing /resume.pdf link');
  assert.ok(homeHtml.includes('href="/quality/"'), 'Homepage missing /quality/ link');
  assert.ok(homeHtml.includes('assets/og-card.png'), 'Homepage missing og-card.png meta tag');
  assert.ok(
    homeHtml.includes('http-equiv="Content-Security-Policy"'),
    'Homepage missing Content-Security-Policy meta tag'
  );
  assert.ok(
    homeHtml.includes('name="referrer"'),
    'Homepage missing referrer policy meta tag'
  );
  for (const banned of [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'drive.google.com',
  ]) {
    assert.ok(!homeHtml.includes(banned), `Homepage still references third-party host: ${banned}`);
  }
  console.log('PASS / (200, strict CSP, Selected Projects, OG card, zero third-party references)');

  // 2. Self-hosted CSS, JS, fonts, icons, responsive avatar & OG card
  const cssMatch = homeHtml.match(/<link rel="stylesheet" href="(\/assets\/css\/styles(?:\.[a-f0-9]+)?\.css)">/);
  assert.ok(cssMatch, 'Homepage missing compiled stylesheet link');
  const activeCssRes = await checkEndpoint(cssMatch[1], 200);
  const activeCssText = await activeCssRes.text();
  assert.ok(activeCssText.includes('.icon-btn svg'), 'Active CSS missing .icon-btn svg rule');
  await checkEndpoint('/assets/css/styles.css', 200);
  await checkEndpoint('/assets/css/subpage.css', 200);
  await checkEndpoint('/assets/css/print.css', 200);
  await checkEndpoint('/assets/fonts/GeistMono-Variable.woff2', 200);
  await checkEndpoint('/assets/fonts/GeistPixel-Square.woff2', 200);
  await checkEndpoint('/assets/avatar.jpg', 200);
  await checkEndpoint('/assets/avatar-224.avif', 200);
  await checkEndpoint('/assets/favicon.svg', 200);
  await checkEndpoint('/favicon.ico', 200);

  const manifestRes = await checkEndpoint('/site.webmanifest', 200);
  const manifest = await manifestRes.json();
  assert.ok(
    manifest.description?.includes('Principal Technologist'),
    'site.webmanifest description out of sync'
  );

  const ogRes = await checkEndpoint('/assets/og-card.png', 200);
  const ogType = ogRes.headers.get('content-type') || '';
  assert.ok(ogType.includes('image/png'), `Unexpected OG card content-type: ${ogType}`);
  const ogBuf = Buffer.from(await ogRes.arrayBuffer());
  assert.ok(
    ogBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'Invalid PNG signature for /assets/og-card.png'
  );
  assert.ok(ogBuf.length > 5000, `Unexpectedly small OG card: ${ogBuf.length} bytes`);
  console.log(`PASS ${cssMatch[1]}, Geist fonts, avatar, manifest & og-card.png (${(ogBuf.length / 1024).toFixed(1)} KB)`);

  // 3. Resume PDF (valid binary + 1 page)
  const pdfRes = await checkEndpoint('/resume.pdf', 200);
  const pdfType = pdfRes.headers.get('content-type') || '';
  assert.ok(pdfType.includes('application/pdf'), `Unexpected PDF content-type: ${pdfType}`);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  assert.ok(pdfBuf.subarray(0, 5).equals(Buffer.from('%PDF-')), 'Invalid PDF magic bytes');
  assert.ok(pdfBuf.length > 5000, `Unexpectedly small PDF: ${pdfBuf.length} bytes`);
  const pdfText = pdfBuf.toString('latin1');
  const pagesMatch = pdfText.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d+)/);
  const pdfPages = pagesMatch ? Number(pagesMatch[1]) : 0;
  assert.equal(pdfPages, 1, `Expected 1-page PDF, got ${pdfPages}`);
  console.log(`PASS /resume.pdf (${pdfPages} page, ${(pdfBuf.length / 1024).toFixed(1)} KB)`);

  // 4. Machine-readable endpoints
  const resumeJsonRes = await checkEndpoint('/resume.json', 200);
  const resumeJson = await resumeJsonRes.json();
  assert.equal(resumeJson.basics?.name, 'Guilherme Vigneron de Oliveira');
  assert.ok(Array.isArray(resumeJson.projects) && resumeJson.projects.length >= 1, 'resume.json missing projects');

  const llmsRes = await checkEndpoint('/llms.txt', 200);
  const llmsText = await llmsRes.text();
  assert.ok(llmsText.includes('/resume.pdf'), 'llms.txt missing /resume.pdf');
  assert.ok(llmsText.includes('/contact.vcf'), 'llms.txt missing /contact.vcf');
  assert.ok(llmsText.includes('/quality/report.json'), 'llms.txt missing /quality/report.json');

  const vcfRes = await checkEndpoint('/contact.vcf', 200);
  const vcfText = await vcfRes.text();
  assert.ok(vcfText.includes('BEGIN:VCARD'), 'contact.vcf missing BEGIN:VCARD');
  assert.ok(vcfText.includes('FN:Guilherme Vigneron de Oliveira'), 'contact.vcf missing FN');

  // 5. RFC 9116 security.txt & >= 30d expiry
  const secRes = await checkEndpoint('/.well-known/security.txt', 200);
  const secText = await secRes.text();
  assert.match(secText, /^Contact:\s*mailto:/m);
  assert.match(secText, /^Canonical:\s*https:\/\/guilhermevigneron\.dev\/\.well-known\/security\.txt$/m);
  assert.match(secText, /^Preferred-Languages:\s*en,\s*pt$/m);
  const expMatch = secText.match(/^Expires:\s*(.+)$/m);
  assert.ok(expMatch, 'security.txt missing Expires field');
  const daysRemaining = (Date.parse(expMatch[1].trim()) - Date.now()) / (1000 * 60 * 60 * 24);
  assert.ok(
    daysRemaining >= 30,
    `security.txt Expires is less than 30 days away (${daysRemaining.toFixed(1)} days remaining)`
  );
  console.log(`PASS /.well-known/security.txt (${Math.floor(daysRemaining)} days remaining)`);

  // 6. Quality report HTML & JSON + Sitemap + 404
  const qualityRes = await checkEndpoint('/quality/', 200);
  const qualityHtml = await qualityRes.text();
  assert.ok(qualityHtml.includes('Quality &amp; Verification Report') || qualityHtml.includes('Quality & Verification Report'));
  const subpageCssMatch = qualityHtml.match(/<link rel="stylesheet" href="(\/assets\/css\/subpage(?:\.[a-f0-9]+)?\.css)">/);
  assert.ok(subpageCssMatch, '/quality/ missing compiled subpage stylesheet link');
  await checkEndpoint(subpageCssMatch[1], 200);

  const qualityJsonRes = await checkEndpoint('/quality/report.json', 200);
  const qualityJson = await qualityJsonRes.json();
  assert.equal(qualityJson.schemaVersion, 1);
  assert.ok(Array.isArray(qualityJson.gates) && qualityJson.gates.length >= 8, 'quality/report.json missing gates');
  const failingGates = qualityJson.gates.filter((g) => g.status === 'fail');
  assert.equal(failingGates.length, 0, `Failing gates in production report.json: ${JSON.stringify(failingGates)}`);

  const sitemapRes = await checkEndpoint('/sitemap.xml', 200);
  const sitemapText = await sitemapRes.text();
  assert.ok(sitemapText.includes('/contact.vcf'), 'sitemap.xml missing /contact.vcf');
  assert.ok(sitemapText.includes('/architecture/'), 'sitemap.xml missing /architecture/');
  assert.ok(sitemapText.includes('/quality/report.json'), 'sitemap.xml missing /quality/report.json');

  const archRes = await checkEndpoint('/architecture/', 200);
  const archHtml = await archRes.text();
  assert.ok(archHtml.includes('Architecture Overview'), '/architecture/ missing heading');
  const archCssMatch = archHtml.match(/<link rel="stylesheet" href="(\/assets\/css\/subpage(?:\.[a-f0-9]+)?\.css)">/);
  assert.ok(archCssMatch, '/architecture/ missing compiled subpage stylesheet link');
  await checkEndpoint(archCssMatch[1], 200);

  await checkEndpoint('/nonexistent-smoke-check-404', 404);
  console.log('PASS /quality/, /quality/report.json, /architecture/, /contact.vcf, /sitemap.xml, and 404 handling');

  console.log('All production smoke tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
