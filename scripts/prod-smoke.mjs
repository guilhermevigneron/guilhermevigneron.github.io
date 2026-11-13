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
  assert.ok(homeHtml.includes('href="/resume.pdf"'), 'Homepage missing /resume.pdf link');
  assert.ok(homeHtml.includes('href="/quality/"'), 'Homepage missing /quality/ link');
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
  console.log('PASS / (200, strict CSP, zero third-party references)');

  // 2. Self-hosted CSS, fonts, icons & responsive avatar
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
  await checkEndpoint('/site.webmanifest', 200);
  console.log(`PASS ${cssMatch[1]}, Geist fonts, responsive avatar & icons`);

  // 3. Resume PDF
  const pdfRes = await checkEndpoint('/resume.pdf', 200);
  const pdfType = pdfRes.headers.get('content-type') || '';
  assert.ok(pdfType.includes('application/pdf'), `Unexpected PDF content-type: ${pdfType}`);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  assert.ok(pdfBuf.subarray(0, 5).equals(Buffer.from('%PDF-')), 'Invalid PDF magic bytes');
  assert.ok(pdfBuf.length > 5000, `Unexpectedly small PDF: ${pdfBuf.length} bytes`);
  console.log(`PASS /resume.pdf (${(pdfBuf.length / 1024).toFixed(1)} KB)`);

  // 4. Machine-readable endpoints
  const resumeJsonRes = await checkEndpoint('/resume.json', 200);
  const resumeJson = await resumeJsonRes.json();
  assert.equal(resumeJson.basics?.name, 'Guilherme Vigneron de Oliveira');

  const llmsRes = await checkEndpoint('/llms.txt', 200);
  const llmsText = await llmsRes.text();
  assert.ok(llmsText.includes('/resume.pdf'), 'llms.txt missing /resume.pdf');

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

  // 6. Quality report & Sitemap & 404
  const qualityRes = await checkEndpoint('/quality/', 200);
  const qualityHtml = await qualityRes.text();
  assert.ok(qualityHtml.includes('Quality &amp; Verification Report') || qualityHtml.includes('Quality & Verification Report'));
  const subpageCssMatch = qualityHtml.match(/<link rel="stylesheet" href="(\/assets\/css\/subpage(?:\.[a-f0-9]+)?\.css)">/);
  assert.ok(subpageCssMatch, '/quality/ missing compiled subpage stylesheet link');
  await checkEndpoint(subpageCssMatch[1], 200);
  await checkEndpoint('/sitemap.xml', 200);
  await checkEndpoint('/nonexistent-smoke-check-404', 404);
  console.log('PASS /quality/, /sitemap.xml, and 404 handling');

  console.log('All production smoke tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
