/**
 * Comprehensive E2E, Zero-External-Network, Accessibility (WCAG AA),
 * Security, and Content Parity test suite for guilhermevigneron.dev.
 */

import resume from '../resume.json';

const SITE_URL = String(resume.meta?.canonical || resume.basics.url).replace(/\/$/, '');
const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_PDF_PAGES = Number(resume.meta?.maxPdfPages || 1);
const PROJECTS = resume.projects || [];
const ALL_PROJECTS_NO_PRINT =
  PROJECTS.length > 0 && PROJECTS.every((project) => project.showInPrint === false);
const ACTIVE_JOB = (resume.work || []).find((job) => !job.endDate);
const LINKEDIN_PROFILE = resume.basics.profiles.find(
  (profile) => profile.network.toLowerCase() === 'linkedin'
);
const GITHUB_PROFILE = resume.basics.profiles.find(
  (profile) => profile.network.toLowerCase() === 'github'
);
const FIRST_PROJECT = PROJECTS[0];

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
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    const baseOrigin = new URL(Cypress.config('baseUrl') || 'http://127.0.0.1:4000').origin;
    return parsed.origin === baseOrigin;
  } catch {
    return false;
  }
}

function isBrowserInternalRequest(req) {
  try {
    const { hostname, pathname } = new URL(req.url);
    if (req.headers?.referer) {
      return false;
    }
    if (CHROME_INTERNAL_HOSTS.has(hostname)) {
      return true;
    }
    // Chrome's internal Search/AI-mode background request (/async/folae)
    return hostname === 'www.google.com' && pathname === '/async/folae';
  } catch {
    return false;
  }
}

function runAxeAndRecord(label, context = null) {
  let recordedViolations = [];
  return cy
    .checkA11y(
      context,
      null,
      (violations) => {
        recordedViolations = violations;
      },
      true
    )
    .then(() => {
      recordedViolations.forEach((v) => {
        const targets = v.nodes.map((n) => n.target.join(' ')).join('; ');
        cy.log(`AXE [${v.impact}] ${v.id}: ${v.help} (${targets})`);
      });
      if (label) {
        cy.task('recordA11yAudit', { label, violations: recordedViolations.length });
      }
      expect(
        recordedViolations.length,
        `WCAG AA violations detected${label ? ` on ${label}` : ''}`
      ).to.eq(0);
    });
}

describe('Zero Third-Party Dependencies & Local-First Assets', () => {
  ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
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

  it('serves self-hosted Geist fonts, responsive avatar images, favicons, split CSS, and lazy JS with zero CDN references', () => {
    cy.request('/assets/fonts/GeistMono-Variable.woff2').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('font/woff2');
      expect(res.body.length).to.be.greaterThan(10000);
    });

    cy.request('/assets/fonts/GeistPixel-Square.woff2').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('font/woff2');
      expect(res.body.length).to.be.greaterThan(2000);
    });

    cy.request({ url: '/assets/avatar.jpg', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/jpeg');
      expect(res.body.length).to.be.greaterThan(5000);
    });

    ['168', '224', '336'].forEach((size) => {
      cy.request({ url: `/assets/avatar-${size}.avif`, encoding: 'binary' }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.headers['content-type']).to.include('image/avif');
      });
      cy.request({ url: `/assets/avatar-${size}.webp`, encoding: 'binary' }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.headers['content-type']).to.include('image/webp');
      });
    });

    cy.request({ url: resume.meta.ogImage, encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/png');
      expect(res.body.length).to.be.greaterThan(5000);
      expect(res.body.slice(1, 4)).to.eq('PNG');
      expect(res.body.slice(12, 16), `${resume.meta.ogImage} IHDR chunk`).to.eq('IHDR');
      const width =
        ((res.body.charCodeAt(16) << 24) >>> 0) +
        (res.body.charCodeAt(17) << 16) +
        (res.body.charCodeAt(18) << 8) +
        res.body.charCodeAt(19);
      const height =
        ((res.body.charCodeAt(20) << 24) >>> 0) +
        (res.body.charCodeAt(21) << 16) +
        (res.body.charCodeAt(22) << 8) +
        res.body.charCodeAt(23);
      expect(width, `${resume.meta.ogImage} width`).to.eq(1200);
      expect(height, `${resume.meta.ogImage} height`).to.eq(630);
    });

    cy.request('/assets/favicon.svg').its('status').should('eq', 200);
    cy.request({ url: '/favicon.ico', encoding: 'binary' }).its('status').should('eq', 200);
    cy.request('/site.webmanifest').then((res) => {
      expect(res.status).to.eq(200);
      const manifest = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      expect(manifest.short_name).to.eq(resume.meta.shortName);
      expect(manifest.description).to.eq(resume.meta.manifestDescription);
      manifest.icons.forEach((icon) => {
        cy.request({ url: icon.src, encoding: 'binary' }).its('status').should('eq', 200);
      });
    });

    cy.request('/assets/css/styles.css').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('text/css');
      expect(res.body).to.include('@font-face');
      expect(res.body).to.match(/GeistMono-Variable\.[a-f0-9]+\.woff2/);
      expect(res.body).to.match(/GeistPixel-Square\.[a-f0-9]+\.woff2/);
    });

    cy.request('/assets/css/print.css').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('text/css');
      expect(res.body).to.include('@media print');
    });

    cy.visit('/');
    cy.get('link[rel="stylesheet"]:not([media="print"])')
      .should('have.attr', 'href')
      .then((href) => {
        expect(href).to.match(/^\/assets\/css\/styles\.[a-f0-9]+\.css$/);
        cy.request(href).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.headers['content-type']).to.include('text/css');
          expect(res.body).to.include('.icon-btn svg');
        });
      });
    cy.get('link[rel="stylesheet"][media="print"]')
      .should('have.attr', 'href')
      .and('match', /^\/assets\/css\/print\.[a-f0-9]+\.css$/);
    cy.get('script[src*="/assets/js/theme-init."]').each(($script) => {
      const src = $script.attr('src');
      expect(src).to.match(/^\/assets\/js\/theme-init\.[a-f0-9]+\.js$/);
      cy.request(src).its('status').should('eq', 200);
    });
    cy.get('script[src*="/assets/js/theme."]').each(($script) => {
      const src = $script.attr('src');
      expect(src).to.match(/^\/assets\/js\/theme\.[a-f0-9]+\.js$/);
      cy.request(src).its('status').should('eq', 200);
    });
    cy.get('script[src*="/assets/js/command-menu."]').each(($script) => {
      const src = $script.attr('src');
      expect(src).to.match(/^\/assets\/js\/command-menu\.[a-f0-9]+\.js$/);
      cy.request(src).its('status').should('eq', 200);
    });

    cy.window().then((win) => {
      const initialUrls = win.performance.getEntriesByType('resource').map((entry) => entry.name);
      expect(
        initialUrls.some((url) => url.includes('command-menu-panel')),
        'command-menu-panel should be deferred until command palette is opened'
      ).to.eq(false);
    });

    cy.document().then(async (doc) => {
      await doc.fonts.ready;
      expect(doc.fonts.check('400 16px "Geist Mono"')).to.eq(true);
      expect(doc.fonts.check('500 24px "Geist Pixel Square"')).to.eq(true);
    });

    cy.get('picture.avatar-picture source[type="image/avif"]').should('exist');
    cy.get('picture.avatar-picture source[type="image/webp"]').should('exist');
    cy.get('picture.avatar-picture source').each(($source) => {
      const srcset = $source.attr('srcset') || '';
      const urls = srcset
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
      expect(urls.length).to.eq(3);
      urls.forEach((assetUrl) => {
        expect(assetUrl).to.match(/^\/assets\/avatar-(168|224|336)\.[a-f0-9]+\.(avif|webp)$/);
        cy.request({ url: assetUrl, encoding: 'binary' }).its('status').should('eq', 200);
      });
    });
    cy.get('img.avatar')
      .should('be.visible')
      .and('have.attr', 'src')
      .and('match', /^\/assets\/avatar\.[a-f0-9]+\.jpg$/);
    cy.get('img.avatar').should(($img) => {
      expect($img[0].naturalWidth).to.be.greaterThan(0);
      expect($img[0].currentSrc).to.match(/\/assets\/avatar(-\d+)?\.[a-f0-9]+\.(avif|webp|jpg)$/);
    });

    cy.document()
      .its('documentElement.outerHTML')
      .then((html) => {
        THIRD_PARTY_DOMAINS.forEach((domain) => {
          expect(html).to.not.include(domain);
        });
      });

    cy.get('i[class*="fa"]').should('have.length', 0);
  });

  it('enforces a strict Content-Security-Policy and referrer policy with zero runtime violations', () => {
    ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
      const violations = [];
      cy.visit(route, {
        failOnStatusCode: route !== '/404.html',
        onBeforeLoad(win) {
          win.addEventListener('securitypolicyviolation', (event) => {
            violations.push(`${event.violatedDirective}:${event.blockedURI}`);
          });
        },
      });

      cy.get('meta[http-equiv="Content-Security-Policy"]')
        .should('have.attr', 'content')
        .then((csp) => {
          expect(csp).to.include("default-src 'self'");
          expect(csp).to.include("script-src 'self'");
          expect(csp).to.include("style-src 'self'");
          expect(csp).to.include("object-src 'none'");
          expect(csp).to.include("form-action 'none'");
          expect(csp).to.not.include("'unsafe-inline'");
          expect(csp).to.not.include("'unsafe-eval'");
        });

      cy.get('meta[name="referrer"]').should(
        'have.attr',
        'content',
        'strict-origin-when-cross-origin'
      );

      cy.request({ url: route, failOnStatusCode: route !== '/404.html' }).then((res) => {
        const parsed = new DOMParser().parseFromString(res.body, 'text/html');
        const scripts = Array.from(parsed.querySelectorAll('script'));
        scripts.forEach((script) => {
          if (script.getAttribute('type') === 'application/ld+json') {
            return;
          }
          expect(script.getAttribute('src'), `${route} executable script must use src`).to.be.a(
            'string'
          ).and.not.be.empty;
        });
      });

      cy.document().then((doc) => doc.fonts.ready);
      cy.get('#theme-toggle').click();
      cy.get('#command-trigger').click();
      cy.get('#command-dialog').should('be.visible');
      cy.get('#command-close').click();
      cy.get('#command-dialog').should('not.be.visible');

      cy.then(() => {
        expect(violations, `CSP violations on ${route}`).to.deep.equal([]);
      });
    });
  });
});

describe('Portfolio Content, Inline SVGs & Navigation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('renders title, header, subtitle, semantic sections, CSS tag separators, and footer', () => {
    cy.title().should('eq', resume.meta.pageTitle);
    cy.contains('h1', resume.basics.name).should('be.visible');
    cy.contains(resume.basics.label).should('be.visible');

    cy.contains('h2', 'Summary').should('be.visible');
    cy.contains('h2', 'Professional Experience').should('be.visible');
    cy.contains('h2', 'Selected Projects').should('be.visible');
    cy.contains('h2', 'Skills').should('be.visible');
    cy.contains('h2', 'Publications & Awards').should('be.visible');
    cy.contains('h2', 'Education').should('be.visible');
    if (resume.languages?.length) {
      cy.contains('h2', 'Languages').should('be.visible');
    }

    cy.get('.tag-list .tag-sep').should('have.length', 0);

    cy.get(`.header-actions a[href="${resume.meta.resumePdf}"]`).should('be.visible');

    cy.get('#projects')
      .should(ALL_PROJECTS_NO_PRINT ? 'have.class' : 'not.have.class', 'no-print')
      .within(() => {
        if (FIRST_PROJECT) {
          cy.contains('a', FIRST_PROJECT.name)
            .should('be.visible')
            .and('have.attr', 'href', FIRST_PROJECT.url);
          for (const extra of FIRST_PROJECT.links || []) {
            cy.contains('a', extra.label).should('have.attr', 'href', extra.url);
          }
        }
      });

    cy.get('footer').should('be.visible');
    cy.get('footer').should('contain.text', `${CURRENT_YEAR} ${resume.basics.name}`);
    cy.get('footer a[href="/architecture/"]').should('be.visible');
    cy.get('footer a[href="/quality/"]').should('be.visible');
  });

  it('provides working skip-to-main link that becomes visible on focus across routes', () => {
    cy.get('.skip-link').focus().should('be.visible').click();
    cy.location('hash').should('eq', '#about');

    cy.visit('/architecture/');
    cy.get('.skip-link').focus().should('be.visible').click();
    cy.location('hash').should('eq', '#main-content');
  });

  it('uses accessible inline SVGs instead of Font Awesome for social navigation', () => {
    cy.get('nav[aria-label="Social links"]').within(() => {
      if (LINKEDIN_PROFILE) {
        cy.get('a[aria-label="LinkedIn Profile (opens in a new tab)"]')
          .should('be.visible')
          .and('have.attr', 'href', LINKEDIN_PROFILE.url);
      }

      if (GITHUB_PROFILE) {
        cy.get('a[aria-label="GitHub Profile (opens in a new tab)"]')
          .should('be.visible')
          .and('have.attr', 'href', GITHUB_PROFILE.url);
      }

      cy.get('a[aria-label="Email"]')
        .should('be.visible')
        .and('have.attr', 'href', `mailto:${resume.basics.email}`);

      cy.get('svg[aria-hidden="true"][focusable="false"]').should('have.length', 3);
    });
  });

  it('enforces explicit dimensions and compact rendered sizes on all SVG icons', () => {
    ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('link[rel="stylesheet"][href*="/assets/css/styles."]')
        .should('have.attr', 'href')
        .and('match', /^\/assets\/css\/styles\.[a-f0-9]+\.css$/);

      if (route !== '/') {
        cy.get('link[rel="stylesheet"][href*="/assets/css/subpage."]')
          .should('have.attr', 'href')
          .and('match', /^\/assets\/css\/subpage\.[a-f0-9]+\.css$/);
        cy.get('link[rel="stylesheet"][media="print"][href*="/assets/css/print."]')
          .should('have.attr', 'href')
          .and('match', /^\/assets\/css\/print\.[a-f0-9]+\.css$/);
      }

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
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-dialog svg')
      .should('have.length.greaterThan', 0)
      .each(($svg) => {
        const rect = $svg[0].getBoundingClientRect();
        expect(rect.width, 'command dialog svg width').to.be.greaterThan(0).and.at.most(24);
        expect(rect.height, 'command dialog svg height').to.be.greaterThan(0).and.at.most(24);
      });
  });

  it('enforces rel="noopener noreferrer" on all external target="_blank" links across routes', () => {
    ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('body').then(($body) => {
        const blanks = $body.find('a[target="_blank"]');
        if (blanks.length > 0) {
          cy.wrap(blanks).each(($link) => {
            cy.wrap($link)
              .should('have.attr', 'rel')
              .and('include', 'noopener')
              .and('include', 'noreferrer');
          });
        }
      });
    });
  });

  it('includes complete SEO metadata, OG image card, and Schema.org JSON-LD', () => {
    cy.get('meta[name="description"]').should('have.attr', 'content').and('not.be.empty');
    cy.get('meta[property="og:type"]').should('have.attr', 'content', 'profile');
    cy.get('meta[property="og:url"]').should('have.attr', 'content', `${SITE_URL}/`);
    cy.get('meta[property="og:image"]')
      .should('have.attr', 'content')
      .and('match', /^https:\/\/guilhermevigneron\.dev\/assets\/og-card(?:\.[a-f0-9]+)?\.png$/);
    cy.get('meta[name="twitter:image"]')
      .should('have.attr', 'content')
      .and('match', /^https:\/\/guilhermevigneron\.dev\/assets\/og-card(?:\.[a-f0-9]+)?\.png$/);
    cy.get('meta[name="twitter:image:alt"]').should('have.attr', 'content').and('not.be.empty');
    cy.get('link[rel="canonical"]').should('have.attr', 'href', `${SITE_URL}/`);
    cy.get('a[href="#about"]').should('exist');
  });
});

describe('Theme Toggle & Persistence', () => {
  it('toggles dark/light mode, syncs all theme-color tags & ARIA state, and persists across reload', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });

    cy.get('html').should('not.have.class', 'dark');
    cy.get('.theme-icon-moon').should('be.visible');
    cy.get('.theme-icon-sun').should('not.be.visible');
    cy.get('#theme-toggle')
      .should('be.visible')
      .and('have.attr', 'aria-pressed', 'false')
      .and('have.attr', 'aria-label', 'Switch to dark theme')
      .click();

    cy.get('html').should('have.class', 'dark');
    cy.get('.theme-icon-sun').should('be.visible');
    cy.get('.theme-icon-moon').should('not.be.visible');
    cy.get('#theme-toggle')
      .should('have.attr', 'aria-pressed', 'true')
      .and('have.attr', 'aria-label', 'Switch to light theme');
    cy.get('meta[name="theme-color"]').each(($meta) => {
      expect($meta.attr('content')).to.eq('#0d0c0a');
    });
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'dark');

    cy.reload();
    cy.get('html').should('have.class', 'dark');
    cy.get('meta[name="theme-color"]').each(($meta) => {
      expect($meta.attr('content')).to.eq('#0d0c0a');
    });

    cy.get('#theme-toggle').click();
    cy.get('html').should('not.have.class', 'dark');
    cy.get('meta[name="theme-color"]').each(($meta) => {
      expect($meta.attr('content')).to.eq('#fafaf8');
    });
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'light');
  });

  it('respects explicit light preference over dark system preference and handles live media change listeners', () => {
    let mediaChangeListener = null;

    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('theme');
        cy.stub(win, 'matchMedia').returns({
          matches: false,
          media: '(prefers-color-scheme: dark)',
          addEventListener(evt, fn) {
            if (evt === 'change') mediaChangeListener = fn;
          },
          removeEventListener() {},
        });
      },
    });

    cy.get('html')
      .should('not.have.class', 'dark')
      .then(() => {
        expect(mediaChangeListener).to.be.a('function');
        mediaChangeListener({ matches: true });
      });
    cy.get('html')
      .should('have.class', 'dark')
      .then(() => {
        mediaChangeListener({ matches: false });
      });
    cy.get('html').should('not.have.class', 'dark');

    // Once user stores 'light', system dark change event should not override explicit preference
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        cy.stub(win, 'matchMedia').returns({
          matches: true,
          media: '(prefers-color-scheme: dark)',
          addEventListener(evt, fn) {
            if (evt === 'change') mediaChangeListener = fn;
          },
          removeEventListener() {},
        });
      },
    });
    cy.get('html')
      .should('not.have.class', 'dark')
      .then(() => {
        mediaChangeListener({ matches: true });
      });
    cy.get('html').should('not.have.class', 'dark');
  });

  it('ignores non-theme localStorage values, handles SecurityError storage blocks, and persists on subpages', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'system');
        cy.stub(win, 'matchMedia').returns({
          matches: true,
          media: '(prefers-color-scheme: dark)',
          addEventListener() {},
          removeEventListener() {},
        });
      },
    });
    cy.get('html').should('have.class', 'dark');

    cy.visit('/', {
      onBeforeLoad(win) {
        const err = new win.DOMException('Storage blocked', 'SecurityError');
        cy.stub(win.localStorage, 'getItem').throws(err);
        cy.stub(win.localStorage, 'setItem').throws(err);
      },
    });
    cy.get('#theme-toggle').click();
    cy.get('html').should('have.class', 'dark');

    cy.visit('/quality/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });
    cy.get('#theme-toggle').click();
    cy.get('html').should('have.class', 'dark');
    cy.reload();
    cy.get('html').should('have.class', 'dark');
  });

  it('degrades gracefully without throwing when localStorage and matchMedia are blocked', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.stub(win.localStorage, 'getItem').throws(new Error('SecurityError'));
        cy.stub(win.localStorage, 'setItem').throws(new Error('SecurityError'));
        cy.stub(win, 'matchMedia').throws(new Error('matchMedia blocked'));
      },
    });
    cy.get('html').should('have.class', 'js').and('have.class', 'light');
    cy.get('#theme-toggle').should('be.visible').click();
    cy.get('html').should('have.class', 'dark').and('not.have.class', 'light');
    cy.get('#theme-toggle').click();
    cy.get('html').should('have.class', 'light').and('not.have.class', 'dark');
  });
});

describe('Command Menu Interaction', () => {
  it('lazy-loads on trigger or Ctrl+J, ignores Ctrl+Shift+J and Alt+Ctrl+J, enforces Tab focus trap, and restores focus', () => {
    cy.viewport(1280, 800);
    cy.visit('/');

    cy.get('#command-dialog').should('not.be.visible');
    cy.get('body').type('{ctrl}{shift}j');
    cy.get('#command-dialog').should('not.be.visible');
    cy.get('body').type('{alt}{ctrl}j');
    cy.get('#command-dialog').should('not.be.visible');

    cy.get('#command-trigger')
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-trigger').should('have.attr', 'aria-expanded', 'true');
    cy.get('html').should('have.css', 'overflow', 'hidden');
    cy.get('body').should('have.css', 'overflow', 'hidden');
    cy.focused().should('have.id', 'command-input');

    cy.window().then((win) => {
      const urls = win.performance.getEntriesByType('resource').map((entry) => entry.name);
      expect(
        urls.some((url) => /\/assets\/js\/command-menu-panel\.[a-f0-9]+\.js$/.test(url)),
        'command-menu-panel lazy module should load after opening command dialog'
      ).to.eq(true);
    });

    cy.injectAxe();
    runAxeAndRecord(null, '#command-dialog');

    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Print / Save as PDF');

    // Shift+Tab from input wraps around to last visible .cmd-item (and focusin syncs selection); Tab wraps to input
    cy.focused().trigger('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    cy.focused().should('contain.text', 'llms.txt').and('have.attr', 'data-selected', 'true');
    cy.focused().trigger('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    cy.focused().should('have.id', 'command-input');

    // Down arrow wraps from last item back to Print / Save as PDF, then advances to Download Resume
    cy.get('#command-input').type('{downarrow}');
    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Print / Save as PDF');

    cy.get('#command-input').type('{downarrow}');
    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Download Resume (PDF)');

    cy.get('#command-input').type('{uparrow}{uparrow}');
    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'llms.txt');

    cy.get('#command-dialog .cmd-item').first().focus();
    cy.focused()
      .should('contain.text', 'Print / Save as PDF')
      .and('have.attr', 'data-selected', 'true');
    cy.focused().trigger('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    cy.focused()
      .should('contain.text', 'Download Resume (PDF)')
      .and('have.attr', 'data-selected', 'true');
    cy.focused().trigger('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    cy.focused()
      .should('contain.text', 'Print / Save as PDF')
      .and('have.attr', 'data-selected', 'true');

    if (resume.languages?.length) {
      cy.contains('#command-dialog .cmd-item', 'Languages').should('exist');
    }

    const emailSearchToken =
      resume.basics.email.split('@')[1]?.split('.')[0] || resume.basics.email;
    [
      { query: 'Live', expected: 'Live Quality Report' },
      { query: 'Appearance', expected: 'Toggle Light / Dark Theme' },
      { query: 'A4', expected: 'Print / Save as PDF' },
      { query: emailSearchToken, expected: 'Email' },
    ].forEach(({ query, expected }) => {
      cy.get('#command-input').focus().clear().type(query);
      cy.contains('#command-dialog .cmd-item:not([hidden])', expected).should('be.visible');
      cy.get('#command-empty').should('not.be.visible');
    });

    // Zero-results state traps Tab strictly between input and close button
    cy.get('#command-input').clear().type('nonexistent-command-xyz');
    cy.get('#command-empty').should('be.visible').and('contain.text', 'No results found.');
    cy.focused().trigger('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    cy.focused().should('have.id', 'command-close');
    cy.focused().trigger('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    cy.focused().should('have.id', 'command-input');

    cy.get('#command-input').type('{esc}');
    cy.get('#command-dialog').should('not.be.visible');
    cy.get('#command-trigger').should('have.attr', 'aria-expanded', 'false').and('be.focused');
    cy.window().then((win) => {
      expect(win.document.documentElement.style.overflow).to.eq('');
      expect(win.document.body.style.overflow).to.eq('');
    });

    // Ctrl+J opens and toggles closed cleanly; backdrop click closes menu
    cy.get('body').type('{ctrl}j');
    cy.get('#command-dialog').should('be.visible');
    cy.get('body').type('{ctrl}j');
    cy.get('#command-dialog').should('not.be.visible');

    cy.get('body').type('{ctrl}j');
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-backdrop').click(10, 10, { force: true });
    cy.get('#command-dialog').should('not.be.visible');
  });

  it('executes Enter selection, :print, :toggle-theme, external links, vCard toast, clipboard fallback, and auto-dismiss', () => {
    cy.viewport(1280, 800);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });

    cy.window().then((win) => {
      if (win.navigator.clipboard?.writeText) {
        cy.stub(win.navigator.clipboard, 'writeText')
          .callsFake(() => win.Promise.resolve())
          .as('clipWrite');
      }
      cy.stub(win, 'print').as('printStub');
      cy.stub(win, 'open').as('openStub');
    });

    // Enter executes selected item directly from #command-input
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').type('Copy Email{enter}');
    cy.get('#command-dialog').should('not.be.visible');
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Email copied to clipboard');
    cy.get('@clipWrite').should('have.been.calledWith', resume.basics.email);

    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').type('Copy Profile URL');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Copy Profile URL').click();
    cy.get('#cmd-toast')
      .should('be.visible')
      .and('contain.text', 'Profile URL copied to clipboard');
    cy.get('@clipWrite').should('have.been.calledWith', SITE_URL);

    // :print action closes menu and invokes window.print()
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.contains('#command-dialog .cmd-item', 'Print / Save as PDF').click();
    cy.get('#command-dialog').should('not.be.visible');
    cy.get('@printStub').should('have.been.calledOnce');

    // :toggle-theme action toggles theme and announces state
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').type('Toggle Light');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Toggle Light / Dark Theme').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Switched to dark theme');

    // External link action invokes window.open with noopener,noreferrer
    if (GITHUB_PROFILE) {
      cy.get('#command-trigger').click();
      cy.get('#command-dialog').should('be.visible');
      cy.get('#command-input').type('GitHub');
      cy.contains('#command-dialog .cmd-item:not([hidden])', 'GitHub').click();
      cy.get('@openStub').should(
        'have.been.calledWith',
        GITHUB_PROFILE.url,
        '_blank',
        'noopener,noreferrer'
      );
    }

    // vCard item click triggers toast notification
    cy.intercept('GET', resume.meta.contactVcf, {
      statusCode: 200,
      headers: {
        'content-type': 'text/vcard; charset=utf-8',
        'content-disposition': 'attachment; filename="guilherme-vigneron.vcf"',
      },
      body: 'BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n',
    }).as('vcfDownload');
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').type('vCard');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Save Contact (vCard)')
      .should('have.attr', 'data-href', resume.meta.contactVcf)
      .and('have.attr', 'data-download', 'guilherme-vigneron.vcf')
      .click();
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Downloading contact vCard');

    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').clear().type('Markdown');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Copy Markdown Resume').click();
    cy.get('#cmd-toast')
      .should('be.visible')
      .and('contain.text', 'Markdown resume copied to clipboard');
    cy.get('@clipWrite').its('lastCall.args.0').should('include', `# ${resume.basics.name}`);

    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-input').type('Selected Projects');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Selected Projects').click();
    cy.get('#command-dialog').should('not.be.visible');
    cy.location('hash').should('eq', '#projects');
    cy.focused().should('have.id', 'projects');

    // Clipboard fallback + failed /llms.txt fetch + toast auto-dismiss timer
    cy.intercept('GET', '/llms.txt', { statusCode: 500, body: 'Server Error' }).as('llmsFail');
    cy.clock();
    cy.visit('/');
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').rejects(new Error('Permission denied'));
      cy.stub(win.document, 'execCommand').returns(true).as('execCopy');
    });

    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.contains('#command-dialog .cmd-item', 'Copy Email Address').click();
    cy.get('@execCopy').should('have.been.calledWith', 'copy');
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Email copied to clipboard');
    cy.tick(2500);
    cy.get('#cmd-toast').should('not.be.visible');

    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.contains('#command-dialog .cmd-item', 'Copy Markdown Resume').click();
    cy.wait('@llmsFail');
    cy.get('#cmd-toast')
      .should('be.visible')
      .and('contain.text', 'Unable to fetch Markdown resume');
  });

  it('adapts modifier key for Mac/iOS, works across subpages, and passes axe in dark & mobile modes', () => {
    cy.viewport(1280, 800);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'dark');
        Object.defineProperty(win.navigator, 'platform', {
          value: 'MacIntel',
          configurable: true,
        });
      },
    });
    cy.get('#command-modifier').should('have.text', '\u2318');
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.injectAxe();
    runAxeAndRecord(null, '#command-dialog');
    cy.get('#command-close').click();
    cy.get('#command-dialog').should('not.be.visible');

    cy.viewport(375, 667);
    cy.get('#command-trigger-mobile').click();
    cy.get('#command-dialog').should('be.visible');
    runAxeAndRecord(null, '#command-dialog');
    cy.get('#command-close').click();
    cy.get('#command-dialog').should('not.be.visible');

    ['/quality/', '/architecture/', '/404.html'].forEach((route) => {
      cy.viewport(1280, 800);
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('#command-trigger').click();
      cy.get('#command-dialog').should('be.visible');
      cy.contains('#command-dialog .cmd-item', 'Architecture Overview')
        .scrollIntoView()
        .should('be.visible');
      cy.get('#command-input').type('Portfolio Home');
      cy.contains('#command-dialog .cmd-item:not([hidden])', 'Portfolio Home').should('be.visible');
      cy.get('#command-close').click();
      cy.get('#command-dialog').should('not.be.visible');

      cy.viewport(375, 667);
      cy.get('#command-trigger-mobile').should('be.visible').click();
      cy.get('#command-dialog').should('be.visible');
      cy.get('#command-close').click();
      cy.get('#command-dialog').should('not.be.visible');
    });

    // Clicking Portfolio Home on /quality/ navigates back to /
    cy.viewport(1280, 800);
    cy.visit('/quality/');
    cy.get('#command-trigger').click();
    cy.get('#command-dialog').should('be.visible');
    cy.contains('#command-dialog .cmd-item', 'Portfolio Home').scrollIntoView().click();
    cy.location('pathname').should('eq', '/');
  });
});

describe('Mobile Device Compatibility & Touch UX', () => {
  [
    { width: 320, height: 568, label: 'mobile-320' },
    { width: 375, height: 667, label: 'mobile-375' },
    { width: 390, height: 844, label: 'mobile-390' },
    { width: 768, height: 1024, label: 'tablet-768' },
  ].forEach(({ width, height, label }) => {
    it(`renders without horizontal overflow across routes at ${width}x${height}`, () => {
      cy.viewport(width, height);
      ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
        cy.visit(route, { failOnStatusCode: route !== '/404.html' });
        cy.document().then((doc) => doc.fonts.ready);
        cy.window().then((win) => {
          const docEl = win.document.documentElement;
          expect(docEl.scrollWidth, `horizontal overflow on ${route} at ${width}px`).to.be.at.most(
            win.innerWidth
          );
        });
      });

      if (width === 320) {
        cy.visit('/');
        cy.document().then((doc) => doc.fonts.ready);
        cy.get('#command-trigger-mobile').click();
        cy.get('#command-dialog').should('be.visible');
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
        });
        cy.get('#command-dialog').then(($dlg) => {
          const rect = $dlg[0].getBoundingClientRect();
          expect(rect.left).to.be.at.least(0);
          expect(rect.right).to.be.at.most(320);
        });
      }

      cy.task('recordMobileAudit', { label: `overflow-${label}`, passed: true });
    });
  });

  it('enforces >=44x44px touch targets without overlapping header avatar on mobile (320px & 375px) across routes', () => {
    [320, 375].forEach((width) => {
      cy.viewport(width, 667);
      cy.visit('/');

      cy.get('img.avatar').then(($avatar) => {
        const avatarRect = $avatar[0].getBoundingClientRect();
        cy.get('.header-actions .icon-btn:visible')
          .should('have.length', 6)
          .each(($btn) => {
            const rect = $btn[0].getBoundingClientRect();
            expect(rect.width, `mobile ${width}px icon-btn width`).to.be.at.least(44);
            expect(rect.height, `mobile ${width}px icon-btn height`).to.be.at.least(44);
            const overlapsAvatar =
              rect.left < avatarRect.right &&
              rect.right > avatarRect.left &&
              rect.top < avatarRect.bottom &&
              rect.bottom > avatarRect.top;
            expect(overlapsAvatar, `icon-btn must not overlap avatar at ${width}px`).to.eq(false);
          });
      });
    });

    cy.viewport(375, 667);
    cy.visit('/');
    cy.get('.cv-footer-links a').each(($link) => {
      const rect = $link[0].getBoundingClientRect();
      expect(rect.height, 'mobile footer link tap height').to.be.at.least(44);
    });

    ['/quality/', '/architecture/'].forEach((subpage) => {
      cy.visit(subpage);
      cy.get('.subpage-nav-actions a:visible, .subpage-nav-actions button:visible').each(($el) => {
        const rect = $el[0].getBoundingClientRect();
        expect(rect.width, `${subpage} nav target width`).to.be.at.least(44);
        expect(rect.height, `${subpage} nav target height`).to.be.at.least(44);
      });
      cy.get('.cv-footer-links a').each(($link) => {
        const rect = $link[0].getBoundingClientRect();
        expect(rect.height, `${subpage} footer link tap height`).to.be.at.least(44);
      });
    });

    cy.visit('/404.html', { failOnStatusCode: false });
    cy.get('.error-actions a').each(($link) => {
      const rect = $link[0].getBoundingClientRect();
      expect(rect.height, 'mobile 404 action tap height').to.be.at.least(44);
    });

    cy.task('recordMobileAudit', { label: 'touch-targets-375', passed: true });
  });

  it('opens and operates mobile command menu without iOS auto-zoom (<16px input) or clipping', () => {
    cy.viewport(375, 667);
    cy.visit('/');

    cy.get('.command-bar').should('not.be.visible');
    cy.get('#command-trigger-mobile')
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .click();

    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-trigger-mobile').should('have.attr', 'aria-expanded', 'true');

    cy.get('#command-input')
      .should('be.focused')
      .then(($input) => {
        const fontSize = parseFloat(getComputedStyle($input[0]).fontSize);
        expect(fontSize, 'mobile command input font-size prevents iOS zoom').to.be.at.least(16);
      });

    cy.get('#command-dialog').then(($dlg) => {
      const rect = $dlg[0].getBoundingClientRect();
      expect(rect.left).to.be.at.least(0);
      expect(rect.right).to.be.at.most(375);
      expect(rect.top).to.be.at.least(0);
      expect(rect.bottom).to.be.at.most(667);
    });

    cy.get('#command-dialog .cmd-item:visible').each(($item) => {
      const rect = $item[0].getBoundingClientRect();
      expect(rect.height, 'mobile cmd-item tap height').to.be.at.least(44);
      expect(rect.right).to.be.at.most(375);
    });

    cy.get('#command-input').type('Resume');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Download Resume (PDF)').should(
      'be.visible'
    );

    cy.get('#command-close').then(($close) => {
      const rect = $close[0].getBoundingClientRect();
      expect(rect.width, 'mobile close button width').to.be.at.least(44);
      expect(rect.height, 'mobile close button height').to.be.at.least(44);
    });

    cy.get('#command-close').click();
    cy.get('#command-dialog').should('not.be.visible');
    cy.get('#command-trigger-mobile')
      .should('have.attr', 'aria-expanded', 'false')
      .and('be.focused');

    cy.task('recordMobileAudit', { label: 'mobile-command-menu-375', passed: true });
  });
});

describe('Automated Resume PDF Pipeline', () => {
  it('links to self-hosted /resume.pdf and serves a valid single-page PDF payload', () => {
    cy.visit('/');
    cy.contains('a', 'Download My Resume')
      .should('be.visible')
      .and('have.attr', 'href', resume.meta.resumePdf);

    cy.request({ url: resume.meta.resumePdf, encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('application/pdf');
      expect(res.body.length).to.be.greaterThan(5000);
      expect(res.body.slice(0, 5)).to.eq('%PDF-');
      expect(res.body, '/resume.pdf tagged structure tree').to.include('/StructTreeRoot');
      expect(res.body, '/resume.pdf no Type 3 fonts').to.not.match(/\/Subtype\s*\/Type3\b/);
      expect(res.body, '/resume.pdf no embedded images').to.not.match(/\/Subtype\s*\/Image\b/);
      const pagesMatch = res.body.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d+)/);
      expect(pagesMatch, '/resume.pdf page count header').to.not.be.null;
      const pageCount = Number(pagesMatch[1]);
      expect(pageCount, '/resume.pdf page count').to.be.at.least(1).and.at.most(MAX_PDF_PAGES);
    });
  });
});

describe('Machine-Readable Endpoints, Security Policy & 404 Page', () => {
  it('keeps /resume.json, index.html JSON-LD, /llms.txt, and /contact.vcf in sync', () => {
    cy.request('/resume.json').then((resumeRes) => {
      expect(resumeRes.status).to.eq(200);
      const liveResume =
        typeof resumeRes.body === 'string' ? JSON.parse(resumeRes.body) : resumeRes.body;

      expect(liveResume.basics.name).to.eq(resume.basics.name);
      expect(liveResume.work).to.have.length.at.least(1);
      expect(liveResume.projects).to.have.length.at.least(1);
      expect(liveResume.skills).to.have.length.at.least(1);
      expect(liveResume.meta.resumePdf).to.eq(resume.meta.resumePdf);
      expect(liveResume.meta.contactVcf).to.eq(resume.meta.contactVcf);
      expect(liveResume.meta.maxPdfPages).to.eq(MAX_PDF_PAGES);

      cy.visit('/');
      cy.get('.cv-shell').within(() => {
        cy.get(`a[href="mailto:${liveResume.basics.email}"]`).should('exist');
        liveResume.basics.profiles.forEach((profile) => {
          cy.get(`a[href="${profile.url}"]`).should('exist');
        });
        liveResume.work.forEach((job) => {
          cy.contains(job.position).should('be.visible');
          cy.contains(job.displayDate).should('be.visible');
          cy.contains(job.location).should('be.visible');
        });
        liveResume.skills.forEach((skill) => {
          cy.get('#skills').should('contain.text', skill.name);
        });
      });

      cy.get('script[type="application/ld+json"]')
        .should('exist')
        .then(($script) => {
          const jsonLd = JSON.parse($script.text());
          expect(jsonLd['@graph']).to.be.an('array');
          const person = jsonLd['@graph'].find((n) => n['@type'] === 'Person');
          expect(person).to.be.an('object');
          expect(person.name).to.eq(liveResume.basics.name);
          expect(person.jobTitle).to.eq(liveResume.meta.jobTitle);
          expect(person.email).to.eq(liveResume.basics.email);
          if (ACTIVE_JOB) {
            expect(person.worksFor.name).to.eq(ACTIVE_JOB.name);
          } else {
            expect(person.worksFor).to.eq(undefined);
          }
          expect(person.knowsAbout).to.include.members(liveResume.skills.map((s) => s.name));
        });

      cy.request('/llms.txt').then((llmsRes) => {
        expect(llmsRes.status).to.eq(200);
        const llms = llmsRes.body;
        expect(llms).to.include(liveResume.basics.name);
        expect(llms).to.include(liveResume.meta.resumePdfUrl);
        expect(llms).to.include(liveResume.meta.resumeJsonUrl);
        expect(llms).to.include(liveResume.meta.contactVcfUrl);
        expect(llms).to.include(liveResume.meta.qualityReportJsonUrl);
        expect(llms).to.not.include('drive.google.com');
        liveResume.work.forEach((job) => {
          expect(llms).to.include(job.position);
        });
        liveResume.projects.forEach((proj) => {
          expect(llms).to.include(proj.name);
        });
        liveResume.skills.forEach((skill) => {
          expect(llms).to.include(skill.name);
        });
        liveResume.publications.forEach((pub) => {
          expect(llms).to.include(pub.url);
        });
      });

      cy.request('/contact.vcf').then((vcfRes) => {
        expect(vcfRes.status).to.eq(200);
        expect(vcfRes.headers['content-type']).to.include('text/vcard');
        expect(vcfRes.body).to.include('BEGIN:VCARD');
        expect(vcfRes.body).to.include(`FN:${liveResume.basics.name}`);
        expect(vcfRes.body).to.include(`EMAIL;TYPE=INTERNET:${liveResume.basics.email}`);
        expect(vcfRes.body).to.match(/^ADR;TYPE=HOME:;;;[^;\r\n]*;[^;\r\n]*;;[^;\r\n]*\r?$/m);
        expect(vcfRes.body).to.include('END:VCARD');
      });
    });
  });

  it('serves a compliant RFC 9116 /.well-known/security.txt expiring >= 30 days in the future', () => {
    cy.request('/.well-known/security.txt').then((res) => {
      expect(res.status).to.eq(200);
      const body = res.body;

      expect(body).to.include(`Contact: mailto:${resume.basics.email}`);
      expect(body).to.include(`Canonical: ${SITE_URL}/.well-known/security.txt`);
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

  it('serves branded 404 page across nested unknown routes, redirects (301), and handles malformed URLs cleanly', () => {
    cy.request({ url: '/nonexistent-route-check', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(404);
      expect(res.body).to.include('Page Not Found');
    });

    cy.request({ url: '/quality', followRedirect: false }).then((res) => {
      expect(res.status).to.eq(301);
      expect(res.headers.location).to.eq('/quality/');
    });

    cy.request({ url: '/quality?v=1', followRedirect: false }).then((res) => {
      expect(res.status).to.eq(301);
      expect(res.headers.location).to.eq('/quality/?v=1');
    });

    cy.request({ url: '/%E0%A4%A', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(400);
    });

    cy.visit('/nonexistent/deep/route', {
      failOnStatusCode: false,
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });
    cy.contains('h1', 'Page Not Found').should('be.visible');
    cy.contains('a', 'Back to Portfolio').should('have.attr', 'href', '/');
    cy.get('#theme-toggle').should('be.visible').click();
    cy.get('html').should('have.class', 'dark');

    cy.visit('/404.html', { failOnStatusCode: false });
    cy.contains('h1', 'Page Not Found').should('be.visible');
    cy.contains('a', 'Back to Portfolio').should('have.attr', 'href', '/');
  });

  it('serves /quality/ verification report, /architecture/ page, /quality/report.json, /robots.txt, and /sitemap.xml', () => {
    cy.visit('/architecture/');
    cy.contains('h1', 'Architecture Overview').should('be.visible');
    cy.contains('1. Edit Once, Sync Everywhere').should('be.visible');
    cy.contains('2. Zero Third-Party Dependencies').should('be.visible');
    cy.contains('3. Automated PDF & Social Previews').should('be.visible');
    cy.contains('4. Built-In Quality Gates').should('be.visible');
    cy.get('header a[href="/quality/"]').should('be.visible');
    cy.get('a[href="/quality/"]').should('exist');
    cy.get(`a[href="${resume.meta.resumePdf}"]`).should('exist');
    cy.get('a[href="/resume.json"]').should('exist');

    cy.visit('/quality/');
    cy.contains('h1', 'Quality & Verification Report').should('be.visible');
    [
      'Zero Third-Party Network Requests',
      'Web Vitals & Asset Payload Budgets',
      'Mobile Compatibility & Touch Ergonomics',
      'HTML5 Standards Validation',
      'WCAG 2.1 AA Accessibility (cypress-axe)',
      'E2E Verification Suite (Cypress)',
      'Static Lint, Unit Tests & Dependency Audit',
      'Print PDF & Social Card Pipeline',
      'Link Integrity (Lychee)',
      'Single Source of Truth & Security Policy',
    ].forEach((title) => {
      cy.contains(title).should('be.visible');
    });
    cy.get('header a[href="/architecture/"]').should('be.visible');
    cy.get('a[href="/quality/report.json"]').should('be.visible');

    cy.request('/quality/report.json').then((res) => {
      expect(res.status).to.eq(200);
      const report = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      expect(report.schemaVersion).to.eq(1);
      expect(report.gates).to.have.length(10);
      expect(report.artifacts.resumePdfPages).to.eq(MAX_PDF_PAGES);
      expect(report.artifacts.ogCardBytes).to.be.greaterThan(5000);
      expect(report.artifacts.contactVcfBytes).to.be.greaterThan(100);
      expect(report.endpoints).to.include('/architecture/');
      expect(report.endpoints).to.include('/robots.txt');
      const failing = report.gates.filter((g) => g.status === 'fail');
      expect(failing).to.deep.equal([]);
    });

    cy.request('/robots.txt').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.include(`Sitemap: ${SITE_URL}/sitemap.xml`);
    });

    cy.request('/sitemap.xml').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.include(`${SITE_URL}/`);
      expect(res.body).to.include(`${SITE_URL}${resume.meta.resumePdf}`);
      expect(res.body).to.include(`${SITE_URL}/architecture/`);
      expect(res.body).to.include(`${SITE_URL}/quality/`);
      expect(res.body).to.not.include(`${SITE_URL}${resume.meta.contactVcf}`);
      expect(res.body).to.not.include(`${SITE_URL}/quality/report.json`);
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
    { route: '/404.html', viewport: [375, 667], theme: 'light', label: '404-mobile-light' },
    { route: '/404.html', viewport: [375, 667], theme: 'dark', label: '404-mobile-dark' },
    { route: '/quality/', viewport: [1280, 800], theme: 'light', label: 'quality-desktop-light' },
    { route: '/quality/', viewport: [1280, 800], theme: 'dark', label: 'quality-desktop-dark' },
    { route: '/quality/', viewport: [375, 667], theme: 'light', label: 'quality-mobile-light' },
    { route: '/quality/', viewport: [375, 667], theme: 'dark', label: 'quality-mobile-dark' },
    {
      route: '/architecture/',
      viewport: [1280, 800],
      theme: 'light',
      label: 'architecture-desktop-light',
    },
    {
      route: '/architecture/',
      viewport: [1280, 800],
      theme: 'dark',
      label: 'architecture-desktop-dark',
    },
    {
      route: '/architecture/',
      viewport: [375, 667],
      theme: 'light',
      label: 'architecture-mobile-light',
    },
    {
      route: '/architecture/',
      viewport: [375, 667],
      theme: 'dark',
      label: 'architecture-mobile-dark',
    },
  ];

  matrix.forEach(({ route, viewport, theme, label }) => {
    it(`passes cy.checkA11y() for ${label}`, () => {
      cy.viewport(viewport[0], viewport[1]);
      cy.visit(route, {
        failOnStatusCode: route !== '/404.html',
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', theme);
        },
      });
      cy.get('html').should(theme === 'dark' ? 'have.class' : 'not.have.class', 'dark');
      cy.injectAxe();
      runAxeAndRecord(label);
    });
  });
});
