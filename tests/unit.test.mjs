import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { rewriteAssetRefs } from '../scripts/lib/chrome.mjs';
import { countPdfPages } from '../scripts/lib/pdf.mjs';
import { minifyHtml } from '../scripts/minify-html.mjs';
import { createStaticServer } from '../scripts/serve.mjs';
import {
  buildCommandMenuMeta,
  buildCvContentHtml,
  buildJsonLd,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  buildVCard,
  computeYearsOfExperience,
  syncSecurityTxt,
} from '../scripts/sync-resume.mjs';

const ROOT = process.cwd();
const resume = JSON.parse(fs.readFileSync(path.join(ROOT, 'resume.json'), 'utf8'));

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

describe('sync-resume helpers', () => {
  it('computes years of experience from earliest work startDate', () => {
    const years = computeYearsOfExperience(resume, 2026);
    assert.equal(years, 18);
    assert.equal(computeYearsOfExperience({ work: [] }, 2026), null);
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
        name: 'Ada; Lovelace',
        email: 'ada@example.com',
        url: 'https://example.com',
        label: 'Mathematician, Pioneer\nLead',
        location: { city: 'London, UK', region: 'Greater;London', countryCode: 'GB' },
      },
      work: [
        { name: 'Past Co', endDate: '2020-01' },
        { name: 'Engine; Labs, Inc.' },
      ],
      meta: { jobTitle: 'Lead, Systems; R&D' },
    });
    assert.ok(customVcf.includes('FN:Ada\\; Lovelace\r\n'));
    assert.ok(customVcf.includes('ORG:Engine\\; Labs\\, Inc.\r\n'));
    assert.ok(customVcf.includes('TITLE:Lead\\, Systems\\; R&D\r\n'));
    assert.ok(customVcf.includes('ADR;TYPE=HOME:;;;London\\, UK;Greater\\;London;;GB\r\n'));
    assert.ok(customVcf.includes('NOTE:Mathematician\\, Pioneer\\nLead\r\n'));
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

    const noCurrentJob = buildJsonLd({
      ...resume,
      work: [{ name: 'Past Corp', startDate: '2020-01', endDate: '2022-01' }],
    });
    const noJobPerson = noCurrentJob['@graph'].find((n) => n['@type'] === 'Person');
    assert.equal(noJobPerson.worksFor, undefined);
  });

  it('builds llms.txt, robots.txt, sitemap.xml, security.txt, and command-menu metadata', () => {
    const txt = buildLlmsTxt(resume);
    assert.ok(txt.includes(`# ${resume.basics.name}`));
    assert.ok(txt.includes('## Experience'));
    assert.ok(txt.includes('## Selected Projects'));
    assert.ok(txt.includes('## Machine-Readable & Verification Endpoints'));
    assert.ok(txt.includes('/resume.pdf'));
    assert.ok(txt.includes('/contact.vcf'));
    assert.ok(txt.includes('/architecture/'));

    const robots = buildRobotsTxt({ basics: { url: 'https://example.dev/' } });
    assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://example.dev/sitemap.xml\n');

    const sitemap = buildSitemapXml({ basics: { url: 'https://example.dev/' } });
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

    const panelMeta = buildCommandMenuMeta(resume);
    assert.ok(panelMeta.includes(`email: '${resume.basics.email}'`));
    assert.ok(panelMeta.includes('hasLanguages: true'));
  });

  it('renders CV HTML safely without .tag-sep spans and respects showInPrint and escaping', () => {
    const html = buildCvContentHtml({
      ...resume,
      basics: {
        ...resume.basics,
        name: 'Test <script>User</script>',
      },
      awards: [{ title: 'Honor', date: '2025-07-01' }],
      languages: [],
    });
    assert.ok(!html.includes('<script>User</script>'));
    assert.ok(html.includes('Test &lt;script&gt;User&lt;/script&gt;'));
    assert.ok(!html.includes('tag-sep'));
    assert.ok(html.includes('id="about" tabindex="-1"'));
    assert.ok(html.includes('id="projects" aria-labelledby="projects-heading" class="cv-section animate-fade-in delay-3 no-print"'));
    assert.ok(!html.includes('id="languages"'));
  });
});

describe('asset & pdf helpers', () => {
  it('rewrites exact asset paths without prefix collisions', () => {
    const input = '<script src="/assets/js/command-menu.js"></script><script src="/assets/js/command-menu-panel.js"></script>';
    const output = rewriteAssetRefs(input, {
      '/assets/js/command-menu.js': '/assets/js/command-menu.1111aaaa.js',
      '/assets/js/command-menu-panel.js': '/assets/js/command-menu-panel.2222bbbb.js',
    });
    assert.ok(output.includes('/assets/js/command-menu.1111aaaa.js'));
    assert.ok(output.includes('/assets/js/command-menu-panel.2222bbbb.js'));
    assert.ok(!output.includes('command-menu.1111aaaa.js-panel'));
  });

  it('counts PDF pages from Pages /Count dictionary or fallback /Page objects', () => {
    assert.equal(countPdfPages(Buffer.from('%PDF-1.4 << /Type /Pages /Count 1 >>')), 1);
    assert.equal(countPdfPages(Buffer.from('%PDF-1.4 << /Type /Page >> << /Type /Page >>')), 2);
    assert.equal(countPdfPages(Buffer.from('not a pdf')), 0);
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

  it('preserves whitespace inside <pre> blocks and around inline <svg>/<pre> elements', () => {
    const input =
      '<div>\n  <pre>  line 1\n    line 2  </pre>\n</div>\n<span>a</span> <pre>b</pre> <svg><circle cx="1" cy="1" r="1"></circle></svg> <span>c</span>';
    const output = minifyHtml(input);
    assert.ok(output.includes('<pre>  line 1\n    line 2  </pre>'));
    assert.ok(output.includes('<span>a</span> <pre>b</pre>'));
    assert.ok(output.includes('</svg> <span>c</span>'));
  });

  it('collapses container boundaries while preserving inline link spacing', () => {
    const input = '<ul><li>\n  <a href="/a">A</a> <a href="/b">B</a>\n</li></ul>';
    const output = minifyHtml(input);
    assert.equal(output, '<ul><li><a href="/a">A</a> <a href="/b">B</a></li></ul>\n');
  });
});

describe('static server routing and security guards', () => {
  it('handles 200, 301 trailing-slash redirect, 400, 403 traversal/symlink, 404, 405, and HEAD', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'site-srv-test-'));
    const tmpDir = path.join(tmpRoot, '_site');
    const outsideFile = path.join(tmpRoot, 'secret.txt');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>Home</h1>', 'utf8');
    fs.writeFileSync(path.join(tmpDir, '404.html'), '<h1>Missing</h1>', 'utf8');
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
      assert.equal(home.body, '<h1>Home</h1>');

      const redirect = await httpRequest(port, '/quality?v=1');
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.location, '/quality/?v=1');

      const head = await httpRequest(port, '/quality/', 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body, '');

      const post = await httpRequest(port, '/', 'POST');
      assert.equal(post.status, 405);
      assert.equal(post.headers.allow, 'GET, HEAD');

      const traversal = await httpRequest(port, '/%2e%2e/etc/passwd');
      assert.equal(traversal.status, 403);

      const symlinkLeak = await httpRequest(port, '/leak.txt');
      assert.equal(symlinkLeak.status, 403);

      const doubleSlash = await httpRequest(port, '//evil.test/foo');
      assert.equal(doubleSlash.status, 400);

      const nullByte = await httpRequest(port, '/foo%00bar');
      assert.equal(nullByte.status, 400);

      const crlf = await httpRequest(port, '/foo%0d%0abar');
      assert.equal(crlf.status, 400);

      const malformed = await httpRequest(port, '/%E0%A4%A');
      assert.equal(malformed.status, 400);

      const notFound = await httpRequest(port, '/does-not-exist');
      assert.equal(notFound.status, 404);
      assert.equal(notFound.body, '<h1>Missing</h1>');
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('theme-init graceful degradation', () => {
  it('falls back cleanly when localStorage and matchMedia throw', () => {
    const code = fs.readFileSync(path.join(ROOT, 'assets/js/theme-init.js'), 'utf8');
    const runInit = ({ storedThrows = false, storedValue = null, mqThrows = false, dark = false }) => {
      const classes = new Set();
      const metas = [
        { content: '#fafaf8', setAttribute(_k, v) { this.content = v; } },
        { content: '#0d0c0a', setAttribute(_k, v) { this.content = v; } },
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
