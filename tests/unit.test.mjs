import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildJsonLd,
  buildLlmsTxt,
  buildVCard,
  computeYearsOfExperience,
} from '../scripts/sync-resume.mjs';
import { minifyHtml } from '../scripts/minify-html.mjs';

const ROOT = process.cwd();
const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));

describe('sync-resume helpers', () => {
  it('computes years of experience from earliest work startDate', () => {
    const years = computeYearsOfExperience(resume, 2026);
    assert.equal(years, 18);
    assert.equal(computeYearsOfExperience({ work: [] }, 2026), null);
  });

  it('builds a valid vCard 3.0 payload with CRLF line endings', () => {
    const vcf = buildVCard(resume);
    assert.ok(vcf.includes('\r\n'));
    assert.ok(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
    assert.ok(vcf.includes(`FN:${resume.basics.name}\r\n`));
    assert.ok(vcf.includes(`EMAIL;TYPE=INTERNET:${resume.basics.email}\r\n`));
    assert.ok(vcf.includes(`URL:${resume.basics.url}\r\n`));
    assert.ok(vcf.trimEnd().endsWith('END:VCARD'));
  });

  it('builds Schema.org Person JSON-LD with deduplicated alumniOf', () => {
    const ld = buildJsonLd(resume);
    assert.equal(ld['@context'], 'https://schema.org');
    assert.equal(ld['@type'], 'Person');
    assert.equal(ld.name, resume.basics.name);
    assert.equal(ld.worksFor.name, resume.work[0].name);
    const schoolNames = ld.alumniOf.map((s) => s.name);
    assert.equal(new Set(schoolNames).size, schoolNames.length);
  });

  it('builds llms.txt with key sections and endpoints', () => {
    const txt = buildLlmsTxt(resume);
    assert.ok(txt.includes(`# ${resume.basics.name}`));
    assert.ok(txt.includes('## Experience'));
    assert.ok(txt.includes('## Selected Projects'));
    assert.ok(txt.includes('## Machine-Readable & Verification Endpoints'));
    assert.ok(txt.includes('/resume.pdf'));
    assert.ok(txt.includes('/contact.vcf'));
  });
});

describe('minifyHtml', () => {
  it('strips comments, collapses whitespace, and compacts JSON-LD safely', () => {
    const input = `<!DOCTYPE html>
<html>
  <head>
    <!-- comment -->
    <script type="application/ld+json">
      {
        "name": "Test",
        "url": "https://example.com"
      }
    </script>
  </head>
  <body>
    <p>  Hello   world  </p>
  </body>
</html>`;
    const output = minifyHtml(input);
    assert.ok(!output.includes('<!-- comment -->'));
    assert.ok(output.includes('<p> Hello world </p>'));
    assert.ok(output.includes('{"name":"Test","url":"https://example.com"}'));
    assert.ok(output.endsWith('\n'));
  });

  it('preserves whitespace inside <pre> blocks', () => {
    const input = '<div>\n  <pre>  line 1\n    line 2  </pre>\n</div>';
    const output = minifyHtml(input);
    assert.ok(output.includes('<pre>  line 1\n    line 2  </pre>'));
  });
});

describe('resume.json and manifest schema invariants', () => {
  it('uses valid email, URLs, and ISO dates in resume.json', () => {
    assert.match(resume.basics.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    assert.match(resume.basics.url, /^https:\/\//);
    for (const profile of resume.basics.profiles) {
      assert.match(profile.url, /^https:\/\//);
    }
    for (const job of resume.work) {
      assert.match(job.startDate, /^\d{4}-\d{2}$/);
      if (job.endDate) {
        assert.match(job.endDate, /^\d{4}-\d{2}$/);
      }
    }
    for (const edu of resume.education) {
      assert.match(edu.startDate, /^\d{4}/);
      assert.match(edu.endDate, /^\d{4}/);
    }
  });

  it('includes 192x192, 512x512, and maskable icons in site.webmanifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.webmanifest'), 'utf8'));
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose || 'default'}`);
    assert.ok(sizes.some((s) => s.startsWith('192x192:')));
    assert.ok(sizes.some((s) => s === '512x512:any'));
    assert.ok(sizes.some((s) => s === '512x512:maskable'));
  });
});
