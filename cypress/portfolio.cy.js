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
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    const baseOrigin = new URL(Cypress.config('baseUrl') || 'http://127.0.0.1:4000').origin;
    return (
      parsed.origin === baseOrigin ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost'
    );
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

function logAxeViolations(violations) {
  violations.forEach((v) => {
    const targets = v.nodes.map((n) => n.target.join(' ')).join('; ');
    cy.log(`AXE [${v.impact}] ${v.id}: ${v.help} (${targets})`);
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

  it('serves self-hosted Geist fonts, responsive avatar images, favicons, and split CSS with zero CDN references', () => {
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

    cy.request({ url: '/assets/avatar-224.avif', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/avif');
    });

    cy.request({ url: '/assets/avatar-224.webp', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/webp');
    });

    cy.request({ url: '/assets/og-card.png', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('image/png');
      expect(res.body.length).to.be.greaterThan(5000);
      expect(res.body.slice(1, 4)).to.eq('PNG');
    });

    cy.request('/assets/favicon.svg').its('status').should('eq', 200);
    cy.request({ url: '/favicon.ico', encoding: 'binary' }).its('status').should('eq', 200);
    cy.request('/site.webmanifest').then((res) => {
      expect(res.status).to.eq(200);
      const manifest = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      expect(manifest.short_name).to.eq('G. Vigneron');
      expect(manifest.description).to.include('Principal Technologist');
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

    cy.document().then(async (doc) => {
      await doc.fonts.ready;
      expect(doc.fonts.check('400 16px "Geist Mono"')).to.eq(true);
      expect(doc.fonts.check('500 24px "Geist Pixel Square"')).to.eq(true);
    });

    cy.get('picture.avatar-picture source[type="image/avif"]').should('exist');
    cy.get('picture.avatar-picture source[type="image/webp"]').should('exist');
    cy.get('img.avatar')
      .should('be.visible')
      .and('have.attr', 'src')
      .and('match', /^\/assets\/avatar\.[a-f0-9]+\.jpg$/);
    cy.get('img.avatar').should(($img) => {
      expect($img[0].naturalWidth).to.be.greaterThan(0);
    });

    cy.document().its('documentElement.outerHTML').then((html) => {
      THIRD_PARTY_DOMAINS.forEach((domain) => {
        expect(html).to.not.include(domain);
      });
    });

    cy.get('i[class*="fa"]').should('have.length', 0);
  });

  it('enforces a strict Content-Security-Policy and referrer policy with zero violations', () => {
    ['/', '/404.html', '/quality/'].forEach((route) => {
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
          expect(
            script.getAttribute('src'),
            `${route} executable script must use src`
          ).to.be.a('string').and.not.be.empty;
        });
      });

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

  it('renders title, header, subtitle, six sections including Selected Projects, and footer', () => {
    cy.title().should('eq', 'Guilherme Vigneron de Oliveira - Principal Technologist');
    cy.contains('h1', 'Guilherme Vigneron de Oliveira').should('be.visible');
    cy.contains('Principal Technologist | Quality, DevOps & Developer Experience').should('be.visible');

    cy.contains('h2', 'Summary').should('be.visible');
    cy.contains('h2', 'Professional Experience').should('be.visible');
    cy.contains('h2', 'Selected Projects').should('be.visible');
    cy.contains('h2', 'Skills').should('be.visible');
    cy.contains('h2', 'Publications & Awards').should('be.visible');
    cy.contains('h2', 'Education').should('be.visible');

    cy.get('#projects').should('have.class', 'no-print').within(() => {
      cy.contains('a', 'guilhermevigneron.dev')
        .should('be.visible')
        .and('have.attr', 'href', 'https://github.com/guilhermevigneron/guilhermevigneron.github.io');
      cy.contains('a', 'Live Quality Report').should('have.attr', 'href', '/quality/');
    });

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
    ['/', '/404.html', '/quality/', '/architecture/'].forEach((route) => {
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('link[rel="stylesheet"][href*="/assets/css/styles."]')
        .should('have.attr', 'href')
        .and('match', /^\/assets\/css\/styles\.[a-f0-9]+\.css$/);

      if (route !== '/') {
        cy.get('link[rel="stylesheet"][href*="/assets/css/subpage."]')
          .should('have.attr', 'href')
          .and('match', /^\/assets\/css\/subpage\.[a-f0-9]+\.css$/);
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

  it('includes complete SEO metadata, OG image card, and Schema.org JSON-LD', () => {
    cy.get('meta[name="description"]').should('have.attr', 'content').and('not.be.empty');
    cy.get('meta[property="og:type"]').should('have.attr', 'content', 'profile');
    cy.get('meta[property="og:url"]').should('have.attr', 'content', 'https://guilhermevigneron.dev');
    cy.get('meta[property="og:image"]').should(
      'have.attr',
      'content',
      'https://guilhermevigneron.dev/assets/og-card.png'
    );
    cy.get('meta[name="twitter:image"]').should(
      'have.attr',
      'content',
      'https://guilhermevigneron.dev/assets/og-card.png'
    );
    cy.get('link[rel="canonical"]').should('have.attr', 'href', 'https://guilhermevigneron.dev');
    cy.get('a[href="#about"]').should('exist');
  });
});

describe('Theme Toggle & Persistence', () => {
  it('toggles dark/light mode, syncs theme-color meta, and persists choice across reload', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('theme');
      },
    });

    cy.get('html').invoke('removeClass', 'dark');
    cy.get('#theme-toggle').should('be.visible').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('meta[name="theme-color"]').first().should('have.attr', 'content', '#0d0c0a');
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'dark');

    cy.reload();
    cy.get('html').should('have.class', 'dark');
    cy.get('meta[name="theme-color"]').first().should('have.attr', 'content', '#0d0c0a');

    cy.get('#theme-toggle').click();
    cy.get('html').should('not.have.class', 'dark');
    cy.get('meta[name="theme-color"]').first().should('have.attr', 'content', '#fafaf8');
    cy.window().its('localStorage').invoke('getItem', 'theme').should('eq', 'light');
  });

  it('ignores non-theme localStorage values when resolving initial prefers-color-scheme', () => {
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
  });
});

describe('Command Menu Interaction', () => {
  it('opens via trigger or Ctrl+J, ignores Ctrl+Shift+J, filters hints, syncs focus, and closes cleanly', () => {
    cy.viewport(1280, 800);
    cy.visit('/');

    cy.get('#command-dialog').should('not.be.visible');
    cy.get('body').type('{ctrl}{shift}j');
    cy.get('#command-dialog').should('not.be.visible');

    cy.get('#command-trigger').should('be.visible').click();
    cy.get('#command-dialog').should('be.visible');
    cy.focused().should('have.id', 'command-input');

    cy.injectAxe();
    cy.checkA11y('#command-dialog');

    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Print / Save as PDF');

    cy.get('#command-input').type('{downarrow}');
    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Download Resume (PDF)');

    cy.get('#command-dialog .cmd-item').first().focus();
    cy.focused().should('contain.text', 'Print / Save as PDF');
    cy.get('#command-dialog .cmd-item[data-selected="true"]')
      .should('have.length', 1)
      .and('contain.text', 'Print / Save as PDF');
    cy.document().trigger('keydown', { key: 'ArrowDown' });
    cy.focused()
      .should('contain.text', 'Download Resume (PDF)')
      .and('have.attr', 'data-selected', 'true');

    [
      { query: 'Live', expected: 'Live Quality Report' },
      { query: 'Appearance', expected: 'Toggle Light / Dark Theme' },
      { query: 'A4', expected: 'Print / Save as PDF' },
      { query: 'simplelogin', expected: 'Email' },
    ].forEach(({ query, expected }) => {
      cy.get('#command-input').focus().clear().type(query);
      cy.contains('#command-dialog .cmd-item:not([hidden])', expected).should('be.visible');
      cy.get('#command-empty').should('not.be.visible');
    });

    cy.get('#command-input').clear().type('nonexistent-command-xyz');
    cy.get('#command-empty').should('be.visible').and('contain.text', 'No results found.');

    cy.get('#command-input').type('{esc}');
    cy.get('#command-dialog').should('not.be.visible');

    cy.get('body').type('{ctrl}j');
    cy.get('#command-dialog').should('be.visible');
    cy.get('#command-close').click();
    cy.get('#command-dialog').should('not.be.visible');
  });

  it('copies email, profile URL, and Markdown resume with accessible toast, offers vCard, and jumps to sections', () => {
    cy.viewport(1280, 800);
    cy.visit('/');

    cy.window().then((win) => {
      if (win.navigator.clipboard?.writeText) {
        cy.stub(win.navigator.clipboard, 'writeText')
          .callsFake(() => win.Promise.resolve())
          .as('clipWrite');
      }
    });

    cy.get('#command-trigger').click();
    cy.get('#command-input').type('Copy Email');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Copy Email Address').click();
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Email copied to clipboard');
    cy.get('@clipWrite').should('have.been.calledWith', 'email@gvo.simplelogin.com');

    cy.get('#command-trigger').click();
    cy.get('#command-input').type('Copy Profile URL');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Copy Profile URL').click();
    cy.get('#cmd-toast').should('be.visible').and('contain.text', 'Profile URL copied to clipboard');
    cy.get('@clipWrite').should('have.been.calledWith', 'https://guilhermevigneron.dev');

    cy.get('#command-trigger').click();
    cy.get('#command-input').type('vCard');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Save Contact (vCard)')
      .should('have.attr', 'data-href', '/contact.vcf')
      .and('have.attr', 'data-download', 'guilherme-vigneron.vcf');

    cy.get('#command-input').clear().type('Markdown');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Copy Markdown Resume').click();
    cy.get('#cmd-toast')
      .should('be.visible')
      .and('contain.text', 'Markdown resume copied to clipboard');
    cy.get('@clipWrite').its('lastCall.args.0').should('include', '# Guilherme Vigneron de Oliveira');

    cy.get('#command-trigger').click();
    cy.get('#command-input').type('Selected Projects');
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Selected Projects').click();
    cy.get('#command-dialog').should('not.be.visible');
    cy.location('hash').should('eq', '#projects');
  });

  it('works across /quality/ and /404.html via Ctrl+J and mobile search trigger', () => {
    ['/quality/', '/404.html'].forEach((route) => {
      cy.viewport(1280, 800);
      cy.visit(route, { failOnStatusCode: route !== '/404.html' });
      cy.get('#command-trigger').click();
      cy.get('#command-dialog').should('be.visible');
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
      ['/', '/404.html', '/quality/'].forEach((route) => {
        cy.visit(route, { failOnStatusCode: route !== '/404.html' });
        cy.window().then((win) => {
          const docEl = win.document.documentElement;
          expect(
            docEl.scrollWidth,
            `horizontal overflow on ${route} at ${width}px`
          ).to.be.at.most(win.innerWidth);
        });
      });
      cy.task('recordMobileAudit', { label: `overflow-${label}`, passed: true });
    });
  });

  it('enforces >=44x44px touch targets without overlapping header avatar on mobile (375x667)', () => {
    cy.viewport(375, 667);
    cy.visit('/');

    cy.get('img.avatar').then(($avatar) => {
      const avatarRect = $avatar[0].getBoundingClientRect();
      cy.get('.header-actions .icon-btn:visible')
        .should('have.length', 6)
        .each(($btn) => {
          const rect = $btn[0].getBoundingClientRect();
          expect(rect.width, 'mobile icon-btn width').to.be.at.least(44);
          expect(rect.height, 'mobile icon-btn height').to.be.at.least(44);
          const overlapsAvatar =
            rect.left < avatarRect.right &&
            rect.right > avatarRect.left &&
            rect.top < avatarRect.bottom &&
            rect.bottom > avatarRect.top;
          expect(overlapsAvatar, 'icon-btn must not overlap avatar').to.eq(false);
        });
    });

    cy.get('.cv-footer-links a').each(($link) => {
      const rect = $link[0].getBoundingClientRect();
      expect(rect.height, 'mobile footer link tap height').to.be.at.least(44);
    });

    cy.visit('/404.html');
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

    cy.get('#command-trigger-mobile').should('have.attr', 'aria-expanded', 'true');
    cy.get('#command-dialog').should('be.visible');

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
    cy.contains('#command-dialog .cmd-item:not([hidden])', 'Download Resume (PDF)').should('be.visible');

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
      .and('have.attr', 'href', '/resume.pdf');

    cy.request({ url: '/resume.pdf', encoding: 'binary' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.headers['content-type']).to.include('application/pdf');
      expect(res.body.length).to.be.greaterThan(5000);
      expect(res.body.slice(0, 5)).to.eq('%PDF-');
      expect(res.body, '/resume.pdf tagged structure tree').to.include('/StructTreeRoot');
      expect(res.body, '/resume.pdf no Type 3 fonts').to.not.match(/\/Subtype\s*\/Type3\b/);
      expect(res.body, '/resume.pdf no embedded images').to.not.match(/\/Subtype\s*\/Image\b/);
      const pagesMatch = res.body.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d+)/);
      expect(pagesMatch, '/resume.pdf page count header').to.not.be.null;
      expect(Number(pagesMatch[1]), '/resume.pdf page count').to.eq(1);
    });
  });
});

describe('Machine-Readable Endpoints, Security Policy & 404 Page', () => {
  it('keeps /resume.json, index.html JSON-LD, /llms.txt, and /contact.vcf in sync', () => {
    cy.request('/resume.json').then((resumeRes) => {
      expect(resumeRes.status).to.eq(200);
      const resume =
        typeof resumeRes.body === 'string' ? JSON.parse(resumeRes.body) : resumeRes.body;

      expect(resume.basics.name).to.eq('Guilherme Vigneron de Oliveira');
      expect(resume.work).to.have.length(3);
      expect(resume.projects).to.have.length.at.least(1);
      expect(resume.skills).to.have.length(14);
      expect(resume.meta.resumePdf).to.eq('/resume.pdf');
      expect(resume.meta.contactVcf).to.eq('/contact.vcf');
      expect(resume.meta.maxPdfPages).to.eq(1);

      cy.visit('/');
      cy.get('main').within(() => {
        cy.get(`a[href="mailto:${resume.basics.email}"]`).should('exist');
        resume.basics.profiles.forEach((profile) => {
          cy.get(`a[href="${profile.url}"]`).should('exist');
        });
        resume.work.forEach((job) => {
          cy.contains(job.position).should('be.visible');
          cy.contains(job.displayDate).should('be.visible');
          cy.contains(job.location).should('be.visible');
        });
        resume.skills.forEach((skill) => {
          cy.get('#skills').should('contain.text', skill.name);
        });
      });

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
        expect(llms).to.include(resume.meta.contactVcfUrl);
        expect(llms).to.include(resume.meta.qualityReportJsonUrl);
        expect(llms).to.not.include('drive.google.com');
        resume.work.forEach((job) => expect(llms).to.include(job.position));
        resume.projects.forEach((proj) => expect(llms).to.include(proj.name));
        resume.skills.forEach((skill) => expect(llms).to.include(skill.name));
        resume.publications.forEach((pub) => expect(llms).to.include(pub.url));
      });

      cy.request('/contact.vcf').then((vcfRes) => {
        expect(vcfRes.status).to.eq(200);
        expect(vcfRes.headers['content-type']).to.include('text/vcard');
        expect(vcfRes.body).to.include('BEGIN:VCARD');
        expect(vcfRes.body).to.include(`FN:${resume.basics.name}`);
        expect(vcfRes.body).to.include(`EMAIL;TYPE=INTERNET:${resume.basics.email}`);
        expect(vcfRes.body).to.include('END:VCARD');
      });
    });
  });

  it('serves a compliant RFC 9116 /.well-known/security.txt expiring >= 30 days in the future', () => {
    cy.request('/.well-known/security.txt').then((res) => {
      expect(res.status).to.eq(200);
      const body = res.body;

      expect(body).to.match(/^Contact:\s*mailto:email@gvo\.simplelogin\.com$/m);
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

  it('serves /quality/ verification report, /quality/report.json, and /sitemap.xml', () => {
    cy.visit('/quality/');
    cy.contains('h1', 'Quality & Verification Report').should('be.visible');
    cy.contains('Zero Third-Party Network Requests').should('be.visible');
    cy.contains('Web Vitals & Asset Payload Budgets').should('be.visible');
    cy.contains('Mobile Compatibility & Touch Ergonomics').should('be.visible');
    cy.contains('WCAG 2.1 AA Accessibility').should('be.visible');
    cy.contains('Print PDF & Social Card Pipeline').should('be.visible');
    cy.get('a[href="/quality/report.json"]').should('be.visible');

    cy.request('/quality/report.json').then((res) => {
      expect(res.status).to.eq(200);
      const report = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      expect(report.schemaVersion).to.eq(1);
      expect(report.artifacts.resumePdfPages).to.eq(1);
      expect(report.artifacts.ogCardBytes).to.be.greaterThan(5000);
      expect(report.artifacts.contactVcfBytes).to.be.greaterThan(100);
      const failing = report.gates.filter((g) => g.status === 'fail');
      expect(failing).to.deep.equal([]);
    });

    cy.request('/sitemap.xml').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.include('https://guilhermevigneron.dev/');
      expect(res.body).to.include('https://guilhermevigneron.dev/resume.pdf');
      expect(res.body).to.include('https://guilhermevigneron.dev/contact.vcf');
      expect(res.body).to.include('https://guilhermevigneron.dev/quality/report.json');
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
    { route: '/architecture/', viewport: [1280, 800], theme: 'light', label: 'architecture-desktop-light' },
    { route: '/architecture/', viewport: [1280, 800], theme: 'dark', label: 'architecture-desktop-dark' },
    { route: '/architecture/', viewport: [375, 667], theme: 'light', label: 'architecture-mobile-light' },
    { route: '/architecture/', viewport: [375, 667], theme: 'dark', label: 'architecture-mobile-dark' },
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
