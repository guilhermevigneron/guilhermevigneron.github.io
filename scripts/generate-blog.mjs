import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, renderSubpageLayout } from './lib/html.mjs';
import { readJson, readJsonIfExists, resolveBuildYear } from './lib/io.mjs';
import { estimateReadingTime, parseFrontmatter, renderMarkdown } from './lib/markdown.mjs';
import { isEntrypoint, ROOT, resolveRootPaths } from './lib/paths.mjs';
import { getSiteEndpoints } from './lib/site-config.mjs';
import { minifyHtml } from './minify-html.mjs';

function deriveSlug(filename, frontmatterSlug) {
  const raw = frontmatterSlug || filename.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return (
    String(raw)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'post'
  );
}

function formatPostDate(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(isoDate || '');
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatRfc822Date(isoDate) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date().toUTCString();
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.toUTCString();
}

export function loadBlogPosts(rootDir = ROOT) {
  const blogDir = path.join(rootDir, 'content', 'blog');
  if (!fs.existsSync(blogDir)) return [];

  const files = fs
    .readdirSync(blogDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const posts = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
    const { data, content } = parseFrontmatter(raw);
    if (data.draft === true) continue;

    const slug = deriveSlug(file, data.slug);
    const date = String(data.date || '').slice(0, 10);
    const title = String(data.title || slug);
    const summary = String(data.summary || '');
    const tags = Array.isArray(data.tags) ? data.tags.filter(Boolean) : [];
    const readingMinutes = estimateReadingTime(content);
    const bodyHtml = renderMarkdown(content);

    posts.push({
      slug,
      title,
      date,
      formattedDate: formatPostDate(date),
      summary,
      tags,
      readingMinutes,
      bodyHtml,
    });
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

function buildRssFeed(posts, resume, endpoints) {
  const ownerName = resume.basics.name;
  const items = posts
    .map((post) => {
      const link = `${endpoints.baseUrl}${endpoints.blogPath}${post.slug}/`;
      return `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${escapeHtml(formatRfc822Date(post.date))}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(ownerName)} — Blog</title>
    <link>${escapeHtml(endpoints.blogUrl)}</link>
    <description>${escapeHtml(`Articles and engineering notes by ${ownerName}.`)}</description>
    <language>en-us</language>
    <atom:link href="${escapeHtml(endpoints.feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

export function buildBlogPages({
  rootDir = ROOT,
  siteDir = null,
  reportsDir = null,
  resume: resumeArg = null,
} = {}) {
  const paths = resolveRootPaths(rootDir);
  const resolvedSiteDir = siteDir || paths.siteDir;
  const resolvedReportsDir = reportsDir || paths.reportsDir;
  const resume = resumeArg || readJson(paths.resumePath);
  const endpoints = getSiteEndpoints(resume);
  const ownerName = resume.basics.name;
  const currentYear = resolveBuildYear(resume, rootDir);
  const assetManifest = readJsonIfExists(path.join(resolvedReportsDir, 'asset-manifest.json'));

  const posts = loadBlogPosts(rootDir);
  const rssLink = `<link rel="alternate" type="application/rss+xml" href="${escapeHtml(endpoints.feedPath)}" title="${escapeHtml(ownerName)} Blog RSS">`;
  const blogCssHref = assetManifest?.blogCssUrl || '/assets/css/blog.css';
  const blogCssLink = `<link rel="stylesheet" href="${escapeHtml(blogCssHref)}">`;
  const footerLinks = [
    { href: '/', label: 'Portfolio' },
    { href: endpoints.architecturePath, label: 'Architecture' },
    { href: endpoints.qualityPath, label: 'Quality Report' },
    { href: endpoints.feedPath, label: 'RSS Feed' },
  ];

  const listHtml = posts.length
    ? `<div class="blog-list">
                ${posts
                  .map((post) => {
                    const postHref = `${endpoints.blogPath}${post.slug}/`;
                    const tagsHtml = post.tags.length
                      ? `<ul class="blog-tags">${post.tags.map((t) => `<li class="blog-tag">${escapeHtml(t)}</li>`).join('')}</ul>`
                      : '';
                    return `<article class="blog-card">
                    <div class="blog-meta">
                        <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.formattedDate)}</time>
                        <span aria-hidden="true">&middot;</span>
                        <span>${post.readingMinutes} min read</span>
                    </div>
                    <h2 class="blog-title"><a href="${escapeHtml(postHref)}">${escapeHtml(post.title)}</a></h2>
                    ${post.summary ? `<p class="blog-summary">${escapeHtml(post.summary)}</p>` : ''}
                    ${tagsHtml}
                </article>`;
                  })
                  .join('\n                ')}
            </div>`
    : '<p class="summary-copy">No posts published yet.</p>';

  const indexMainHtml = `            <section class="cv-section">
                <h1 class="cv-name">Blog</h1>
                <p class="summary-copy">
                    Engineering notes on software architecture, testing, performance, and building reliable systems.
                </p>
            </section>

            <section class="cv-section" aria-label="Blog posts">
                ${listHtml}
            </section>`;

  const indexHtml = renderSubpageLayout({
    title: `Blog - ${ownerName}`,
    description: `Engineering notes and articles by ${ownerName}.`,
    canonicalUrl: endpoints.blogUrl,
    originTrialToken: resume.meta?.webmcpOriginTrialToken,
    extraHeadLinks: [blogCssLink, rssLink],
    ownerName,
    subtitleHtml: `<p class="entry-sub">Writing &amp; Notes</p>`,
    navLinks: [
      { href: '/', label: 'Portfolio' },
      { href: endpoints.feedPath, label: 'RSS' },
    ],
    mainHtml: indexMainHtml,
    footerLinks,
    copyrightYear: currentYear,
    assetManifest,
  });

  const blogOutDir = path.join(
    resolvedSiteDir,
    endpoints.blogPath.replace(/^\/+|\/+$/g, '') || 'blog'
  );
  fs.mkdirSync(blogOutDir, { recursive: true });
  fs.writeFileSync(path.join(blogOutDir, 'index.html'), minifyHtml(indexHtml), 'utf8');

  for (const post of posts) {
    const postUrl = `${endpoints.baseUrl}${endpoints.blogPath}${post.slug}/`;
    const tagsHtml = post.tags.length
      ? `<ul class="blog-tags">${post.tags.map((t) => `<li class="blog-tag">${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';
    const postMainHtml = `            <article class="cv-section">
                <header class="blog-post-header">
                    <div class="blog-meta">
                        <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.formattedDate)}</time>
                        <span aria-hidden="true">&middot;</span>
                        <span>${post.readingMinutes} min read</span>
                    </div>
                    <h1 class="cv-name">${escapeHtml(post.title)}</h1>
                    ${post.summary ? `<p class="summary-copy">${escapeHtml(post.summary)}</p>` : ''}
                    ${tagsHtml}
                </header>
                <div class="prose">
                    ${post.bodyHtml}
                </div>
            </article>`;

    const fullTitle = `${post.title} - ${ownerName}`;
    const postPageTitle =
      fullTitle.length <= 70
        ? fullTitle
        : post.title.length <= 70
          ? post.title
          : `${post.title.slice(0, 67)}...`;

    const postHtml = renderSubpageLayout({
      title: postPageTitle,
      description: post.summary || `Article by ${ownerName}`,
      canonicalUrl: postUrl,
      originTrialToken: resume.meta?.webmcpOriginTrialToken,
      extraHeadLinks: [blogCssLink, rssLink],
      ownerName,
      subtitleHtml: `<p class="entry-sub">Blog</p>`,
      navLinks: [
        { href: endpoints.blogPath, label: 'All Posts' },
        { href: '/', label: 'Portfolio' },
      ],
      mainHtml: postMainHtml,
      footerLinks,
      copyrightYear: currentYear,
      assetManifest,
    });

    const postDir = path.join(blogOutDir, post.slug);
    fs.mkdirSync(postDir, { recursive: true });
    fs.writeFileSync(path.join(postDir, 'index.html'), minifyHtml(postHtml), 'utf8');
  }

  const feedPath = path.join(resolvedSiteDir, endpoints.feedPath.replace(/^\/+/, ''));
  fs.writeFileSync(feedPath, buildRssFeed(posts, resume, endpoints), 'utf8');
  console.log(
    `Generated ${posts.length} blog post(s) at ${endpoints.blogPath} and ${endpoints.feedPath}`
  );
}

if (isEntrypoint(import.meta.url)) {
  buildBlogPages();
}
