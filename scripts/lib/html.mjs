import { CSP_POLICY, THEME_COLORS } from './site-config.mjs';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHref(url, { allowRelative = true, allowMailto = false } = {}) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (allowRelative && (raw.startsWith('/') || raw.startsWith('#'))) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return raw;
    }
    if (allowMailto && parsed.protocol === 'mailto:') {
      return raw;
    }
  } catch {
    return '';
  }
  return '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rewriteAssetRefs(content, replacements) {
  let out = content;
  const sortedEntries = Object.entries(replacements).sort((a, b) => b[0].length - a[0].length);
  for (const [fromUrl, toUrl] of sortedEntries) {
    const pattern = new RegExp(`(^|["'(\\s,])${escapeRegExp(fromUrl)}(?=["')\\s,]|$)`, 'g');
    out = out.replace(pattern, `$1${toUrl}`);
  }
  return out;
}

export const ICONS = {
  pin: '<svg class="icon-pin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg>',
  email:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>',
  github:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path></svg>',
  linkedin:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path></svg>',
  globe:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
  download:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M12 18v-6"></path><path d="m9 15 3 3 3-3"></path></svg>',
  sun: '<svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>',
  moon: '<svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
  search:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  arrowRight:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>',
};

export const UNHASHED_ASSET_URLS = {
  cssUrl: '/assets/css/styles.css',
  subpageCssUrl: '/assets/css/subpage.css',
  printCssUrl: '/assets/css/print.css',
  monoFontUrl: '/assets/fonts/GeistMono-Variable.woff2',
  pixelFontUrl: '/assets/fonts/GeistPixel-Square.woff2',
  themeInitJsUrl: '/assets/js/theme-init.js',
  themeJsUrl: '/assets/js/theme.js',
  commandMenuJsUrl: '/assets/js/command-menu.js',
  commandMenuPanelJsUrl: '/assets/js/command-menu-panel.js',
  faviconSvgUrl: '/assets/favicon.svg',
  appleTouchIconUrl: '/assets/apple-touch-icon.png',
};

export function resolveAssetUrls(assetManifest) {
  return {
    cssUrl: assetManifest?.cssUrl || UNHASHED_ASSET_URLS.cssUrl,
    subpageCssUrl: assetManifest?.subpageCssUrl || UNHASHED_ASSET_URLS.subpageCssUrl,
    printCssUrl: assetManifest?.printCssUrl || UNHASHED_ASSET_URLS.printCssUrl,
    monoFontUrl: assetManifest?.monoFontUrl || UNHASHED_ASSET_URLS.monoFontUrl,
    pixelFontUrl: assetManifest?.pixelFontUrl || UNHASHED_ASSET_URLS.pixelFontUrl,
    themeInitJsUrl: assetManifest?.themeInitJsUrl || UNHASHED_ASSET_URLS.themeInitJsUrl,
    themeJsUrl: assetManifest?.themeJsUrl || UNHASHED_ASSET_URLS.themeJsUrl,
    commandMenuJsUrl: assetManifest?.commandMenuJsUrl || UNHASHED_ASSET_URLS.commandMenuJsUrl,
    commandMenuPanelJsUrl:
      assetManifest?.commandMenuPanelJsUrl || UNHASHED_ASSET_URLS.commandMenuPanelJsUrl,
    faviconSvgUrl: assetManifest?.faviconSvgUrl || UNHASHED_ASSET_URLS.faviconSvgUrl,
    appleTouchIconUrl: assetManifest?.appleTouchIconUrl || UNHASHED_ASSET_URLS.appleTouchIconUrl,
    ogCardUrl: assetManifest?.ogCardUrl || '/assets/og-card.png',
  };
}

export function renderThemeColorMetas(indent = '    ') {
  return [
    `<meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)">`,
    `${indent}<meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)">`,
  ].join('\n');
}

export function renderCspMeta() {
  return `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
}

export function renderFooterLinks(links) {
  return links
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('\n                <span aria-hidden="true">&middot;</span>\n                ');
}

export function renderCommandBarHtml() {
  return `<div class="command-bar">
            <button type="button" id="command-trigger" class="command-trigger" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                <span>Press</span>
                <kbd class="kbd-chip"><span id="command-modifier">Ctrl</span>+J</kbd>
                <span>to open the command menu</span>
            </button>
        </div>`;
}

export function renderSubpageLayout({
  title,
  description,
  canonicalUrl = null,
  robots = null,
  extraHeadLinks = [],
  ownerName,
  subtitleHtml = '',
  navLinks = [],
  mainHtml,
  footerLinks = [],
  copyrightYear,
  assetManifest = null,
}) {
  const assets = resolveAssetUrls(assetManifest);
  const robotsMeta = robots ? `\n    <meta name="robots" content="${escapeHtml(robots)}">` : '';
  const canonicalLink = canonicalUrl
    ? `\n    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">`
    : '';
  let socialMetaHtml = '';
  if (canonicalUrl) {
    const origin = new URL(canonicalUrl).origin;
    const ogImageUrl = `${origin}${assets.ogCardUrl}`;
    const altText = `${ownerName} — ${description}`;
    socialMetaHtml = `
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapeHtml(altText)}">
    <meta property="og:locale" content="en_US">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
    <meta name="twitter:image:alt" content="${escapeHtml(altText)}">`;
  }
  const extraLinks = extraHeadLinks.length ? `\n    ${extraHeadLinks.join('\n    ')}` : '';
  const navLinksHtml = navLinks
    .map(
      (link) =>
        `<a href="${escapeHtml(link.href)}" class="ghost-link">${escapeHtml(link.label)}</a>\n                    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">${robotsMeta}
    ${renderThemeColorMetas()}
    ${renderCspMeta()}
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(assets.faviconSvgUrl)}">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="${escapeHtml(assets.appleTouchIconUrl)}">
    <link rel="manifest" href="/site.webmanifest">${canonicalLink}${socialMetaHtml}${extraLinks}
    <script src="${escapeHtml(assets.themeInitJsUrl)}"></script>
    <link rel="stylesheet" href="${escapeHtml(assets.cssUrl)}">
    <link rel="stylesheet" href="${escapeHtml(assets.subpageCssUrl)}">
    <link rel="stylesheet" href="${escapeHtml(assets.printCssUrl)}" media="print">
    <link rel="preload" href="${escapeHtml(assets.monoFontUrl)}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="${escapeHtml(assets.pixelFontUrl)}" as="font" type="font/woff2" crossorigin>
    <script src="${escapeHtml(assets.themeJsUrl)}" defer></script>
    <script src="${escapeHtml(assets.commandMenuJsUrl)}" defer></script>
</head>
<body class="subpage-body" data-page="subpage">
    <a href="#main-content" class="sr-only skip-link">Skip to main content</a>

    <main id="main-content" class="subpage-main" tabindex="-1">
        <div class="cv-shell">
            <header class="subpage-nav">
                <div>
                    <a href="/" class="subpage-brand">${escapeHtml(ownerName)}</a>${subtitleHtml ? `\n                    ${subtitleHtml}` : ''}
                </div>
                <div class="subpage-nav-actions">
                    ${navLinksHtml}<button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false">
                        ${ICONS.sun}
                        ${ICONS.moon}
                    </button>
                    <button id="command-trigger-mobile" type="button" class="icon-btn mobile-only-btn" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                        ${ICONS.search}
                    </button>
                </div>
            </header>

${mainHtml}
        </div>
    </main>

    <footer class="cv-footer-wrap">
        <div class="cv-footer-inner">
            <span>&copy; ${escapeHtml(String(copyrightYear))} ${escapeHtml(ownerName)}</span>
            <div class="cv-footer-links">
                ${renderFooterLinks(footerLinks)}
            </div>
        </div>
        ${renderCommandBarHtml()}
    </footer>
</body>
</html>
`;
}
