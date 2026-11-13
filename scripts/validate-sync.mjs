import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const notFoundHtml = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
const llmsTxt = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
const webmanifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.webmanifest'), 'utf8'));
const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&middot;': '·',
};

function decodeHtmlEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|#39|middot);/g, (entity) => HTML_ENTITIES[entity] || entity);
}

const bodyMatch = indexHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
const bodySource = (bodyMatch ? bodyMatch[1] : indexHtml)
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const decodedIndex = decodeHtmlEntities(bodySource);
const decoded404 = decodeHtmlEntities(notFoundHtml);
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (err) {
    checks.push({ name, passed: false, error: err.message });
    throw err;
  }
}

try {
  check('JSON Resume schema fields exist', () => {
    assert.ok(resume.basics?.name, 'basics.name missing');
    assert.ok(resume.basics?.label, 'basics.label missing');
    assert.ok(resume.basics?.email, 'basics.email missing');
    assert.ok(resume.basics?.url, 'basics.url missing');
    assert.ok(Array.isArray(resume.work) && resume.work.length >= 3, 'work entries missing');
    for (const job of resume.work) {
      assert.ok(Array.isArray(job.keywords) && job.keywords.length > 0, `work keywords missing for ${job.position}`);
    }
    assert.ok(Array.isArray(resume.projects) && resume.projects.length >= 1, 'projects entries missing');
    for (const project of resume.projects) {
      assert.ok(project.name && project.description && project.url, 'project fields incomplete');
    }
    assert.ok(Array.isArray(resume.education) && resume.education.length >= 2, 'education entries missing');
    assert.ok(Array.isArray(resume.skills) && resume.skills.length >= 10, 'skills entries missing');
    assert.ok(Array.isArray(resume.publications) && resume.publications.length >= 2, 'publications missing');
    assert.ok(Array.isArray(resume.awards) && resume.awards.length >= 1, 'awards missing');
    assert.equal(resume.meta?.resumePdf, '/resume.pdf');
    assert.equal(resume.meta?.contactVcf, '/contact.vcf');
    assert.equal(resume.meta?.ogImage, '/assets/og-card.png');
    assert.ok(Number.isInteger(resume.meta?.maxPdfPages) && resume.meta.maxPdfPages >= 1, 'meta.maxPdfPages invalid');
  });

  check('index.html JSON-LD and OG meta match resume.json', () => {
    const match = indexHtml.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/
    );
    assert.ok(match, 'JSON-LD script block missing from index.html');
    const jsonLd = JSON.parse(match[1]);
    assert.equal(jsonLd['@type'], 'Person');
    assert.equal(jsonLd.name, resume.basics.name);
    assert.equal(jsonLd.jobTitle, resume.meta.jobTitle);
    assert.equal(jsonLd.url, resume.basics.url);
    assert.equal(jsonLd.email, resume.basics.email);
    assert.deepEqual(
      jsonLd.sameAs,
      resume.basics.profiles.map((p) => p.url)
    );
    assert.equal(jsonLd.worksFor?.name, resume.work[0].name);
    assert.deepEqual(
      jsonLd.knowsAbout,
      resume.skills.map((s) => s.name)
    );
    assert.equal(jsonLd.address?.addressLocality, resume.basics.location.city);
    assert.equal(jsonLd.address?.addressRegion, resume.basics.location.region);
    assert.equal(jsonLd.address?.addressCountry, resume.basics.location.countryCode);
    assert.equal(jsonLd.description, resume.meta.shortDescription);
    for (const edu of resume.education) {
      assert.ok(
        jsonLd.alumniOf.some((a) => a.name === edu.institution),
        `Missing alumniOf: ${edu.institution}`
      );
    }
    assert.ok(indexHtml.includes(`content="${resume.meta.ogImageUrl}"`), 'og:image missing or mismatched');
  });

  check('index.html DOM content matches resume.json with zero external CDNs', () => {
    const currentYear = String(new Date().getUTCFullYear());
    assert.ok(decodedIndex.includes(resume.basics.name));
    assert.ok(decodedIndex.includes(resume.basics.label));
    assert.ok(decodedIndex.includes(resume.basics.email));
    assert.ok(decodedIndex.includes(resume.basics.summary));
    assert.ok(
      bodySource.includes(`&copy; ${currentYear} ${resume.basics.name}`),
      `Missing current copyright notice "© ${currentYear} ${resume.basics.name}"`
    );
    assert.ok(decodedIndex.includes('href="/resume.pdf"'));
    assert.ok(decodedIndex.includes('href="/quality/"'));
    assert.ok(!decodedIndex.includes('drive.google.com'), 'External Google Drive link still present');
    assert.ok(!decodedIndex.includes('cdn.tailwindcss.com'), 'Tailwind CDN still present');
    assert.ok(!decodedIndex.includes('cdnjs.cloudflare.com'), 'Font Awesome CDN still present');
    assert.ok(!decodedIndex.includes('fonts.googleapis.com'), 'Google Fonts still present');

    for (const profile of resume.basics.profiles) {
      assert.ok(decodedIndex.includes(profile.url), `Missing profile URL: ${profile.url}`);
    }
    for (const job of resume.work) {
      assert.ok(decodedIndex.includes(job.position), `Missing position: ${job.position}`);
      assert.ok(decodedIndex.includes(job.name), `Missing company: ${job.name}`);
      assert.ok(decodedIndex.includes(job.displayDate), `Missing displayDate: ${job.displayDate}`);
      assert.ok(decodedIndex.includes(job.location), `Missing location: ${job.location}`);
      for (const highlight of job.highlights) {
        assert.ok(decodedIndex.includes(highlight), `Missing highlight: ${highlight}`);
      }
      for (const kw of job.keywords) {
        assert.ok(decodedIndex.includes(kw), `Missing work keyword: ${kw}`);
      }
    }
    for (const project of resume.projects) {
      assert.ok(decodedIndex.includes(project.name), `Missing project name: ${project.name}`);
      assert.ok(decodedIndex.includes(project.subtitle), `Missing project subtitle: ${project.subtitle}`);
      assert.ok(decodedIndex.includes(project.description), `Missing project description: ${project.description}`);
      assert.ok(decodedIndex.includes(project.url), `Missing project URL: ${project.url}`);
      for (const highlight of project.highlights || []) {
        assert.ok(decodedIndex.includes(highlight), `Missing project highlight: ${highlight}`);
      }
      for (const kw of project.keywords || []) {
        assert.ok(decodedIndex.includes(kw), `Missing project keyword: ${kw}`);
      }
    }
    for (const skill of resume.skills) {
      assert.ok(decodedIndex.includes(skill.name), `Missing skill: ${skill.name}`);
    }
    for (const pub of resume.publications) {
      assert.ok(decodedIndex.includes(pub.name), `Missing publication: ${pub.name}`);
      assert.ok(decodedIndex.includes(pub.url), `Missing publication URL: ${pub.url}`);
    }
    for (const award of resume.awards) {
      assert.ok(decodedIndex.includes(award.title), `Missing award: ${award.title}`);
    }
    for (const edu of resume.education) {
      assert.ok(decodedIndex.includes(edu.institution), `Missing institution: ${edu.institution}`);
      assert.ok(decodedIndex.includes(edu.studyType), `Missing studyType: ${edu.studyType}`);
      assert.ok(decodedIndex.includes(edu.area), `Missing area: ${edu.area}`);
    }
  });

  check('llms.txt matches resume.json and links self-hosted endpoints', () => {
    assert.ok(llmsTxt.includes(resume.basics.name));
    assert.ok(llmsTxt.includes(resume.basics.email));
    assert.ok(llmsTxt.includes(resume.meta.resumePdfUrl));
    assert.ok(llmsTxt.includes(resume.meta.resumeJsonUrl));
    assert.ok(llmsTxt.includes(resume.meta.contactVcfUrl));
    assert.ok(llmsTxt.includes(resume.meta.qualityReportUrl));
    assert.ok(llmsTxt.includes(resume.meta.qualityReportJsonUrl));
    assert.ok(!llmsTxt.includes('drive.google.com'), 'External Google Drive link in llms.txt');

    for (const job of resume.work) {
      assert.ok(llmsTxt.includes(job.position));
      assert.ok(llmsTxt.includes(job.location));
    }
    for (const project of resume.projects) {
      assert.ok(llmsTxt.includes(project.name));
      assert.ok(llmsTxt.includes(project.url));
    }
    for (const skill of resume.skills) {
      assert.ok(llmsTxt.includes(skill.name));
    }
    for (const pub of resume.publications) {
      assert.ok(llmsTxt.includes(pub.url));
    }
    for (const edu of resume.education) {
      assert.ok(llmsTxt.includes(edu.institution));
    }
    for (const award of resume.awards) {
      assert.ok(llmsTxt.includes(award.title));
    }
  });

  check('site.webmanifest, sitemap.xml, and 404.html align with resume.json', () => {
    assert.equal(webmanifest.name, resume.basics.name);
    assert.equal(webmanifest.short_name, resume.meta.shortName);
    assert.equal(webmanifest.description, resume.meta.manifestDescription);

    for (const url of [
      `${resume.basics.url}/`,
      resume.meta.resumePdfUrl,
      resume.meta.resumeJsonUrl,
      `${resume.basics.url}/llms.txt`,
      resume.meta.contactVcfUrl,
      resume.meta.qualityReportUrl,
      resume.meta.qualityReportJsonUrl,
    ]) {
      assert.ok(sitemapXml.includes(`<loc>${url}</loc>`), `sitemap.xml missing ${url}`);
    }

    assert.ok(decoded404.includes(resume.basics.label), '404.html subtitle out of sync');
    assert.ok(decoded404.includes('/assets/js/command-menu.js'), '404.html missing command-menu.js');
  });
} finally {
  fs.mkdirSync(path.join(ROOT, '.ci-reports'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, '.ci-reports', 'sync-validation.json'),
    JSON.stringify(
      {
        passed: checks.length > 0 && checks.every((c) => c.passed),
        timestamp: new Date().toISOString(),
        checks,
      },
      null,
      2
    )
  );
}

console.log(`Sync validation passed (${checks.length}/${checks.length} checks).`);
