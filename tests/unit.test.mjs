import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import zlib from 'node:zlib';
import * as esbuild from 'esbuild';
import {
  BUDGETS,
  evaluateAssetBudgets,
  evaluateVitalsBudgets,
} from '../scripts/check-performance.mjs';
import { buildArchitecturePage } from '../scripts/generate-architecture.mjs';
import { evaluateQualityGates } from '../scripts/generate-quality-report.mjs';
import { escapeHtml, rewriteAssetRefs, sanitizeHref } from '../scripts/lib/html.mjs';
import { normalizeBaseUrl, toPathname } from '../scripts/lib/io.mjs';
import { ROOT } from '../scripts/lib/paths.mjs';
import {
  countPdfPages,
  inspectPdfBuffer,
  normalizePdfTimestamps,
  validatePdfBuffer,
} from '../scripts/lib/pdf.mjs';
import { normalizePng } from '../scripts/lib/png.mjs';
import { buildCommandMenuConfig } from '../scripts/lib/site-config.mjs';
import { minifyCssFiles, minifyJsFiles } from '../scripts/minify-assets.mjs';
import { minifyHtml } from '../scripts/minify-html.mjs';
import { validateHtmlFiles } from '../scripts/run-html-validate.mjs';
import { createStaticServer } from '../scripts/serve.mjs';
import {
  build404Html,
  buildCvContentHtml,
  buildIndexHtml,
  buildIndexMeta,
  buildJsonLd,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  buildSiteWebmanifest,
  buildVCard,
  computeYearsOfExperience,
  syncAllFromResume,
  syncSecurityTxt,
} from '../scripts/sync-resume.mjs';
import { resolveBrowser } from '../scripts/test-e2e.mjs';
import {
  stripNonContentBlocks,
  validateAllFromRoot,
  validateResumeSchema,
  validateSyncState,
} from '../scripts/validate-sync.mjs';

const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));

function withTempDir(prefix, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(prefix, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeMockPdf({
  header = '%PDF-1.7',
  dict = '<< /Type /Pages /Count 1 >>',
  extra = '/StructTreeRoot',
  totalBytes = 6000,
} = {}) {
  const body = `${header}\n1 0 obj\n${dict}\nendobj\n${extra}\n`;
  const padLen = Math.max(0, totalBytes - Buffer.byteLength(body, 'latin1'));
  return Buffer.from(`${body}${' '.repeat(padLen)}`, 'latin1');
}

function makeValidAssetSizes() {
  return {
    screenCssBytes: 8000,
    subpageCssBytes: 4000,
    printCssBytes: 2000,
    themeInitJsBytes: 400,
    themeJsBytes: 1200,
    commandMenuJsBytes: 1000,
    commandMenuPanelJsBytes: 8000,
    monoFontBytes: 12000,
    pixelFontBytes: 12000,
    indexHtmlBytes: 20000,
    notFoundHtmlBytes: 6000,
    avatarJpgBytes: 5000,
    avatarAvif224Bytes: 2500,
  };
}

function makeValidRepoInputs(overrides = {}) {
  return {
    resume: structuredClone(resume),
    indexHtml: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
    notFoundHtml: fs.readFileSync(path.join(ROOT, '404.html'), 'utf8'),
    llmsTxt: fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8'),
    webmanifest: JSON.parse(fs.readFileSync(path.join(ROOT, 'site.webmanifest'), 'utf8')),
    sitemapXml: fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'),
    robotsTxt: fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'),
    securityTxt: fs.readFileSync(path.join(ROOT, '.well-known', 'security.txt'), 'utf8'),
    commandPanelJs: fs.readFileSync(
      path.join(ROOT, 'assets', 'js', 'command-menu-panel.js'),
      'utf8'
    ),
    contactVcf: buildVCard(resume),
    currentYear: new Date().getUTCFullYear(),
    ...overrides,
  };
}

function copyRepoSyncFiles(tmpDir) {
  for (const file of [
    'resume.json',
    'index.html',
    '404.html',
    'llms.txt',
    'site.webmanifest',
    'sitemap.xml',
    'robots.txt',
  ]) {
    fs.copyFileSync(path.join(ROOT, file), path.join(tmpDir, file));
  }
  fs.mkdirSync(path.join(tmpDir, 'assets', 'js'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'assets', 'js', 'command-menu-panel.js'),
    path.join(tmpDir, 'assets', 'js', 'command-menu-panel.js')
  );
  fs.mkdirSync(path.join(tmpDir, '.well-known'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, '.well-known', 'security.txt'),
    path.join(tmpDir, '.well-known', 'security.txt')
  );
}

function httpRequest(port, reqPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: reqPath,
        method,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function buildTestPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  const crcValue = zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0;
  crcBuf.writeUInt32BE(crcValue, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

describe('sync-resume helpers', () => {
  it('computes years of experience from earliest work startDate and handles edge cases', () => {
    assert.equal(computeYearsOfExperience(resume, 2026), 18);
    assert.equal(computeYearsOfExperience({ work: [] }, 2026), null);
    assert.equal(computeYearsOfExperience({}, 2026), null);
    assert.equal(computeYearsOfExperience({ work: [{ startDate: 'invalid' }] }, 2026), null);
    assert.equal(computeYearsOfExperience({ work: [{ startDate: '2028-01' }] }, 2026), 1);
  });

  it('builds a valid RFC 2426 vCard 3.0 payload with 7 ADR fields and escaping', () => {
    const vcf = buildVCard(resume);
    assert.ok(vcf.includes('\r\n'));
    assert.ok(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
    assert.ok(vcf.includes(`FN:${resume.basics.name}\r\n`));
    assert.ok(vcf.includes(`EMAIL;TYPE=INTERNET:${resume.basics.email}\r\n`));
    assert.ok(vcf.includes(`URL:${resume.basics.url}\r\n`));
    assert.ok(vcf.includes('ADR;TYPE=HOME:;;;Austin;TX;;US\r\n'));
    assert.ok(vcf.trimEnd().endsWith('END:VCARD'));

    const customVcf = buildVCard({
      basics: {
        name: 'Ada; Lovelace\\II',
        email: 'ada@example.com',
        url: 'https://example.com',
        label: 'Mathematician, Pioneer\nLead\\1',
        location: { city: 'London, UK', region: 'Greater;London', countryCode: 'GB' },
      },
      work: [{ name: 'Past Co', endDate: '2020-01' }, { name: 'Engine; Labs, Inc.\\2' }],
      meta: { jobTitle: 'Lead, Systems; R&D' },
    });
    assert.ok(customVcf.includes('FN:Ada\\; Lovelace\\\\II\r\n'));
    assert.ok(customVcf.includes('ORG:Engine\\; Labs\\, Inc.\\\\2\r\n'));
    assert.ok(customVcf.includes('TITLE:Lead\\, Systems\\; R&D\r\n'));
    assert.ok(customVcf.includes('ADR;TYPE=HOME:;;;London\\, UK;Greater\\;London;;GB\r\n'));
    assert.ok(customVcf.includes('NOTE:Mathematician\\, Pioneer\\nLead\\\\1\r\n'));

    const minimalVcf = buildVCard({
      basics: { name: 'Ada', email: 'ada@example.com', url: 'https://example.com', label: 'Eng' },
      meta: { jobTitle: 'Engineer' },
    });
    assert.ok(minimalVcf.includes('N:;Ada;;;\r\n'));
    assert.ok(minimalVcf.includes('ORG:\r\n'));
    assert.ok(minimalVcf.includes('ADR;TYPE=HOME:;;;;;;\r\n'));
  });

  it('builds Schema.org @graph JSON-LD with WebSite, ProfilePage, Person, and Articles', () => {
    const ld = buildJsonLd(resume);
    assert.equal(ld['@context'], 'https://schema.org');
    assert.ok(Array.isArray(ld['@graph']));
    const website = ld['@graph'].find((n) => n['@type'] === 'WebSite');
    const profilePage = ld['@graph'].find((n) => n['@type'] === 'ProfilePage');
    const person = ld['@graph'].find((n) => n['@type'] === 'Person');
    assert.ok(website && profilePage && person);
    assert.equal(profilePage.mainEntity['@id'], person['@id']);
    assert.equal(person.name, resume.basics.name);
    assert.equal(person.worksFor.name, resume.work[0].name);
    const schoolNames = person.alumniOf.map((s) => s.name);
    assert.equal(new Set(schoolNames).size, schoolNames.length);
    assert.ok(person.award.includes(resume.awards[0].title));
    assert.ok(Array.isArray(person.knowsLanguage) && person.knowsLanguage.length > 0);

    const noCurrentJob = buildJsonLd({
      ...resume,
      work: [{ name: 'Past Corp', startDate: '2020-01', endDate: '2022-01' }],
      languages: [],
    });
    const noJobPerson = noCurrentJob['@graph'].find((n) => n['@type'] === 'Person');
    assert.equal(noJobPerson.worksFor, undefined);
    assert.equal('knowsLanguage' in noJobPerson, false);
  });

  it('builds llms.txt, robots.txt, sitemap.xml, and syncs security.txt', () => {
    const txt = buildLlmsTxt(resume);
    assert.ok(txt.includes(`# ${resume.basics.name}`));
    assert.ok(txt.includes('## Experience'));
    assert.ok(txt.includes('## Selected Projects'));
    assert.ok(txt.includes('## Languages'));
    assert.ok(txt.includes('## Machine-Readable & Verification Endpoints'));
    assert.ok(txt.includes('/resume.pdf'));
    assert.ok(txt.includes('/contact.vcf'));
    assert.ok(txt.includes('/architecture/'));
    assert.ok(txt.includes('/quality/report.json'));

    const noLangTxt = buildLlmsTxt({
      ...resume,
      languages: [],
      awards: [{ title: 'Award One', awarder: 'Org' }],
    });
    assert.equal(noLangTxt.includes('## Languages'), false);
    assert.ok(noLangTxt.includes('- Award One (Org)'));

    const robots = buildRobotsTxt({ basics: { url: 'https://example.dev/' } });
    assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://example.dev/sitemap.xml\n');

    const sitemap = buildSitemapXml({
      ...resume,
      basics: { ...resume.basics, url: 'https://example.dev/' },
      meta: {
        ...resume.meta,
        canonical: 'https://example.dev/',
        resumePdfUrl: 'https://example.dev/resume.pdf',
        resumeJsonUrl: 'https://example.dev/resume.json',
        contactVcfUrl: 'https://example.dev/contact.vcf',
        qualityReportUrl: 'https://example.dev/quality/',
        qualityReportJsonUrl: 'https://example.dev/quality/report.json',
      },
    });
    assert.ok(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(sitemap.includes('<loc>https://example.dev/</loc>'));
    assert.ok(sitemap.includes('<loc>https://example.dev/resume.pdf</loc>'));
    assert.ok(sitemap.includes('<loc>https://example.dev/architecture/</loc>'));
    assert.ok(sitemap.includes('<loc>https://example.dev/quality/</loc>'));
    assert.ok(!sitemap.includes('/contact.vcf'));
    assert.ok(!sitemap.includes('/quality/report.json'));

    const secOut = syncSecurityTxt(
      'Contact: mailto:old@example.com\nExpires: 2027-01-01T00:00:00.000Z\nCanonical: https://old.example/.well-known/security.txt\n',
      resume
    );
    assert.ok(secOut.includes(`Contact: mailto:${resume.basics.email}`));
    assert.ok(secOut.includes(`Canonical: ${resume.basics.url}/.well-known/security.txt`));

    const panelCfg = buildCommandMenuConfig(resume);
    assert.equal(panelCfg.email, resume.basics.email);
    assert.equal(
      panelCfg.sections.some((s) => s.id === 'languages'),
      true
    );

    const panelCfgNoLang = buildCommandMenuConfig({ ...resume, languages: [] });
    assert.equal(
      panelCfgNoLang.sections.some((s) => s.id === 'languages'),
      false
    );
  });

  it('builds escaped SEO metadata tags in buildIndexMeta', () => {
    const custom = structuredClone(resume);
    custom.basics.name = 'Alice "The <Bold> & Wise" Smith';
    custom.meta.pageTitle = 'Alice & Co <Title> "Quote"';
    custom.meta.metaDescription = 'Summary with <tag> & "quotes"';
    const metaHtml = buildIndexMeta(custom);
    assert.ok(metaHtml.includes('<title>Alice &amp; Co &lt;Title&gt; &quot;Quote&quot;</title>'));
    assert.ok(metaHtml.includes('content="Summary with &lt;tag&gt; &amp; &quot;quotes&quot;"'));
    assert.ok(metaHtml.includes('property="profile:first_name" content="Alice"'));
    assert.ok(!metaHtml.includes('<tag>'));
  });

  it('renders CV HTML safely without .tag-sep spans and respects showInPrint and escaping', () => {
    const canonicalHtml = buildCvContentHtml({
      ...resume,
      basics: {
        ...resume.basics,
        name: 'Test <script>User</script>',
      },
      awards: [{ title: 'Honor', date: '2025-07-01' }],
      languages: [],
    });
    assert.ok(!canonicalHtml.includes('<script>User</script>'));
    assert.ok(canonicalHtml.includes('Test &lt;script&gt;User&lt;/script&gt;'));
    assert.ok(!canonicalHtml.includes('tag-sep'));
    assert.ok(canonicalHtml.includes('id="about" tabindex="-1"'));
    assert.ok(
      canonicalHtml.includes(
        'id="projects" aria-labelledby="projects-heading" class="cv-section animate-fade-in delay-3 no-print"'
      )
    );
    assert.ok(!canonicalHtml.includes('id="languages"'));

    const mixedProjectsHtml = buildCvContentHtml({
      ...resume,
      basics: {
        ...resume.basics,
        summary: 'Safe & <script>alert(1)</script> "text"',
      },
      projects: [
        {
          name: 'Proj A',
          subtitle: 'Sub A',
          description: 'Desc A',
          url: 'https://example.com/a',
          showInPrint: true,
          links: [{ url: '/quality/', label: 'Quality' }],
          highlights: ['Highlight A'],
          keywords: ['Node'],
        },
        {
          name: 'Proj B',
          subtitle: 'Sub B',
          description: 'Desc B',
          url: 'https://example.com/b',
          showInPrint: false,
        },
      ],
    });
    assert.ok(
      mixedProjectsHtml.includes(
        'Safe &amp; &lt;script&gt;alert(1)&lt;/script&gt; &quot;text&quot;'
      )
    );
    assert.ok(!mixedProjectsHtml.includes('<script>alert(1)</script>'));
    assert.ok(
      !mixedProjectsHtml.includes(
        'id="projects" aria-labelledby="projects-heading" class="cv-section animate-fade-in delay-3 no-print"'
      )
    );
    assert.ok(mixedProjectsHtml.includes('<article class="no-print">'));
    assert.ok(mixedProjectsHtml.includes('href="/quality/" class="inline-link">Quality</a>'));
  });

  it('builds site.webmanifest and 404.html accurately', () => {
    const manifestRaw = buildSiteWebmanifest(resume, {
      short_name: 'Old',
      icons: [{ src: '/assets/icon-192.png' }],
    });
    const manifest = JSON.parse(manifestRaw);
    assert.equal(manifest.name, resume.basics.name);
    assert.equal(manifest.short_name, resume.meta.shortName);
    assert.equal(manifest.description, resume.meta.manifestDescription);
    assert.equal(manifest.icons.length, 1);

    const notFoundHtml = build404Html(
      {
        ...resume,
        basics: { ...resume.basics, label: 'Security & Systems <Lead>' },
      },
      { year: 2026 }
    );
    assert.ok(notFoundHtml.includes('<meta name="robots" content="noindex">'));
    assert.ok(notFoundHtml.includes('Security &amp; Systems &lt;Lead&gt;'));
    assert.ok(notFoundHtml.includes('2026 '));
    assert.ok(notFoundHtml.includes('href="/resume.pdf"'));
    assert.ok(notFoundHtml.includes('href="/quality/"'));
  });

  it('runs syncAllFromResume idempotently in a temp directory', () => {
    withTempDir('sync-resume-test-', (tmpDir) => {
      copyRepoSyncFiles(tmpDir);
      fs.mkdirSync(path.join(tmpDir, 'src', 'templates'), { recursive: true });
      fs.copyFileSync(
        path.join(ROOT, 'src', 'templates', 'index.html'),
        path.join(tmpDir, 'src', 'templates', 'index.html')
      );

      syncAllFromResume(tmpDir);
      const syncedIndex = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf8');
      const syncedNotFound = fs.readFileSync(path.join(tmpDir, '404.html'), 'utf8');
      syncAllFromResume(tmpDir);
      assert.equal(fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf8'), syncedIndex);
      assert.equal(fs.readFileSync(path.join(tmpDir, '404.html'), 'utf8'), syncedNotFound);

      const mutatedResume = structuredClone(resume);
      mutatedResume.basics.label = 'Principal Architect | Verification Systems';
      mutatedResume.basics.email = 'updated@example.com';
      mutatedResume.languages = [];
      fs.writeFileSync(
        path.join(tmpDir, 'resume.json'),
        JSON.stringify(mutatedResume, null, 2),
        'utf8'
      );
      syncAllFromResume(tmpDir);
      assert.ok(
        fs.readFileSync(path.join(tmpDir, '404.html'), 'utf8').includes(mutatedResume.basics.label)
      );
      assert.ok(
        fs
          .readFileSync(path.join(tmpDir, '.well-known', 'security.txt'), 'utf8')
          .includes('Contact: mailto:updated@example.com')
      );
    });
  });

  it('builds 404.html and index.html directly from resume.json without hardcoded domain drift', () => {
    const custom = {
      ...resume,
      basics: { ...resume.basics, name: 'Test User', url: 'https://custom-portfolio.example' },
      meta: {
        ...resume.meta,
        canonical: 'https://custom-portfolio.example',
        resumePdf: '/cv.pdf',
        resumePdfUrl: 'https://custom-portfolio.example/cv.pdf',
        qualityReportUrl: 'https://custom-portfolio.example/checks/',
      },
    };
    const notFound = build404Html(custom, { year: 2027 });
    assert.ok(notFound.includes('custom-portfolio.example'));
    assert.ok(notFound.includes('href="/cv.pdf"'));
    assert.ok(notFound.includes('href="/checks/"'));
    assert.ok(notFound.includes('href="/llms.txt"'));
    assert.ok(notFound.includes('<meta name="robots" content="noindex">'));
    assert.ok(notFound.includes('&copy; 2027 Test User'));
    assert.ok(!notFound.includes('guilhermevigneron.dev'));

    const index = buildIndexHtml(custom, { rootDir: ROOT, year: 2027 });
    assert.ok(index.includes('href="https://custom-portfolio.example"'));
    assert.ok(index.includes('href="/cv.pdf"'));
    assert.ok(index.includes('&copy; 2027 Test User'));
    assert.ok(!index.includes('_START -->'));
  });
});

describe('validate-sync positive and mutation paths', () => {
  it('validates canonical repository sync state cleanly', () => {
    const checks = validateSyncState(makeValidRepoInputs());
    assert.ok(checks.length >= 4);
    assert.ok(checks.every((c) => c.passed));
  });

  it('strips comments, script, and style blocks without stripping custom tags or regex-bypass fragments', () => {
    const sample =
      '<div>Keep</div>' +
      '<!-- <!-- nested comment -->' +
      '<script type="text/javascript">const x = "</scripture>";</script   >' +
      '<STYLE>body{color:red}</style\n>' +
      '<script-badge>Keep custom tag</script-badge>' +
      '<p>Tail</p>';
    const stripped = stripNonContentBlocks(sample);
    assert.equal(
      stripped,
      '<div>Keep</div><script-badge>Keep custom tag</script-badge><p>Tail</p>'
    );

    assert.equal(stripNonContentBlocks('<p>Ok</p><script>unterminated'), '<p>Ok</p>');
    assert.equal(stripNonContentBlocks('<p>Ok</p><!-- unterminated'), '<p>Ok</p>');
  });

  it('writes sync-validation.json on pass and failure when validateAllFromRoot runs in an isolated workspace', () => {
    withTempDir('validate-sync-root-', (tmpDir) => {
      copyRepoSyncFiles(tmpDir);
      fs.mkdirSync(path.join(tmpDir, '_site'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '_site', 'contact.vcf'), buildVCard(resume), 'utf8');

      const checks = validateAllFromRoot(tmpDir);
      assert.ok(checks.length >= 5);
      const report = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.ci-reports', 'sync-validation.json'), 'utf8')
      );
      assert.equal(report.passed, true);

      fs.writeFileSync(path.join(tmpDir, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');
      assert.throws(() => validateAllFromRoot(tmpDir), /robots\.txt Sitemap URL out of sync/);
      const failReport = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.ci-reports', 'sync-validation.json'), 'utf8')
      );
      assert.equal(failReport.passed, false);
    });
  });

  it('rejects footer copyright year drift, missing work highlights, missing skills, and out-of-sync outputs', () => {
    const year = new Date().getUTCFullYear();
    const base = makeValidRepoInputs();

    const wrongYearHtml = base.indexHtml.replace(
      `${year} ${resume.basics.name}`,
      `${year - 1} ${resume.basics.name}`
    );
    assert.throws(
      () => validateSyncState({ ...base, indexHtml: wrongYearHtml }),
      /Footer missing current copyright year/
    );

    const firstHighlight = resume.work[0].highlights[0];
    const missingHighlightHtml = base.indexHtml.replace(firstHighlight, 'Deleted highlight text');
    assert.throws(
      () => validateSyncState({ ...base, indexHtml: missingHighlightHtml }),
      /missing highlight/
    );

    const missingSkillHtml = base.indexHtml.replace(
      `<li class="tag-item">${resume.skills[0].name}`,
      '<li class="tag-item">Removed Skill Placeholder'
    );
    assert.throws(
      () => validateSyncState({ ...base, indexHtml: missingSkillHtml }),
      /#skills missing skill/
    );

    const brokenLlms = base.llmsTxt.replace('/contact.vcf', '/removed.vcf');
    assert.throws(
      () => validateSyncState({ ...base, llmsTxt: brokenLlms }),
      /llms\.txt missing contactVcfUrl/
    );

    const removedExpArticle = base.indexHtml.replace(
      /<section id="experience"[\s\S]*?<article>[\s\S]*?<\/article>/,
      '<section id="experience">'
    );
    assert.throws(
      () => validateSyncState({ ...base, indexHtml: removedExpArticle }),
      /#experience article count mismatch/
    );

    assert.throws(
      () =>
        validateSyncState({ ...base, webmanifest: { ...base.webmanifest, short_name: 'Drift' } }),
      /AssertionError/
    );

    assert.throws(
      () =>
        validateSyncState({
          ...base,
          sitemapXml: base.sitemapXml.replace('/architecture/', '/x/'),
        }),
      /sitemap\.xml missing/
    );

    assert.throws(
      () =>
        validateSyncState({
          ...base,
          robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://wrong.example/sitemap.xml\n',
        }),
      /robots\.txt Sitemap URL out of sync/
    );

    assert.throws(
      () =>
        validateSyncState({
          ...base,
          commandPanelJs: `${base.commandPanelJs.replace("from 'site-config'", "from 'legacy'")}\nemail: 'wrong@example.com'`,
        }),
      /command-menu-panel\.js email out of sync/
    );

    assert.throws(
      () =>
        validateSyncState({
          ...base,
          notFoundHtml: base.notFoundHtml.replace('Principal Technologist', 'Stale Label'),
        }),
      /404\.html subtitle out of sync/
    );
  });

  it('rejects broken internal HTML anchors and broken command-menu-panel section hashes', () => {
    const base = makeValidRepoInputs();
    const brokenAnchorHtml = base.indexHtml.replace('href="#about"', 'href="#missing-target"');
    assert.throws(
      () => validateSyncState({ ...base, indexHtml: brokenAnchorHtml }),
      /Broken internal anchor #missing-target/
    );

    const brokenCommandJs = base.commandPanelJs.replace(
      'function getGroups(isHome) {',
      "function getGroups(isHome) {\n    const href = '#deleted-section';"
    );
    assert.throws(
      () => validateSyncState({ ...base, commandPanelJs: brokenCommandJs }),
      /Broken command-menu anchor #deleted-section/
    );
  });

  it('rejects malformed resume.json schemas, invalid contact.vcf, and expiring security.txt', () => {
    const badEmail = structuredClone(resume);
    badEmail.basics.email = 'not-an-email';
    assert.throws(() => validateResumeSchema(badEmail), /basics\.email invalid/);

    const badDate = structuredClone(resume);
    badDate.work[1].startDate = '2025-01';
    badDate.work[1].endDate = '2020-01';
    assert.throws(() => validateResumeSchema(badDate), /endDate precedes startDate/);

    const badEduDate = structuredClone(resume);
    badEduDate.education[0].startDate = '2024';
    badEduDate.education[0].endDate = '2020';
    assert.throws(() => validateResumeSchema(badEduDate), /education endDate precedes startDate/);

    const nonHttps = structuredClone(resume);
    nonHttps.basics.profiles[0].url = 'http://github.com/example';
    assert.throws(() => validateResumeSchema(nonHttps), /Invalid profile URL/);

    const base = makeValidRepoInputs();
    assert.throws(
      () => validateSyncState({ ...base, contactVcf: 'BEGIN:VCARD\nEND:VCARD' }),
      /contact\.vcf must use CRLF/
    );

    const soonExpires = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const expiringSec = base.securityTxt.replace(/^Expires:.*$/m, `Expires: ${soonExpires}`);
    assert.throws(
      () => validateSyncState({ ...base, securityTxt: expiringSec }),
      /Expires < 30 days/
    );
  });
});

describe('performance budget & vitals evaluators', () => {
  it('accepts valid asset sizes and Web Vitals within budgets', () => {
    const { initialJsBytes, combinedFontsBytes } = evaluateAssetBudgets(
      makeValidAssetSizes(),
      BUDGETS
    );
    assert.equal(initialJsBytes, 2600);
    assert.equal(combinedFontsBytes, 24000);
    evaluateVitalsBudgets(
      {
        cls: 0.002,
        lcpMs: 1200,
        fcpMs: 800,
        totalTransferBytes: 50000,
        eagerPanelLoaded: false,
      },
      BUDGETS,
      [{ route: '/', width: 390, scrollWidth: 390, clientWidth: 390 }]
    );
  });

  it('rejects every asset byte budget breach', () => {
    const overages = [
      ['screenCssBytes', BUDGETS.screenCssMaxBytes + 1],
      ['subpageCssBytes', BUDGETS.subpageCssMaxBytes + 1],
      ['printCssBytes', BUDGETS.printCssMaxBytes + 1],
      ['commandMenuJsBytes', BUDGETS.initialJsMaxBytes],
      ['commandMenuPanelJsBytes', BUDGETS.lazyPanelJsMaxBytes + 1],
      ['monoFontBytes', BUDGETS.combinedFontsMaxBytes],
      ['indexHtmlBytes', BUDGETS.indexHtmlMaxBytes + 1],
      ['notFoundHtmlBytes', BUDGETS.notFoundHtmlMaxBytes + 1],
      ['avatarJpgBytes', BUDGETS.avatarJpgMaxBytes + 1],
      ['avatarAvif224Bytes', BUDGETS.avatarAvifMaxBytes + 1],
    ];

    for (const [key, val] of overages) {
      const fixture = { ...makeValidAssetSizes(), [key]: val };
      assert.throws(() => evaluateAssetBudgets(fixture, BUDGETS), /exceed/);
    }
  });

  it('rejects Web Vitals threshold breaches, eager lazy panel load, null metrics, and horizontal overflow', () => {
    const valid = {
      cls: 0.001,
      lcpMs: 900,
      fcpMs: 700,
      totalTransferBytes: 40000,
      eagerPanelLoaded: false,
    };
    assert.throws(
      () => evaluateVitalsBudgets({ ...valid, eagerPanelLoaded: true }, BUDGETS),
      /not load during initial/
    );
    assert.throws(() => evaluateVitalsBudgets({ ...valid, cls: 0.02 }, BUDGETS), /CLS/);
    assert.throws(() => evaluateVitalsBudgets({ ...valid, lcpMs: 2600 }, BUDGETS), /LCP/);
    assert.throws(() => evaluateVitalsBudgets({ ...valid, lcpMs: null }, BUDGETS), /LCP/);
    assert.throws(() => evaluateVitalsBudgets({ ...valid, fcpMs: 1900 }, BUDGETS), /FCP/);
    assert.throws(() => evaluateVitalsBudgets({ ...valid, fcpMs: null }, BUDGETS), /FCP/);
    assert.throws(
      () =>
        evaluateVitalsBudgets(
          { ...valid, totalTransferBytes: BUDGETS.totalMobileTransferMaxBytes + 1 },
          BUDGETS
        ),
      /payload/
    );
    assert.throws(
      () =>
        evaluateVitalsBudgets(valid, BUDGETS, [
          { route: '/quality/', width: 320, scrollWidth: 321, clientWidth: 320 },
        ]),
      /Horizontal overflow/
    );
  });
});

describe('quality gate evaluator', () => {
  const allPassInput = {
    lintReport: { passed: true },
    unitReport: { passed: true },
    securityReport: { passed: true },
    syncReport: { passed: true, checks: [{ name: 'c1', passed: true }] },
    pdfReport: { passed: true, pages: 1, maxPages: 1, blockedExternalRequests: 0 },
    ogReport: { passed: true, bytes: 32000, blockedExternalRequests: 0 },
    htmlReport: { valid: true, fileCount: 4, errorCount: 0, warningCount: 0 },
    cypressReport: {
      totalTests: 20,
      totalPassed: 20,
      totalFailed: 0,
      a11y: { violations: 0, checksRun: 16 },
      mobile: { failures: 0, checksRun: 6 },
      network: { pagesChecked: 4, externalRequests: 0 },
    },
    perfReport: {
      passed: true,
      overflowChecksCount: 16,
      mobileVitals: { totalTransferBytes: 48000, fcpMs: 600, lcpMs: 900, cls: 0 },
    },
    lycheeExit: 'success',
    expiryDays: 300,
    pdfSize: '25.0 KB',
  };

  it('computes pass when all 10 gates pass and pending when only lychee is unset', () => {
    const passResult = evaluateQualityGates(allPassInput);
    assert.equal(passResult.overallStatus, 'pass');
    assert.equal(passResult.cards.length, 10);
    assert.ok(passResult.cards.every((c) => c.status === 'pass'));

    const pendingResult = evaluateQualityGates({ ...allPassInput, lycheeExit: undefined });
    assert.equal(pendingResult.overallStatus, 'pending');
    assert.equal(pendingResult.cards.find((c) => c.id === 'link-integrity').status, 'pending');
  });

  it('marks overallStatus fail when any gate fails', () => {
    const cases = [
      { ...allPassInput, lintReport: { passed: false } },
      { ...allPassInput, unitReport: { passed: false } },
      { ...allPassInput, securityReport: { passed: false } },
      {
        ...allPassInput,
        htmlReport: { valid: false, fileCount: 4, errorCount: 2, warningCount: 0 },
      },
      { ...allPassInput, cypressReport: { ...allPassInput.cypressReport, totalFailed: 1 } },
      {
        ...allPassInput,
        cypressReport: { ...allPassInput.cypressReport, a11y: { violations: 1, checksRun: 16 } },
      },
      {
        ...allPassInput,
        cypressReport: { ...allPassInput.cypressReport, a11y: { violations: 0, checksRun: 12 } },
      },
      {
        ...allPassInput,
        cypressReport: {
          ...allPassInput.cypressReport,
          mobile: { failures: 1, checksRun: 6 },
        },
      },
      {
        ...allPassInput,
        cypressReport: {
          ...allPassInput.cypressReport,
          network: { pagesChecked: 4, externalRequests: 1 },
        },
      },
      { ...allPassInput, perfReport: { ...allPassInput.perfReport, passed: false } },
      { ...allPassInput, expiryDays: 29 },
      { ...allPassInput, lycheeExit: 'failure' },
    ];
    for (const input of cases) {
      assert.equal(evaluateQualityGates(input).overallStatus, 'fail');
    }
  });
});

describe('shared lib helpers (html, io, site-config)', () => {
  it('escapes HTML entities including single quotes and sanitizes URLs', () => {
    assert.equal(
      escapeHtml(`<a href="x" title='y'>&</a>`),
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
    assert.equal(sanitizeHref('/quality/'), '/quality/');
    assert.equal(sanitizeHref('#projects'), '#projects');
    assert.equal(sanitizeHref('/quality/', { allowRelative: false }), '');
    assert.equal(sanitizeHref('https://example.com/a'), 'https://example.com/a');
    assert.equal(sanitizeHref('mailto:a@b.com'), '');
    assert.equal(sanitizeHref('mailto:a@b.com', { allowMailto: true }), 'mailto:a@b.com');
    assert.equal(sanitizeHref('javascript:alert(1)'), '');
    assert.equal(sanitizeHref('data:text/html,<script>alert(1)</script>'), '');
  });

  it('normalizes base URLs and pathnames', () => {
    assert.equal(normalizeBaseUrl(' https://example.com/// '), 'https://example.com');
    assert.equal(toPathname('https://example.com/quality/report.json'), '/quality/report.json');
    assert.equal(toPathname('/resume.pdf'), '/resume.pdf');
    assert.equal(toPathname('not a url', '/fallback'), '/fallback');
  });

  it('derives command menu config dynamically from resume.json and drops empty sections', () => {
    const partialResume = {
      basics: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        url: 'https://janedoe.example',
        summary: 'Summary text',
        profiles: [{ network: 'GitHub', url: 'https://github.com/janedoe' }],
      },
      work: [{ name: 'Acme', position: 'Engineer' }],
      projects: [],
      skills: [{ name: 'Testing' }],
      publications: [],
      awards: [],
      education: [],
      languages: [{ language: 'English', fluency: 'Native' }],
      meta: { canonical: 'https://janedoe.example', resumePdf: '/jane.pdf' },
    };
    const cfg = buildCommandMenuConfig(partialResume);
    assert.equal(cfg.email, 'jane@example.com');
    assert.equal(cfg.host, 'janedoe.example');
    assert.equal(cfg.endpoints.resumePdf, '/jane.pdf');
    assert.equal(cfg.endpoints.contactVcfFilename, 'jane-doe.vcf');
    assert.deepEqual(
      cfg.sections.map((s) => s.id),
      ['about', 'experience', 'skills', 'languages']
    );
  });
});

describe('asset, PDF, PNG, E2E, and Architecture helpers', () => {
  it('rewrites exact asset paths without prefix collisions', () => {
    const input =
      '<script src="/assets/js/command-menu.js"></script><script src="/assets/js/command-menu-panel.js"></script>';
    const output = rewriteAssetRefs(input, {
      '/assets/js/command-menu.js': '/assets/js/command-menu.1111aaaa.js',
      '/assets/js/command-menu-panel.js': '/assets/js/command-menu-panel.2222bbbb.js',
    });
    assert.ok(output.includes('/assets/js/command-menu.1111aaaa.js'));
    assert.ok(output.includes('/assets/js/command-menu-panel.2222bbbb.js'));
    assert.ok(!output.includes('command-menu.1111aaaa.js-panel'));
  });

  it('counts PDF pages across dictionary key orders and validates PDF constraints', () => {
    assert.equal(countPdfPages(Buffer.from('<< /Count 1 /Type /Pages >>', 'latin1')), 1);
    assert.equal(
      countPdfPages(
        Buffer.from('<< /Type /Pages /Count 3 >> << /Type /Pages /Count 1 >>', 'latin1')
      ),
      3
    );
    assert.equal(countPdfPages(Buffer.from('/Type /Page\n/Type /Page\n', 'latin1')), 2);
    assert.equal(countPdfPages(Buffer.from('plain text', 'latin1')), 0);

    const valid = makeMockPdf();
    assert.equal(validatePdfBuffer(valid, 1).pageCount, 1);

    assert.throws(() => validatePdfBuffer(Buffer.from('NOTPDF')), /%PDF-/);
    assert.throws(() => validatePdfBuffer(Buffer.from('%PDF-short')), /unexpectedly small/);
    assert.throws(() => validatePdfBuffer(makeMockPdf({ extra: '' })), /StructTreeRoot/);
    assert.throws(
      () => validatePdfBuffer(makeMockPdf({ extra: '/StructTreeRoot /Subtype /Type3' })),
      /Type 3/
    );
    assert.throws(
      () => validatePdfBuffer(makeMockPdf({ extra: '/StructTreeRoot /Subtype /Image' })),
      /embedded raster images/
    );
    assert.throws(
      () => validatePdfBuffer(makeMockPdf({ dict: '<< /Count 2 /Type /Pages >>' }), 1),
      /violates maxPdfPages=1/
    );
  });

  it('renders architecture overview HTML with or without asset-manifest.json', () => {
    withTempDir('arch-page-test-', (tmpDir) => {
      fs.copyFileSync(path.join(ROOT, 'resume.json'), path.join(tmpDir, 'resume.json'));
      buildArchitecturePage({ rootDir: tmpDir });
      const archPath = path.join(tmpDir, '_site', 'architecture', 'index.html');
      const unhashedHtml = fs.readFileSync(archPath, 'utf8');
      assert.ok(unhashedHtml.includes('Architecture Overview'));
      assert.ok(unhashedHtml.includes('/assets/css/subpage.css'));
      assert.ok(unhashedHtml.includes('href="/quality/"'));

      fs.mkdirSync(path.join(tmpDir, '.ci-reports'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.ci-reports', 'asset-manifest.json'),
        JSON.stringify({ subpageCssUrl: '/assets/css/subpage.deadbeef.css' }),
        'utf8'
      );
      buildArchitecturePage({ rootDir: tmpDir });
      const hashedHtml = fs.readFileSync(archPath, 'utf8');
      assert.ok(hashedHtml.includes('/assets/css/subpage.deadbeef.css'));
    });
  });

  it('resolves Cypress browser from CYPRESS_BROWSER override or system binaries', () => {
    const prevBrowser = process.env.CYPRESS_BROWSER;
    try {
      process.env.CYPRESS_BROWSER = 'firefox';
      assert.equal(resolveBrowser(), 'firefox');
      delete process.env.CYPRESS_BROWSER;
      const detected = resolveBrowser();
      assert.ok(detected === 'chrome' || detected === 'chromium');
    } finally {
      if (prevBrowser === undefined) {
        delete process.env.CYPRESS_BROWSER;
      } else {
        process.env.CYPRESS_BROWSER = prevBrowser;
      }
    }
  });
});

describe('PDF and PNG normalization helpers', () => {
  it('counts PDF pages from Pages /Count dictionary or fallback /Page objects', () => {
    assert.equal(countPdfPages(Buffer.from('%PDF-1.4 << /Type /Pages /Count 1 >>')), 1);
    assert.equal(countPdfPages(Buffer.from('%PDF-1.4 << /Type /Page >> << /Type /Page >>')), 2);
    assert.equal(countPdfPages(Buffer.from('not a pdf')), 0);
  });

  it('inspects PDF dictionaries with reordered /Count and /Type /Pages keys and normalizes timestamps', () => {
    const tailMarker = 'trailer\n';
    const samplePdf = `%PDF-1.4\n1 0 obj\n<< /Count 1 /Kids [2 0 R] /Type /Pages >>\nendobj\n3 0 obj\n<< /CreationDate (D:20250102030405Z) /ModDate (D:20250102030405-08'00') /Title (Resume) >>\nendobj\n${tailMarker}/StructTreeRoot 4 0 R\n`;
    const buf = Buffer.from(samplePdf, 'latin1');

    const inspected = inspectPdfBuffer(buf);
    assert.equal(inspected.hasMagicHeader, true);
    assert.equal(inspected.pages, 1);
    assert.equal(inspected.tagged, true);
    assert.equal(inspected.type3Fonts, false);
    assert.equal(inspected.embeddedImages, false);

    const fixedMs = Date.UTC(2026, 10, 13, 12, 34, 56);
    const normalized = normalizePdfTimestamps(buf, fixedMs);
    assert.equal(normalized.length, buf.length);
    const normalizedText = normalized.toString('latin1');
    assert.ok(normalizedText.includes('/CreationDate (D:20261113123456Z)'));
    assert.ok(normalizedText.includes("/ModDate (D:20261113123456+00'00')"));
    assert.equal(normalizedText.indexOf(tailMarker), samplePdf.indexOf(tailMarker));
  });

  it('normalizes two PNG encodings of identical scanlines into byte-identical buffers', () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(2, 0);
    ihdrData.writeUInt32BE(2, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 2;
    const ihdr = buildTestPngChunk('IHDR', ihdrData);
    const iend = buildTestPngChunk('IEND', Buffer.alloc(0));
    const scanlines = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);

    const deflatedFast = zlib.deflateSync(scanlines, { level: 1 });
    const pngFast = Buffer.concat([signature, ihdr, buildTestPngChunk('IDAT', deflatedFast), iend]);

    const deflatedSplit = zlib.deflateSync(scanlines, { level: 6 });
    const mid = Math.floor(deflatedSplit.length / 2);
    const pngSplit = Buffer.concat([
      signature,
      ihdr,
      buildTestPngChunk('IDAT', deflatedSplit.subarray(0, mid)),
      buildTestPngChunk('IDAT', deflatedSplit.subarray(mid)),
      iend,
    ]);

    assert.equal(Buffer.compare(pngFast, pngSplit) !== 0, true);
    assert.deepEqual(normalizePng(pngFast), normalizePng(pngSplit));
    assert.throws(() => normalizePng(Buffer.from('not-a-png')), /Invalid PNG signature/);
  });
});

describe('HTML and asset minifiers', () => {
  it('strips comments, compacts JSON-LD safely, and preserves pre/style/textarea and inline spacing', () => {
    const input = `<!DOCTYPE html>
<html>
  <head>
    <!-- comment -->
    <style>.a { color: red;\n  margin: 0; }</style>
    <script type="application/ld+json">
      {
        "name": "Test </div>",
        "url": "https://example.com"
      }
    </script>
    <script>  console.log('hi');  </script>
  </head>
  <body>
    <textarea>  keep
  lines  </textarea>
    <pre>  line 1
    line 2  </pre>
    <span>One</span> <span>Two</span>
  </body>
</html>`;
    const output = minifyHtml(input);
    assert.ok(!output.includes('<!-- comment -->'));
    assert.ok(output.includes('<style>.a{color:red;margin:0}</style>'));
    assert.ok(output.includes('<textarea>  keep\n  lines  </textarea>'));
    assert.ok(output.includes('<pre>  line 1\n    line 2  </pre>'));
    assert.ok(output.includes("<script>console.log('hi');</script>"));
    assert.ok(output.includes('<\\/div>'));
    assert.ok(output.includes('<span>One</span> <span>Two</span>'));
    assert.ok(output.endsWith('\n'));

    const invalidJsonLd = '<script type="application/ld+json">{ bad json }</script>';
    assert.ok(minifyHtml(invalidJsonLd).includes(invalidJsonLd));
  });

  it('minifies CSS and JS via esbuild while preserving --font custom property commas', async () => {
    await withTempDirAsync('minify-assets-test-', async (tmpSite) => {
      await minifyCssFiles(tmpSite);
      const stylesCss = fs.readFileSync(path.join(tmpSite, 'assets', 'css', 'styles.css'), 'utf8');
      assert.ok(stylesCss.includes('--font-mono:'));
      assert.ok(stylesCss.includes('"Geist Mono", "Geist Mono Fallback"'));
      assert.ok(stylesCss.length < fs.statSync(path.join(ROOT, 'src', 'styles.css')).size);

      fs.mkdirSync(path.join(tmpSite, 'assets', 'js'), { recursive: true });
      for (const jsFile of [
        'theme-init.js',
        'theme.js',
        'command-menu.js',
        'command-menu-panel.js',
      ]) {
        fs.copyFileSync(
          path.join(ROOT, 'assets', 'js', jsFile),
          path.join(tmpSite, 'assets', 'js', jsFile)
        );
      }
      await minifyJsFiles(tmpSite);
      const minCmd = fs.readFileSync(path.join(tmpSite, 'assets', 'js', 'command-menu.js'), 'utf8');
      const minPanel = fs.readFileSync(
        path.join(tmpSite, 'assets', 'js', 'command-menu-panel.js'),
        'utf8'
      );
      assert.ok(
        minCmd.length < fs.statSync(path.join(ROOT, 'assets', 'js', 'command-menu.js')).size
      );
      assert.ok(
        minPanel.length < fs.statSync(path.join(ROOT, 'assets', 'js', 'command-menu-panel.js')).size
      );
    });
  });

  it('collapses container boundaries while preserving inline link spacing', () => {
    const input = '<ul><li>\n  <a href="/a">A</a> <a href="/b">B</a>\n</li></ul>';
    const output = minifyHtml(input);
    assert.equal(output, '<ul><li><a href="/a">A</a> <a href="/b">B</a></li></ul>\n');
  });

  it('preserves whitespace inside <pre> blocks and handles comment/raw-tag ordering safely', () => {
    const input =
      '<div><!-- <script>fake()</script> -->\n  <pre>  $100 $& __HTML_MINIFY_PRESERVE_0__  </pre>\n  <script>/* <!-- kept --> */ console.log("ok");</script>\n</div>';
    const output = minifyHtml(input);
    assert.ok(!output.includes('fake()'));
    assert.ok(output.includes('<pre>  $100 $& __HTML_MINIFY_PRESERVE_0__  </pre>'));
    assert.ok(output.includes('<script>/* <!-- kept --> */ console.log("ok");</script>'));
  });
});

describe('static server & html-validate checks', () => {
  it('handles 200, 301 trailing-slash redirect, 400, 403 traversal/symlink, 404, 405, and HEAD', async () => {
    await withTempDirAsync('serve-test-', async (tmpRoot) => {
      const tmpDir = path.join(tmpRoot, '_site');
      const outsideFile = path.join(tmpRoot, 'secret.txt');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>Home</h1>', 'utf8');
      fs.writeFileSync(path.join(tmpDir, '404.html'), '<h1>Custom 404</h1>', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'app.css'), 'body{margin:0}', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'data.unknownext'), 'raw', 'utf8');
      fs.mkdirSync(path.join(tmpDir, 'quality'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'quality', 'index.html'), '<h1>Quality</h1>', 'utf8');
      fs.writeFileSync(outsideFile, 'top-secret', 'utf8');
      fs.symlinkSync(outsideFile, path.join(tmpDir, 'leak.txt'));

      const server = createStaticServer(tmpDir);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      try {
        const home = await httpRequest(port, '/');
        assert.equal(home.status, 200);
        assert.equal(home.headers['x-content-type-options'], 'nosniff');
        assert.match(home.headers['content-type'], /text\/html/);
        assert.equal(home.body, '<h1>Home</h1>');

        const redirect = await httpRequest(port, '/quality?v=1');
        assert.equal(redirect.status, 301);
        assert.equal(redirect.headers.location, '/quality/?v=1');

        const headCss = await httpRequest(port, '/app.css', 'HEAD');
        assert.equal(headCss.status, 200);
        assert.match(headCss.headers['content-type'], /text\/css/);
        assert.equal(headCss.body, '');

        const post = await httpRequest(port, '/', 'POST');
        assert.equal(post.status, 405);
        assert.equal(post.headers.allow, 'GET, HEAD');

        const headQuality = await httpRequest(port, '/quality/', 'HEAD');
        assert.equal(headQuality.status, 200);
        assert.equal(headQuality.body, '');

        const binRes = await httpRequest(port, '/data.unknownext');
        assert.equal(binRes.status, 200);
        assert.equal(binRes.headers['content-type'], 'application/octet-stream');

        const traversalRaw = await httpRequest(port, '/../../etc/passwd');
        assert.equal(traversalRaw.status, 403);

        const traversalEncoded = await httpRequest(port, '/%2e%2e/etc/passwd');
        assert.equal(traversalEncoded.status, 403);

        const traversalSlashEncoded = await httpRequest(port, '/%2e%2e%2fetc/passwd');
        assert.equal(traversalSlashEncoded.status, 403);

        const symlinkLeak = await httpRequest(port, '/leak.txt');
        assert.equal(symlinkLeak.status, 403);

        const doubleSlash = await httpRequest(port, '//evil.test/foo');
        assert.equal(doubleSlash.status, 400);

        const crlf = await httpRequest(port, '/foo%0d%0abar');
        assert.equal(crlf.status, 400);

        const nullByte = await httpRequest(port, '/foo%00bar');
        assert.equal(nullByte.status, 400);

        const malformed = await httpRequest(port, '/%E0%A4%A');
        assert.equal(malformed.status, 400);

        const notFoundCustom = await httpRequest(port, '/does-not-exist');
        assert.equal(notFoundCustom.status, 404);
        assert.equal(notFoundCustom.body, '<h1>Custom 404</h1>');

        fs.unlinkSync(path.join(tmpDir, '404.html'));
        const notFoundPlain = await httpRequest(port, '/does-not-exist');
        assert.equal(notFoundPlain.status, 404);
        assert.equal(notFoundPlain.body, 'Not Found');
      } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  it('rejects invalid HTML5 markup in validateHtmlFiles', async () => {
    await withTempDirAsync('html-val-test-', async (tmpDir) => {
      const siteDir = path.join(tmpDir, 'site');
      const reportsDir = path.join(tmpDir, 'reports');
      fs.mkdirSync(siteDir, { recursive: true });
      fs.writeFileSync(
        path.join(siteDir, 'valid.html'),
        '<!DOCTYPE html><html lang="en"><head><title>Ok</title></head><body><h1>Ok</h1></body></html>',
        'utf8'
      );

      const passSummary = await validateHtmlFiles(siteDir, reportsDir);
      assert.equal(passSummary.valid, true);
      assert.equal(passSummary.errorCount, 0);

      fs.writeFileSync(
        path.join(siteDir, 'invalid.html'),
        '<!DOCTYPE html><html lang="en"><head><title>Bad</title></head><body><img src="/a.png"><p id="dup">1</p><p id="dup">2</p></body></html>',
        'utf8'
      );
      const failSummary = await validateHtmlFiles(siteDir, reportsDir);
      assert.equal(failSummary.valid, false);
      assert.ok(failSummary.errorCount >= 2);
      const reportJson = JSON.parse(
        fs.readFileSync(path.join(reportsDir, 'html-validate.json'), 'utf8')
      );
      assert.equal(reportJson.valid, false);
    });
  });
});

describe('theme-init graceful degradation', () => {
  it('falls back cleanly when localStorage and matchMedia throw', () => {
    const code = esbuild.buildSync({
      entryPoints: [path.join(ROOT, 'assets/js/theme-init.js')],
      bundle: true,
      write: false,
      format: 'iife',
    }).outputFiles[0].text;
    const runInit = ({
      storedThrows = false,
      storedValue = null,
      mqThrows = false,
      dark = false,
    }) => {
      const classes = new Set();
      const metas = [
        {
          content: '#fafaf8',
          setAttribute(_k, v) {
            this.content = v;
          },
        },
        {
          content: '#0d0c0a',
          setAttribute(_k, v) {
            this.content = v;
          },
        },
      ];
      const sandbox = {
        document: {
          documentElement: {
            classList: {
              add: (...tokens) => {
                for (const t of tokens) classes.add(t);
              },
              toggle: (token, force) => {
                if (force) classes.add(token);
                else classes.delete(token);
              },
            },
          },
          querySelectorAll: () => metas,
        },
        localStorage: {
          getItem() {
            if (storedThrows) throw new Error('SecurityError');
            return storedValue;
          },
        },
        window: {
          matchMedia() {
            if (mqThrows) throw new Error('matchMedia disabled');
            return { matches: dark };
          },
        },
      };
      vm.runInNewContext(code, sandbox);
      return { classes, metas };
    };

    const restricted = runInit({ storedThrows: true, mqThrows: true });
    assert.ok(restricted.classes.has('js'));
    assert.ok(restricted.classes.has('light'));
    assert.ok(!restricted.classes.has('dark'));
    assert.deepEqual(
      restricted.metas.map((m) => m.content),
      ['#fafaf8', '#fafaf8']
    );

    const darkFallback = runInit({ storedThrows: true, dark: true });
    assert.ok(darkFallback.classes.has('js'));
    assert.ok(darkFallback.classes.has('dark'));
    assert.ok(!darkFallback.classes.has('light'));
    assert.deepEqual(
      darkFallback.metas.map((m) => m.content),
      ['#0d0c0a', '#0d0c0a']
    );
  });
});

describe('resume.json and manifest schema invariants', () => {
  it('uses valid email, URLs, and ISO dates in resume.json', () => {
    validateResumeSchema(resume);
  });

  it('includes 192x192, 512x512, maskable icons in site.webmanifest and every icon file exists on disk', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.webmanifest'), 'utf8'));
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose || 'default'}`);
    assert.ok(sizes.some((s) => s.startsWith('192x192:')));
    assert.ok(sizes.some((s) => s === '512x512:any'));
    assert.ok(sizes.some((s) => s === '512x512:maskable'));

    for (const icon of manifest.icons) {
      const filePath = path.join(ROOT, icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(filePath), `Manifest icon missing on disk: ${icon.src}`);
      assert.ok(fs.statSync(filePath).size > 0, `Manifest icon empty: ${icon.src}`);
    }
  });
});
