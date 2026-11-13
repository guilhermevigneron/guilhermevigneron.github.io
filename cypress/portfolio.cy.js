/**
 * Comprehensive E2E, Zero-External-Network, Accessibility (WCAG AA),
 * Security, and Content Parity test suite for guilhermevigneron.dev.
 */

const THIRD_PARTY_DOMAINS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'drive.google.com',
];

const CHROME_INTERNAL_HOSTS = new Set([
  'edgedl.me.gvt1.com',
  'update.googleapis.com',
  'clients2.google.com',
  'optimizationguide-pa.googleapis.com',
  'safebrowsing.googleapis.com',
]);

function isLocalUrl(rawUrl) {
  const baseUrl = Cypress.config('baseUrl') || 'http://127.0.0.1:4000';
  return (
    rawUrl.startsWith(baseUrl) ||
    rawUrl.startsWith('http://127.0.0.1') ||
    rawUrl.startsWith('http://localhost') ||
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('blob:')
  );
}

function isBrowserInternalRequest(req) {
  try {
    const { hostname } = new URL(req.url);
    return !req.headers?.referer && CHROME_INTERNAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function logAxeViolations(violations) {
  violations.forEach((v) => {
    const targets = v.nodes.map((n) => n.target.join(' ')).join('; ');
    cy.log(`AXE [${v.impact}] ${v.id}: ${v.help} (${targets})`);
  });
}

describe('Zero Third-Party Dependencies & Local-First Assets', () => {
  ['/', '/404.html', '/quality/'].forEach((route) => {
    it(`loads ${route} with zero outgoing requests to external third-party domains`, () => {
      const externalRequests = [];

      cy.intercept({ url: /^https?:\/\//i }, (req) => {
        if (!isLocalUrl(req.url)) {
          if (!isBrowserInternalRequest(req)) {
            externalRequests.push(req.url);
          }
          req.destroy();
          return;
        }
        req.continue();
      });

      cy.visit(route, { failOnStatusCode: route !== '/404.html' });

      cy.window().then((win) => {
        const resourceEntries = win.performance.getEntriesByType('resource');
        const externalResources = resourceEntries
          .map((entry) => entry.name)
          .filter((name) => !isLocalUrl(name));

        const allExternal = [...new Set([...externalRequests, ...externalResources])];
        cy.task('recordNetworkAudit', { route, externalUrls: allExternal }).then(() => {
          expect(
            allExternal,
            `Unexpected external requests on ${route}: ${allExternal.join(', ')}`
          ).to.deep.equal([]);
        });
      });
    });
  });

  it('serves self-hosted Geist fonts, avatar image, and compiled CSS with zero CDN references', () => {
    cy.request('/assets/fonts/GeistMono-Variable.woff2').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('font/woff2');
      expect(res.body.length).to.be.greaterThan(10000);
    });

    cy.request('/assets/fonts/GeistPixel-Square.woff2').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('font/woff2');
      expect(res.body.length).to.be.greaterThan(10000);
    });

    cy.request({ url: '/assets/avatar.jpg', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/jpeg');
      expect(res.body.length).to.be.greaterThan(5000);
    });

    cy.request('/assets/css/styles.css').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('text/css');
      expect(res.body).to.include('@font-face');
      expect(res.body).to.include('GeistMono-Variable.woff2');
      expect(res.body).to.include('GeistPixel-Square.woff2');
      expect(res.body).to.include('@media print');
    });

    cy.visit('/');
    cy.get('link[rel="stylesheet"]')
      .should('have.attr', 'href')
      .then((href) => {
        expect(href).to.match(/^\/assets\/css\/styles\.[a-f0-9]+\.css$/);
        cy.request(href).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.headers['content-type']).to.include('text/css');
          expect(res.body).to.include('.icon-btn svg');
        });
      });
    cy.get('script[src*="/assets/js/theme"]').each(($script) => {
      const src = $script.attr('src');
      expect(src).to.match(/^\/assets\/js\/theme\.[a-f0-9]+\.js$/);
      cy.request(src).its('status').should('eq', 200);
    });
    cy.get('script[src*="/assets/js/command-menu"]').each(($script) => {
      const src = $script.attr('src');
      expect(src).to.match(/^\/assets\/js\/command-menu\.[a-f0-9]+\.js$/);
      cy.request(src).its('status').should('eq', 200);
    });

    cy.document().then(async (doc) => {
      await doc.fonts.ready;
      expect(doc.fonts.check('400 16px "Geist Mono"')).to.eq(true);
      expect(doc.fonts.check('500 24px "Geist Pixel Square"')).to.eq(true);
    });

    cy.get('img[src="/assets/avatar.jpg"]')
      .should('be.visible')
      .and(($img) => {
        expect($img[0].naturalWidth).to.be.greaterThan(0);
      });

    cy.document().its('documentElement.outerHTML').then((html) => {
      THIRD_PARTY_DOMAINS.forEach((domain) => {
        expect(html).to.not.include(domain);
      });
    });

    cy.get('i[class*="fa"]').should('have.length', 0);
  });
});

describe('Portfolio Content, Inline SVGs & Navigation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('renders title, header, subtitle, five sections, and footer with quality link', () => {
    cy.title().should('eq', 'Guilherme Vigneron de Oliveira - Principal Technologist');
    cy.contains('h1', 'Guilherme Vigneron de Oliveira').should('be.visible');
    cy.contains('Principal Technologist | QA & Software Testing Expert').should('be.visible');

    cy.contains('h2', 'About Me').should('be.visible');
    cy.contains('h2', 'Professional Experience').should('be.visible');
    cy.contains('h2', 'Core Competencies').should('be.visible');
    cy.contains('h2', 'Publications & Awards').should('be.visible');
    cy.contains('h2', 'Education').should('be.visible');

    cy.get('footer').should('be.visible');
    cy.get('footer').should('contain.text', '2026 Guilherme Vigneron de Oliveira');
    cy.get('footer a[href="/quality/"]').should('be.visible');
  });

  it('uses accessible inline SVGs instead of Font Awesome for social navigation', () => {
    cy.get('nav[aria-label="Social links"]').within(() => {
      cy.get('a[aria-label="LinkedIn Profile (opens in a new tab)"]')
        .should('be.visible')
        .and('have.attr', 'href', 'https://www.linkedin.com/in/guilherme-vigneron-de-oliveira');

      cy.get('a[aria-label="GitHub Profile (opens in a new tab)"]')
        .should('be.visible')
        .and('have.attr', 'href', 'https://github.com/guilhermevigneron');

      cy.get('a[aria-label="Email"]')
        .should('be.visible')
        .and('have.attr', 'href', 'mailto:email@gvo.simplelogin.com');

      cy.get('svg[aria-hidden="true"][focusable="false"]').should('have.length', 3);
    });
  });

  it('enforces explicit dimensions and compact rendered sizes on all SVG icons', () => {
    ['/', '/404.html', '/quality/'].forEach((route) => {
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('link[rel="stylesheet"]')
        .should('have.attr', 'href')
        .and('match', /^\/assets\/css\/styles\.[a-f0-9]+\.css$/);

      cy.get('svg')
        .should('have.length.greaterThan', 0)
        .each(($svg) => {
          const widthAttr = Number($svg.attr('width'));
          const heightAttr = Number($svg.attr('height'));
          expect(widthAttr, `${route} svg width attr`).to.be.greaterThan(0).and.at.most(24);
          expect(heightAttr, `${route} svg height attr`).to.be.greaterThan(0).and.at.most(24);
          if ($svg.is(':visible')) {
            const rect = $svg[0].getBoundingClientRect();
            expect(rect.width, `${route} visible svg width`).to.be.greaterThan(0).and.at.most(24);
            expect(rect.height, `${route} visible svg height`).to.be.greaterThan(0).and.at.most(24);
          }
        });
    });

    cy.viewport(1280, 800);
    cy.visit('/');
    cy.get('#command-trigger').click();
    cy.get('#command-dialog svg').each(($svg) => {
      const rect = $svg[0].getBoundingClientRect();
      expect(rect.width, 'command dialog svg width').to.be.greaterThan(0).and.at.most(24);
      expect(rect.height, 'command dialog svg height').to.be.greaterThan(0).and.at.most(24);
    });
  });

  it('enforces rel="noopener noreferrer" on all external target="_blank" links', () => {
    cy.get('a[target="_blank"]').each(($link) => {
      cy.wrap($link)
        .should('have.attr', 'rel')
        .and('include', 'noopener')
        .and('include', 'noreferrer');
    });
  });

  it('includes complete SEO metadata and Schema.org JSON-LD', () => {
    cy.get('meta[name="description"]').should('have.attr', 'content').and('not.be.empty');
    cy.get('meta[property="og:type"]').should('have.attr', 'content', 'profile');
    cy.get('meta[property="og:url"]').should('have.attr', 'content', 'https://guilhermevigneron.dev');
    cy.get('link[rel="canonical"]').should('have.attr', 'href', 'https://guilhermevigneron.dev');
    cy.get('a[href="#about"]').should('exist');
  });
});

describe('Theme Toggle & Persistence', () => {
  it('toggles dark/light mode and persists choice in localStorage across reload', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('theme');
      },
    });

    cy.get('html').invoke('removeClass', 'dark');
    cy.get('#theme-toggle').should('be.visible').click();
    cy.get('html').should('have.class', 'dark');
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'dark');

    cy.reload();
    cy.get('html').should('have.class', 'dark');

    cy.get('#theme-toggle').click();
    cy.get('html').should('not.have.class', 'dark');
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'light');
  });
});

describe('Command Menu Interaction', () => {
  it('opens via trigger or Ctrl+J, passes axe-core while open, filters items, and closes cleanly', () => {
    cy.viewport(1280, 800);
    cy.visit('/');

    cy.get('#command-dialog').should('not.be.visible');
    cy.get('#command-trigger').should('be.visible').click();
    cy.get('#command-dialog').should('be.visible');
    cy.focused().should('have.id', 'command-input');

    cy.injectAxe();
    cy.checkA11y('#command-dialog');

    cy.get('#command-input').type('{downarrow}');
    cy.get('#command-dialog .cmd-item[data-selected="true"]').should('have.length', 1);

    cy.get('#command-input').type('Quality');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Live Quality Report').should('be.visible');
    cy.get('#command-empty').should('not.be.visible');

    cy.get('#command-input').clear().type('nonexistent-command-xyz');
    cy.get('#command-empty').should('be.visible').and('contain.text', 'No results found.');

    cy.get('#command-input').type('{esc}');
    cy.get('#command-dialog').should('not.be.visible');

    cy.get('body').type('{ctrl}j');
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-close').click();
    cy.get('#command-dialog').should('not.be.visible');
  });
});

describe('Automated Resume PDF Pipeline', () => {
  it('links to self-hosted /resume.pdf and serves a valid non-empty PDF payload', () => {
    cy.visit('/');
    cy.contains('a', 'Download My Resume')
      .should('be.visible')
      .and('have.attr', 'href', '/resume.pdf');

    cy.request({ url: '/resume.pdf', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('application/pdf');
      expect(res.body.length).to.be.greaterThan(5000);
      expect(res.body.slice(0, 5)).to.eq('%PDF-');
    });
  });
});

describe('Machine-Readable Endpoints, Security Policy & 404 Page', () => {
  it('keeps /resume.json, index.html JSON-LD, and /llms.txt in sync', () => {
    cy.request('/resume.json').then((resumeRes) => {
      expect(resumeRes.status).to.eq(200);
      const resume =
        typeof resumeRes.body === 'string' ? JSON.parse(resumeRes.body) : resumeRes.body;

      expect(resume.basics.name).to.eq('Guilherme Vigneron de Oliveira');
      expect(resume.work).to.have.length(3);
      expect(resume.skills).to.have.length(11);
      expect(resume.meta.resumePdf).to.eq('/resume.pdf');

      cy.visit('/');
      cy.get('script[type="application/ld+json"]')
        .should('exist')
        .then(($script) => {
          const jsonLd = JSON.parse($script.text());
          expect(jsonLd['@type']).to.eq('Person');
          expect(jsonLd.name).to.eq(resume.basics.name);
          expect(jsonLd.jobTitle).to.eq(resume.meta.jobTitle);
          expect(jsonLd.email).to.eq(resume.basics.email);
          expect(jsonLd.worksFor.name).to.eq(resume.work[0].name);
          expect(jsonLd.knowsAbout).to.deep.eq(resume.skills.map((s) => s.name));
        });

      cy.request('/llms.txt').then((llmsRes) => {
        expect(llmsRes.status).to.eq(200);
        const llms = llmsRes.body;
        expect(llms).to.include(resume.basics.name);
        expect(llms).to.include(resume.meta.resumePdfUrl);
        expect(llms).to.include(resume.meta.resumeJsonUrl);
        expect(llms).to.not.include('drive.google.com');
        resume.work.forEach((job) => expect(llms).to.include(job.position));
        resume.skills.forEach((skill) => expect(llms).to.include(skill.name));
        resume.publications.forEach((pub) => expect(llms).to.include(pub.url));
      });
    });
  });

  it('serves a compliant RFC 9116 /.well-known/security.txt expiring >= 30 days in the future', () => {
    cy.request('/.well-known/security.txt').then((res) => {
      expect(res.status).to.eq(200);
      const body = res.body;

      expect(body).to.match(/^Contact:\s*mailto:guilhermevigneron@gmail\.com$/m);
      expect(body).to.match(
        /^Canonical:\s*https:\/\/guilhermevigneron\.dev\/\.well-known\/security\.txt$/m
      );
      expect(body).to.match(/^Preferred-Languages:\s*en,\s*pt$/m);

      const expiresMatch = body.match(/^Expires:\s*(.+)$/m);
      expect(expiresMatch, 'Expires directive must be present').to.not.be.null;
      const expiresMs = Date.parse(expiresMatch[1].trim());
      expect(Number.isNaN(expiresMs), 'Expires must be a valid ISO timestamp').to.eq(false);

      const daysRemaining = (expiresMs - Date.now()) / (1000 * 60 * 60 * 24);
      expect(
        daysRemaining,
        `security.txt Expires must be at least 30 days away (got ${daysRemaining.toFixed(1)}d)`
      ).to.be.at.least(30);
    });
  });

  it('serves branded 404.html with a working link back to / and handles malformed URLs cleanly', () => {
    cy.request({ url: '/nonexistent-route-check', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body).to.include('Page Not Found');
    });

    cy.request({ url: '/%E0%A4%A', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(400);
    });

    cy.visit('/404.html');
    cy.contains('h1', 'Page Not Found').should('be.visible');
    cy.contains('a', 'Back to Portfolio').should('have.attr', 'href', '/');
  });

  it('serves /quality/ verification report and /sitemap.xml', () => {
    cy.visit('/quality/');
    cy.contains('h1', 'Quality & Verification Report').should('be.visible');
    cy.contains('Zero Third-Party Network Requests').should('be.visible');
    cy.contains('WCAG 2.1 AA Accessibility').should('be.visible');

    cy.request('/sitemap.xml').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.include('https://guilhermevigneron.dev/');
      expect(res.body).to.include('https://guilhermevigneron.dev/resume.pdf');
    });
  });
});

describe('WCAG 2.1 AA Accessibility Matrix (Light/Dark & Mobile/Desktop)', () => {
  const matrix = [
    { route: '/', viewport: [1280, 800], theme: 'light', label: 'home-desktop-light' },
    { route: '/', viewport: [1280, 800], theme: 'dark', label: 'home-desktop-dark' },
    { route: '/', viewport: [375, 667], theme: 'light', label: 'home-mobile-light' },
    { route: '/', viewport: [375, 667], theme: 'dark', label: 'home-mobile-dark' },
    { route: '/404.html', viewport: [1280, 800], theme: 'light', label: '404-desktop-light' },
    { route: '/404.html', viewport: [1280, 800], theme: 'dark', label: '404-desktop-dark' },
    { route: '/quality/', viewport: [1280, 800], theme: 'light', label: 'quality-desktop-light' },
    { route: '/quality/', viewport: [1280, 800], theme: 'dark', label: 'quality-desktop-dark' },
  ];

  matrix.forEach(({ route, viewport, theme, label }) => {
    it(`passes cy.checkA11y() for ${label}`, () => {
      cy.viewport(viewport[0], viewport[1]);
      cy.visit(route, {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', theme);
        },
      });
      cy.get('html').should(theme === 'dark' ? 'have.class' : 'not.have.class', 'dark');
      cy.injectAxe();

      let count = 0;
      cy.checkA11y(
        null,
        null,
        (violations) => {
          count = violations.length;
          logAxeViolations(violations);
        },
        true
      ).then(() => {
        cy.task('recordA11yAudit', { label, violations: count });
        expect(count, `WCAG AA violations detected on ${label}`).to.eq(0);
      });
    });
  });
});
