import fs from 'node:fs';
import path from 'node:path';

export const STRICT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rewriteAssetRefs(content, replacements) {
  let out = content;
  for (const [fromUrl, toUrl] of Object.entries(replacements)) {
    const pattern = new RegExp(`(["'(\\s,])${escapeRegExp(fromUrl)}(?=["')\\s,])`, 'g');
    out = out.replace(pattern, `$1${toUrl}`);
  }
  return out;
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function getAssetUrls(reportsDir, useManifest = true) {
  const assetManifest = useManifest
    ? readJsonIfExists(path.join(reportsDir, 'asset-manifest.json'))
    : null;
  return {
    cssUrl: assetManifest?.cssUrl || '/assets/css/styles.css',
    subpageCssUrl: assetManifest?.subpageCssUrl || '/assets/css/subpage.css',
    printCssUrl: assetManifest?.printCssUrl || '/assets/css/print.css',
    monoFontUrl: assetManifest?.monoFontUrl || '/assets/fonts/GeistMono-Variable.woff2',
    pixelFontUrl: assetManifest?.pixelFontUrl || '/assets/fonts/GeistPixel-Square.woff2',
    themeInitJsUrl: assetManifest?.themeInitJsUrl || '/assets/js/theme-init.js',
    themeJsUrl: assetManifest?.themeJsUrl || '/assets/js/theme.js',
    commandMenuJsUrl: assetManifest?.commandMenuJsUrl || '/assets/js/command-menu.js',
    faviconSvgUrl: assetManifest?.faviconSvgUrl || '/assets/favicon.svg',
    appleTouchIconUrl: assetManifest?.appleTouchIconUrl || '/assets/apple-touch-icon.png',
    ogCardUrl: assetManifest?.ogCardUrl || '/assets/og-card.png',
  };
}

export function renderSubpageDocument({
  title,
  description,
  canonicalUrl = null,
  robots = null,
  ogImageUrl = null,
  ogImageAlt = null,
  alternateLinks = [],
  ownerName,
  subtitleHtml,
  navLinks = [],
  mainSectionsHtml,
  footerLinks = [],
  copyrightHtml,
  assetUrls,
}) {
  const navLinksHtml = navLinks
    .map((l) => `<a href="${escapeHtml(l.href)}" class="ghost-link">${escapeHtml(l.label)}</a>`)
    .join('\n                    ');

  const footerLinksHtml = footerLinks
    .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
    .join('\n                <span aria-hidden="true">&middot;</span>\n                ');

  const alternatesHtml = alternateLinks
    .map(
      (a) =>
        `    <link rel="alternate" type="${escapeHtml(a.type)}" href="${escapeHtml(a.href)}" title="${escapeHtml(a.title)}">`
    )
    .join('\n');

  let socialMetaHtml = '';
  if (canonicalUrl && robots !== 'noindex' && ogImageUrl) {
    const altText = ogImageAlt || title;
    socialMetaHtml = `
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:type" content="image/png">
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">${robots ? `\n    <meta name="robots" content="${escapeHtml(robots)}">` : ''}
    <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0d0c0a" media="(prefers-color-scheme: dark)">
    <meta http-equiv="Content-Security-Policy" content="${STRICT_CSP}">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(assetUrls.faviconSvgUrl)}">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="${escapeHtml(assetUrls.appleTouchIconUrl)}">
    <link rel="manifest" href="/site.webmanifest">${canonicalUrl ? `\n    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : ''}${socialMetaHtml}${alternatesHtml ? `\n${alternatesHtml}` : ''}
    <link rel="stylesheet" href="${escapeHtml(assetUrls.cssUrl)}">
    <link rel="stylesheet" href="${escapeHtml(assetUrls.subpageCssUrl)}">
    <link rel="stylesheet" href="${escapeHtml(assetUrls.printCssUrl)}" media="print">
    <link rel="preload" href="${escapeHtml(assetUrls.monoFontUrl)}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="${escapeHtml(assetUrls.pixelFontUrl)}" as="font" type="font/woff2" crossorigin>
    <script src="${escapeHtml(assetUrls.themeInitJsUrl)}"></script>
    <script src="${escapeHtml(assetUrls.themeJsUrl)}" defer></script>
    <script src="${escapeHtml(assetUrls.commandMenuJsUrl)}" defer></script>
</head>
<body class="subpage-body">
    <a href="#main-content" class="sr-only skip-link">Skip to main content</a>

    <div class="subpage-main">
        <div class="cv-shell">
            <header class="subpage-nav">
                <div>
                    <a href="/" class="subpage-brand">${escapeHtml(ownerName)}</a>
                    ${subtitleHtml}
                </div>
                <div class="subpage-nav-actions">${navLinksHtml ? `\n                    <nav aria-label="Primary">\n                    ${navLinksHtml}\n                    </nav>` : ''}
                    <button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false">
                        <svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="4"></circle>
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                        </svg>
                        <svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </button>
                    <button id="command-trigger-mobile" type="button" class="icon-btn mobile-only-btn" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.3-4.3"></path>
                        </svg>
                    </button>
                </div>
            </header>

            <main id="main-content" class="cv-main" tabindex="-1">
${mainSectionsHtml}
            </main>
        </div>
    </div>

    <footer class="cv-footer-wrap">
        <div class="cv-footer-inner">
            ${copyrightHtml}
            <nav class="cv-footer-links" aria-label="Footer">
                ${footerLinksHtml}
            </nav>
        </div>
        <div class="command-bar">
            <button type="button" id="command-trigger" class="command-trigger" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                <span>Press</span>
                <kbd class="kbd-chip"><span id="command-modifier">Ctrl</span>+J</kbd>
                <span>to open the command menu</span>
            </button>
        </div>
    </footer>
</body>
</html>
`;
}

export function atomicWriteFileSync(targetPath, data, encoding) {
  const tempPath = `${targetPath}.tmp`;
  try {
    fs.writeFileSync(tempPath, data, encoding);
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    fs.rmSync(tempPath, { force: true });
    throw err;
  }
}

