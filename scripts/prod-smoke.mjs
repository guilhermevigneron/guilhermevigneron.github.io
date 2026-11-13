import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { countPdfPages } from './lib/pdf.mjs';

const ROOT = process.cwd();
const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
const canonicalUrl = String(resume.meta?.canonical || resume.basics?.url || 'https://guilhermevigneron.dev').replace(
  /\/$/,
  ''
);
const BASE_URL = (process.env.SMOKE_BASE_URL || canonicalUrl).replace(/\/$/, '');

async function checkEndpoint(endpointPath, expectedStatus = 200) {
  const url = `${BASE_URL}${endpointPath}`;
  const response = await fetch(url, { redirect: 'follow' });
  assert.equal(
    response.status,
    expectedStatus,
    `Expected HTTP ${expectedStatus} for ${url}, got ${response.status}`
  );
  return response;
}

async function checkSubpageAssets(html, routeLabel) {
  const subpageCssMatch = html.match(
    /<link rel="stylesheet" href="(\/assets\/css\/subpage(?:\.[a-f0-9]+)?\.css)">/
  );
  assert.ok(subpageCssMatch, `${routeLabel} missing compiled subpage stylesheet link`);
  await checkEndpoint(subpageCssMatch[1], 200);

  const cmdJsMatch = html.match(
    /<script src="(\/assets\/js\/command-menu(?:\.[a-f0-9]+)?\.js)"/
  );
  assert.ok(cmdJsMatch, `${routeLabel} missing command-menu loader script`);
  await checkEndpoint(cmdJsMatch[1], 200);
}

async function main() {
  console.log(`Running production smoke tests against ${BASE_URL}...`);
  const ownerName = resume.basics.name;
  const maxPdfPages = Number(resume.meta?.maxPdfPages || 1);

  // 1. Homepage HTML & zero third-party CDNs
  const homeRes = await checkEndpoint('/', 200);
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes(ownerName), 'Homepage missing owner name');
  assert.ok(homeHtml.includes('Selected Projects'), 'Homepage missing Selected Projects section');
  assert.ok(homeHtml.includes('href="/resume.pdf"'), 'Homepage missing /resume.pdf link');
  assert.ok(homeHtml.includes('href="/quality/"'), 'Homepage missing /quality/ link');
  assert.ok(homeHtml.includes('href="/architecture/"'), 'Homepage missing /architecture/ link');
  assert.ok(homeHtml.includes('assets/og-card'), 'Homepage missing og-card meta tag');
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

  // 2. Self-hosted CSS, JS (including lazy command-menu panel), fonts, icons, avatar & OG card
  const cssMatch = homeHtml.match(
    /<link rel="stylesheet" href="(\/assets\/css\/styles(?:\.[a-f0-9]+)?\.css)">/
  );
  assert.ok(cssMatch, 'Homepage missing compiled stylesheet link');
  const activeCssRes = await checkEndpoint(cssMatch[1], 200);
  const activeCssText = await activeCssRes.text();
  assert.ok(activeCssText.includes('.icon-btn svg'), 'Active CSS missing .icon-btn svg rule');

  const themeInitMatch = homeHtml.match(
    /<script src="(\/assets\/js\/theme-init(?:\.[a-f0-9]+)?\.js)"/
  );
  assert.ok(themeInitMatch, 'Homepage missing theme-init.js script');
  await checkEndpoint(themeInitMatch[1], 200);

  const themeMatch = homeHtml.match(/<script src="(\/assets\/js\/theme(?:\.[a-f0-9]+)?\.js)"/);
  assert.ok(themeMatch, 'Homepage missing theme.js script');
  await checkEndpoint(themeMatch[1], 200);

  const cmdLoaderMatch = homeHtml.match(
    /<script src="(\/assets\/js\/command-menu(?:\.[a-f0-9]+)?\.js)"/
  );
  assert.ok(cmdLoaderMatch, 'Homepage missing command-menu.js script');
  const cmdLoaderRes = await checkEndpoint(cmdLoaderMatch[1], 200);
  const cmdLoaderJs = await cmdLoaderRes.text();
  const cmdPanelMatch = cmdLoaderJs.match(/\/assets\/js\/command-menu-panel(?:\.[a-f0-9]+)?\.js/);
  assert.ok(cmdPanelMatch, 'command-menu loader missing command-menu-panel reference');
  const cmdPanelRes = await checkEndpoint(cmdPanelMatch[0], 200);
  const cmdPanelJs = await cmdPanelRes.text();
  assert.ok(cmdPanelJs.includes('initCommandMenuPanel'), 'command-menu-panel missing export');

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
  assert.equal(manifest.short_name, resume.meta?.shortName || ownerName);
  assert.equal(manifest.description, resume.meta?.manifestDescription || resume.basics.label);

  const ogRes = await checkEndpoint('/assets/og-card.png', 200);
  const ogType = ogRes.headers.get('content-type') || '';
  assert.ok(ogType.includes('image/png'), `Unexpected OG card content-type: ${ogType}`);
  const ogBuf = Buffer.from(await ogRes.arrayBuffer());
  assert.ok(
    ogBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'Invalid PNG signature for /assets/og-card.png'
  );
  assert.ok(ogBuf.length > 5000, `Unexpectedly small OG card: ${ogBuf.length} bytes`);
  console.log(
    `PASS ${cssMatch[1]}, ${cmdPanelMatch[0]}, Geist fonts, avatar, manifest & og-card.png (${(ogBuf.length / 1024).toFixed(1)} KB)`
  );

  // 3. Resume PDF (valid binary + <= maxPdfPages)
  const pdfRes = await checkEndpoint('/resume.pdf', 200);
  const pdfType = pdfRes.headers.get('content-type') || '';
  assert.ok(pdfType.includes('application/pdf'), `Unexpected PDF content-type: ${pdfType}`);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  assert.ok(pdfBuf.subarray(0, 5).equals(Buffer.from('%PDF-')), 'Invalid PDF magic bytes');
  assert.ok(pdfBuf.length > 5000, `Unexpectedly small PDF: ${pdfBuf.length} bytes`);
  const pdfPages = countPdfPages(pdfBuf);
  assert.ok(
    pdfPages >= 1 && pdfPages <= maxPdfPages,
    `Expected 1..${maxPdfPages}-page PDF, got ${pdfPages}`
  );
  console.log(`PASS /resume.pdf (${pdfPages} page, ${(pdfBuf.length / 1024).toFixed(1)} KB)`);

  // 4. Machine-readable endpoints
  const resumeJsonRes = await checkEndpoint('/resume.json', 200);
  const resumeJson = await resumeJsonRes.json();
  assert.equal(resumeJson.basics?.name, ownerName);
  assert.ok(
    Array.isArray(resumeJson.projects) && resumeJson.projects.length >= 1,
    'resume.json missing projects'
  );

  const llmsRes = await checkEndpoint('/llms.txt', 200);
  const llmsText = await llmsRes.text();
  assert.ok(llmsText.includes('/resume.pdf'), 'llms.txt missing /resume.pdf');
  assert.ok(llmsText.includes('/contact.vcf'), 'llms.txt missing /contact.vcf');
  assert.ok(llmsText.includes('/architecture/'), 'llms.txt missing /architecture/');
  assert.ok(llmsText.includes('/quality/report.json'), 'llms.txt missing /quality/report.json');

  const vcfRes = await checkEndpoint('/contact.vcf', 200);
  const vcfText = await vcfRes.text();
  assert.ok(vcfText.includes('BEGIN:VCARD'), 'contact.vcf missing BEGIN:VCARD');
  assert.ok(vcfText.includes(`FN:${ownerName}`), 'contact.vcf missing FN');

  // 5. RFC 9116 security.txt & >= 30d expiry
  const secRes = await checkEndpoint('/.well-known/security.txt', 200);
  const secText = await secRes.text();
  assert.ok(secText.includes(`Contact: mailto:${resume.basics.email}`), 'security.txt Contact mismatch');
  assert.ok(
    secText.includes(`Canonical: ${canonicalUrl}/.well-known/security.txt`),
    'security.txt Canonical mismatch'
  );
  assert.match(secText, /^Preferred-Languages:\s*en,\s*pt$/m);
  const expMatch = secText.match(/^Expires:\s*(.+)$/m);
  assert.ok(expMatch, 'security.txt missing Expires field');
  const daysRemaining = (Date.parse(expMatch[1].trim()) - Date.now()) / (1000 * 60 * 60 * 24);
  assert.ok(
    daysRemaining >= 30,
    `security.txt Expires is less than 30 days away (${daysRemaining.toFixed(1)} days remaining)`
  );
  console.log(`PASS /.well-known/security.txt (${Math.floor(daysRemaining)} days remaining)`);

  // 6. Quality report HTML & JSON + Architecture + Sitemap + 404
  const qualityRes = await checkEndpoint('/quality/', 200);
  const qualityHtml = await qualityRes.text();
  assert.ok(
    qualityHtml.includes('Quality &amp; Verification Report') ||
      qualityHtml.includes('Quality & Verification Report')
  );
  await checkSubpageAssets(qualityHtml, '/quality/');

  const qualityJsonRes = await checkEndpoint('/quality/report.json', 200);
  const qualityJson = await qualityJsonRes.json();
  assert.equal(qualityJson.schemaVersion, 1);
  assert.ok(
    Array.isArray(qualityJson.gates) && qualityJson.gates.length >= 9,
    'quality/report.json missing gates'
  );
  assert.equal(
    qualityJson.overallStatus,
    'pass',
    `Expected quality report overallStatus === 'pass', got '${qualityJson.overallStatus}'`
  );

  const sitemapRes = await checkEndpoint('/sitemap.xml', 200);
  const sitemapText = await sitemapRes.text();
  assert.ok(sitemapText.includes(`${canonicalUrl}/`), 'sitemap.xml missing homepage');
  assert.ok(sitemapText.includes(`${canonicalUrl}/contact.vcf`), 'sitemap.xml missing /contact.vcf');
  assert.ok(sitemapText.includes(`${canonicalUrl}/architecture/`), 'sitemap.xml missing /architecture/');
  assert.ok(sitemapText.includes(`${canonicalUrl}/quality/report.json`), 'sitemap.xml missing /quality/report.json');

  const archRes = await checkEndpoint('/architecture/', 200);
  const archHtml = await archRes.text();
  assert.ok(archHtml.includes('Architecture Overview'), '/architecture/ missing heading');
  await checkSubpageAssets(archHtml, '/architecture/');

  const direct404Res = await checkEndpoint('/404.html', 200);
  const direct404Html = await direct404Res.text();
  assert.ok(direct404Html.includes('Page Not Found'), '/404.html missing heading');
  await checkSubpageAssets(direct404Html, '/404.html');

  await checkEndpoint('/nonexistent-smoke-check-404', 404);
  console.log(
    'PASS /quality/, /quality/report.json (overallStatus=pass), /architecture/, /contact.vcf, /sitemap.xml, /404.html, and 404 handling'
  );

  console.log('All production smoke tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
