import fs from 'node:fs';
import path from 'node:path';
import {
  escapeHtml,
  ICONS,
  renderCommandBarHtml,
  renderCspMeta,
  renderFooterLinks,
  renderSubpageLayout,
  renderThemeColorMetas,
  sanitizeHref,
} from './lib/html.mjs';
import { readJson, resolveBuildYear, writeTextIfChanged } from './lib/io.mjs';
import { isEntrypoint, ROOT, TEMPLATES_DIR } from './lib/paths.mjs';
import { formatProfileDisplay, getSiteEndpoints, THEME_COLORS } from './lib/site-config.mjs';

export function computeYearsOfExperience(data, currentYear = resolveBuildYear(data)) {
  const startYears = (data?.work || [])
    .map((job) => {
      const m = String(job?.startDate || '').match(/^(\d{4})/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((y) => !Number.isNaN(y));
  if (startYears.length === 0) return null;
  const earliest = Math.min(...startYears);
  return Math.max(1, currentYear - earliest);
}

function escapeVCardValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function getProfileIcon(network) {
  const key = String(network || '').toLowerCase();
  if (key === 'github') return ICONS.github;
  if (key === 'linkedin') return ICONS.linkedin;
  return ICONS.globe;
}

export function buildJsonLd(data) {
  const endpoints = getSiteEndpoints(data);
  const canonicalUrl = `${endpoints.baseUrl}/`;
  const personId = `${canonicalUrl}#person`;
  const websiteId = `${canonicalUrl}#website`;
  const profilePageId = `${canonicalUrl}#profilepage`;

  const uniqueSchools = [];
  const seenSchools = new Set();
  for (const edu of [...(data.education || [])].reverse()) {
    if (edu?.institution && !seenSchools.has(edu.institution)) {
      seenSchools.add(edu.institution);
      uniqueSchools.push({
        '@type': 'EducationalOrganization',
        name: edu.institution,
      });
    }
  }

  const currentEmployer = (data.work || []).find((job) => !job.endDate);
  const loc = data.basics?.location;
  const knowsAbout = Array.from(
    new Set([
      ...(data.skills || []).map((s) => s.name),
      ...(data.projects || []).flatMap((p) => p.keywords || []),
    ])
  ).filter(Boolean);
  const awards = (data.awards || []).map((a) => a.title).filter(Boolean);

  const personNode = {
    '@type': 'Person',
    '@id': personId,
    name: data.basics.name,
    jobTitle: data.meta?.jobTitle || data.basics.label,
    url: canonicalUrl,
    image: `${endpoints.baseUrl}/assets/avatar.jpg`,
    email: data.basics.email,
    sameAs: (data.basics.profiles || []).map((p) => p.url).filter(Boolean),
    ...(currentEmployer?.name
      ? {
          worksFor: {
            '@type': 'Organization',
            name: currentEmployer.name,
          },
        }
      : {}),
    knowsAbout,
    ...(data.languages?.length
      ? { knowsLanguage: data.languages.map((l) => l.language).filter(Boolean) }
      : {}),
    ...(uniqueSchools.length ? { alumniOf: uniqueSchools } : {}),
    ...(awards.length ? { award: awards } : {}),
    ...(loc
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: loc.city || '',
            addressRegion: loc.region || '',
            addressCountry: loc.countryCode || '',
          },
        }
      : {}),
    description: data.meta?.shortDescription || data.basics.summary,
  };

  const websiteNode = {
    '@type': 'WebSite',
    '@id': websiteId,
    url: canonicalUrl,
    name: data.meta.pageTitle || data.basics.name,
    description: data.meta.shortDescription,
    inLanguage: 'en',
    publisher: { '@id': personId },
  };

  const profilePageNode = {
    '@type': 'ProfilePage',
    '@id': profilePageId,
    url: canonicalUrl,
    name: data.meta.pageTitle || data.basics.name,
    description: data.meta.metaDescription || data.meta.shortDescription,
    inLanguage: 'en',
    isPartOf: { '@id': websiteId },
    mainEntity: { '@id': personId },
  };

  const publicationNodes = (data.publications || []).map((pub) => ({
    '@type': 'Article',
    headline: pub.name,
    url: pub.url,
    author: { '@id': personId },
    ...(pub.publisher
      ? {
          publisher: {
            '@type': 'Organization',
            name: pub.publisher,
          },
        }
      : {}),
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [websiteNode, profilePageNode, personNode, ...publicationNodes],
  };
}

export function buildVCard(data) {
  const endpoints = getSiteEndpoints(data);
  const nameParts = String(data.basics?.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');
  const org = (data.work?.find((job) => !job.endDate) || data.work?.[0])?.name || '';
  const loc = data.basics?.location || {};
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardValue(data.basics?.name || '')}`,
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
    `ORG:${escapeVCardValue(org)}`,
    `TITLE:${escapeVCardValue(data.meta?.jobTitle || data.basics?.label || '')}`,
    `EMAIL;TYPE=INTERNET:${escapeVCardValue(data.basics?.email || '')}`,
    `URL:${escapeVCardValue(endpoints.baseUrl)}`,
    `ADR;TYPE=HOME:;;;${escapeVCardValue(loc.city || '')};${escapeVCardValue(loc.region || '')};;${escapeVCardValue(loc.countryCode || '')}`,
    `NOTE:${escapeVCardValue(data.basics?.label || '')}`,
    'END:VCARD',
    '',
  ];
  return lines.join('\r\n');
}

export function buildLlmsTxt(data, currentYear = resolveBuildYear(data)) {
  const endpoints = getSiteEndpoints(data);
  const years = computeYearsOfExperience(data, currentYear);
  const yearsLabel = years ? `${years}+ years` : 'extensive';
  const workLines = (data.work || []).flatMap((job) => [
    `- ${job.position} at ${job.name} (${job.displayDate}), ${job.location}`,
    ...(job.highlights || []).map((h) => `  - ${h}`),
    ...(job.keywords?.length ? [`  - Keywords: ${job.keywords.join(', ')}`] : []),
  ]);
  const projectLines = (data.projects || []).flatMap((proj) => [
    `- [${proj.name}${proj.subtitle ? ` — ${proj.subtitle}` : ''}](${proj.url})`,
    `  - ${proj.description}`,
    ...(proj.highlights || []).map((h) => `  - ${h}`),
    ...(proj.keywords?.length ? [`  - Technologies: ${proj.keywords.join(', ')}`] : []),
  ]);
  const skillsLine = (data.skills || []).map((s) => s.name).join(', ');
  const educationLines = (data.education || []).map(
    (edu) =>
      `- ${edu.studyType}, ${edu.area} — ${edu.institution} (${edu.startDate}-${edu.endDate})`
  );
  const publicationLines = (data.publications || []).map(
    (pub) => `- [${pub.name}](${pub.url}) — ${pub.publisher}`
  );
  const awardLines = (data.awards || []).flatMap((award) => {
    const meta = [award.awarder, award.date].filter(Boolean).join(', ');
    const header = meta ? `- ${award.title} (${meta})` : `- ${award.title}`;
    return award.summary ? [header, `  - ${award.summary}`] : [header];
  });
  const languageLines = (data.languages || []).map((lang) =>
    lang.fluency ? `- ${lang.language} (${lang.fluency})` : `- ${lang.language}`
  );
  const profileLines = (data.basics?.profiles || []).map(
    (profile) => `- [${profile.network}](${profile.url})`
  );

  return [
    `# ${data.basics.name} — Portfolio`,
    '',
    `> This is the personal portfolio of ${data.basics.name}, a ${data.meta?.jobTitle || data.basics.label} with ${yearsLabel} of experience.`,
    '',
    ...(data.basics?.summary ? ['## Summary', data.basics.summary] : []),
    ...(workLines.length ? ['', '## Experience', ...workLines] : []),
    ...(projectLines.length ? ['', '## Selected Projects', ...projectLines] : []),
    ...(skillsLine ? ['', '## Core Skills', skillsLine] : []),
    ...(educationLines.length ? ['', '## Education', ...educationLines] : []),
    ...(languageLines.length ? ['', '## Languages', ...languageLines] : []),
    ...(publicationLines.length ? ['', '## Publications', ...publicationLines] : []),
    ...(awardLines.length ? ['', '## Awards', ...awardLines] : []),
    '',
    '## Machine-Readable & Verification Endpoints',
    `- [Resume PDF](${endpoints.resumePdfUrl}): Single-page A4 resume`,
    `- [JSON Resume](${endpoints.resumeJsonUrl}): Canonical structured profile data`,
    `- [Contact vCard](${endpoints.contactVcfUrl}): Downloadable vCard 3.0 contact`,
    `- [Architecture Overview](${endpoints.architectureUrl}): Build and verification pipeline overview`,
    `- [Quality Report](${endpoints.qualityReportUrl}): Live CI quality, accessibility, and Web Vitals report`,
    `- [Quality Telemetry JSON](${endpoints.qualityReportJsonUrl}): Machine-readable CI telemetry`,
    `- [Security Policy](${endpoints.securityTxtUrl}): RFC 9116 vulnerability disclosure policy`,
    '',
    '## Contact',
    `- Email: ${data.basics.email}`,
    ...profileLines,
    `- [Website](${endpoints.baseUrl}/)`,
    '',
  ].join('\n');
}

function renderTagList(items, extraClass = '') {
  const cls = extraClass ? `tag-list ${extraClass}` : 'tag-list';
  const lis = items
    .map((item) => `                            <li class="tag-item">${escapeHtml(item)}</li>`)
    .join('\n');
  return `                        <ul class="${cls}">\n${lis}\n                        </ul>`;
}

export function buildIndexMeta(data) {
  const endpoints = getSiteEndpoints(data);
  const title = escapeHtml(data.meta?.pageTitle || `${data.basics.name} - ${data.basics.label}`);
  const metaDesc = escapeHtml(data.meta?.metaDescription || data.basics.summary);
  const ogDesc = escapeHtml(data.meta?.ogDescription || data.meta?.shortDescription || metaDesc);
  const ogImageUrl = escapeHtml(endpoints.ogImageUrl);
  const ogImageAlt = escapeHtml(data.meta?.ogImageAlt || data.meta?.pageTitle || data.basics.name);
  const canonical = escapeHtml(data.meta?.canonical || `${endpoints.baseUrl}/`);
  const nameParts = String(data.basics?.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = escapeHtml(nameParts[0] || '');
  const lastName = escapeHtml(nameParts.slice(1).join(' '));

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${metaDesc}">`,
    '',
    '<!-- Open Graph / Social Media -->',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${ogDesc}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${ogImageUrl}">`,
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${ogImageAlt}">`,
    '<meta property="og:locale" content="en_US">',
    `<meta property="profile:first_name" content="${firstName}">`,
    `<meta property="profile:last_name" content="${lastName}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${ogDesc}">`,
    `<meta name="twitter:image" content="${ogImageUrl}">`,
    `<meta name="twitter:image:alt" content="${ogImageAlt}">`,
  ]
    .map((line, index) => (index === 0 || !line ? line : `    ${line}`))
    .join('\n');
}

export function buildCvContentHtml(data) {
  const endpoints = getSiteEndpoints(data);
  const city = data.basics?.location?.city || '';
  const region = data.basics?.location?.region || '';
  const locationText = [city, region].filter(Boolean).join(', ');
  const profiles = (data.basics?.profiles || []).filter((p) => p?.network && sanitizeHref(p.url));

  // Keep Print Contact deterministic: website, email, then ordered social profiles (GitHub/LinkedIn etc.)
  const orderedPrintProfiles = [
    ...profiles.filter((p) => p.network.toLowerCase() === 'github'),
    ...profiles.filter((p) => p.network.toLowerCase() !== 'github'),
  ];
  const printContactEntries = [
    endpoints.baseUrl
      ? `<a href="${escapeHtml(endpoints.baseUrl)}">${escapeHtml(endpoints.domain)}</a>`
      : '',
    data.basics?.email
      ? `<a href="mailto:${escapeHtml(data.basics.email)}">${escapeHtml(data.basics.email)}</a>`
      : '',
    ...orderedPrintProfiles.map((p) => {
      const safeUrl = sanitizeHref(p.url);
      return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(formatProfileDisplay(safeUrl))}</a>`;
    }),
  ].filter(Boolean);

  const orderedHeaderProfiles = orderedPrintProfiles;
  const headerSocialItems = [
    ...(data.basics?.email
      ? [
          `                            <li>
                                <a href="mailto:${escapeHtml(data.basics.email)}" class="icon-btn" aria-label="Email">
                                    ${ICONS.email}
                                    <span class="sr-only">Email</span>
                                </a>
                            </li>`,
        ]
      : []),
    ...orderedHeaderProfiles.map((p) => {
      const safeUrl = sanitizeHref(p.url);
      return `                            <li>
                                <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="icon-btn" aria-label="${escapeHtml(p.network)} Profile (opens in a new tab)">
                                    ${getProfileIcon(p.network)}
                                    <span class="sr-only">${escapeHtml(p.network)}</span>
                                </a>
                            </li>`;
    }),
  ].join('\n');

  const workHtml = (data.work || [])
    .map((job) => {
      const highlights = (job.highlights || [])
        .map((h) => `                            <li>${escapeHtml(h)}</li>`)
        .join('\n');
      const highlightsBlock = highlights
        ? `\n                        <ul class="work-highlights">\n${highlights}\n                        </ul>`
        : '';
      const tags = job.keywords?.length
        ? `\n${renderTagList(job.keywords, 'tag-list--spaced')}`
        : '';
      const roleRow = job.location
        ? `<div class="entry-top">\n                                <h4 class="entry-role">${escapeHtml(job.position)}</h4>\n                                <span class="entry-location">${escapeHtml(job.location)}</span>\n                            </div>`
        : `<h4 class="entry-role">${escapeHtml(job.position)}</h4>`;
      return `                    <article>
                        <div class="entry-header">
                            <div class="entry-top">
                                <h3 class="entry-heading">${escapeHtml(job.name)}</h3>
                                <div class="date-range">${escapeHtml(job.displayDate)}</div>
                            </div>
                            ${roleRow}
                        </div>${highlightsBlock}${tags}
                    </article>`;
    })
    .join('\n\n');

  const projects = data.projects || [];
  const allProjectsNoPrint = projects.length > 0 && projects.every((p) => p.showInPrint === false);
  const projectsHtml = projects
    .map((proj) => {
      const articleClass =
        proj.showInPrint === false && !allProjectsNoPrint ? ' class="no-print"' : '';
      const dateText = proj.displayDate || proj.startDate || '';
      const safeProjUrl = sanitizeHref(proj.url);
      const projHeadingHtml = safeProjUrl
        ? `<a href="${escapeHtml(safeProjUrl)}" target="_blank" rel="noopener noreferrer" class="inline-link">${escapeHtml(proj.name)}<span class="ext-arrow" aria-hidden="true">&nbsp;&#8599;</span><span class="sr-only"> (opens in a new tab)</span></a>`
        : escapeHtml(proj.name);

      const roleParts = [
        proj.subtitle ? escapeHtml(proj.subtitle) : '',
        ...(proj.links || [])
          .filter((l) => l?.label && sanitizeHref(l.url))
          .map(
            (l) =>
              `<a href="${escapeHtml(sanitizeHref(l.url))}" class="inline-link">${escapeHtml(l.label)}</a>`
          ),
      ].filter(Boolean);
      const roleBlock = roleParts.length
        ? `\n                            <p class="entry-role">${roleParts.join(' <span aria-hidden="true">&middot;</span> ')}</p>`
        : '';

      const highlights = proj.highlights?.length
        ? `\n                        <ul class="work-highlights">\n${proj.highlights
            .map((h) => `                            <li>${escapeHtml(h)}</li>`)
            .join('\n')}\n                        </ul>`
        : '';
      const tags = proj.keywords?.length
        ? `\n${renderTagList(proj.keywords, 'tag-list--spaced')}`
        : '';

      return `                    <article${articleClass}>
                        <div class="entry-header">
                            <div class="entry-top">
                                <h3 class="entry-heading">
                                    ${projHeadingHtml}
                                </h3>
                                <div class="date-range">${escapeHtml(dateText)}</div>
                            </div>${roleBlock}
                        </div>
                        <p class="project-desc">${escapeHtml(proj.description)}</p>${highlights}${tags}
                    </article>`;
    })
    .join('\n\n');

  const skillsItems = (data.skills || [])
    .map((s) => `                    <li class="tag-item">${escapeHtml(s.name)}</li>`)
    .join('\n');

  const pubHtml = (data.publications || [])
    .map((pub) => {
      const safePubUrl = sanitizeHref(pub.url);
      const heading = safePubUrl
        ? `<a href="${escapeHtml(safePubUrl)}" target="_blank" rel="noopener noreferrer" class="inline-link">${escapeHtml(pub.name)}<span class="ext-arrow" aria-hidden="true">&nbsp;&#8599;</span><span class="sr-only"> (opens in a new tab)</span></a>`
        : escapeHtml(pub.name);
      return `                    <article>
                        <h3 class="entry-heading">
                            ${heading}
                        </h3>
                        <p class="entry-sub">Publication <span aria-hidden="true">&middot;</span> ${escapeHtml(pub.publisher)}</p>
                    </article>`;
    })
    .join('\n\n');

  const formatAwardDate = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return iso || '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)));
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const awardHtml = (data.awards || [])
    .map((award) => {
      const dateStr = award.date ? formatAwardDate(award.date) : '';
      const headingRow = dateStr
        ? `<div class="entry-top">\n                            <h3 class="entry-heading">${escapeHtml(award.title)}</h3>\n                            <div class="date-range">${escapeHtml(dateStr)}</div>\n                        </div>`
        : `<h3 class="entry-heading">${escapeHtml(award.title)}</h3>`;
      const subParts = [
        award.awarder
          ? `Award <span aria-hidden="true">&middot;</span> ${escapeHtml(award.awarder)}`
          : 'Award',
        award.summary ? escapeHtml(award.summary) : '',
      ].filter(Boolean);
      return `                    <article>
                        ${headingRow}
                        <p class="entry-sub">${subParts.join(' <span aria-hidden="true">&middot;</span> ')}</p>
                    </article>`;
    })
    .join('\n\n');

  const languagesText = (data.languages || [])
    .map((lang) => escapeHtml(lang.fluency ? `${lang.language} (${lang.fluency})` : lang.language))
    .join(' &middot; ');

  const eduHtml = (data.education || [])
    .map(
      (edu) => `                    <article>
                        <div class="entry-top">
                            <h3 class="entry-heading">${escapeHtml(edu.institution)}</h3>
                            <div class="date-range">${escapeHtml(edu.startDate)} - ${escapeHtml(edu.endDate)}</div>
                        </div>
                        <p class="edu-degree">${escapeHtml(edu.studyType)}, ${escapeHtml(edu.area)}</p>
                    </article>`
    )
    .join('\n\n');

  const sections = [
    data.basics?.summary
      ? `            <section id="about" tabindex="-1" aria-labelledby="about-heading" class="cv-section animate-fade-in delay-1">
                <h2 id="about-heading" class="section-title">Summary</h2>
                <p class="summary-copy">
                    ${escapeHtml(data.basics.summary)}
                </p>
            </section>`
      : '',
    workHtml
      ? `            <section id="experience" aria-labelledby="experience-heading" class="cv-section animate-fade-in delay-2">
                <h2 id="experience-heading" class="section-title">Professional Experience</h2>
                <div class="work-list">

${workHtml}

                </div>
            </section>`
      : '',
    projectsHtml
      ? `            <section id="projects" aria-labelledby="projects-heading" class="cv-section animate-fade-in delay-3${allProjectsNoPrint ? ' no-print' : ''}">
                <h2 id="projects-heading" class="section-title">Selected Projects</h2>
                <div class="work-list">

${projectsHtml}

                </div>
            </section>`
      : '',
    skillsItems
      ? `            <section id="skills" aria-labelledby="skills-heading" class="cv-section animate-fade-in delay-4">
                <h2 id="skills-heading" class="section-title">Skills</h2>
                <ul class="tag-list tag-list--skills">
${skillsItems}
                </ul>
            </section>`
      : '',
    pubHtml || awardHtml
      ? `            <section id="publications" aria-labelledby="publications-heading" class="cv-section animate-fade-in delay-5">
                <h2 id="publications-heading" class="section-title">Publications &amp; Awards</h2>
                <div class="stack-list">
${[pubHtml, awardHtml].filter(Boolean).join('\n\n')}
                </div>
            </section>`
      : '',
    eduHtml
      ? `            <section id="education" aria-labelledby="education-heading" class="cv-section animate-fade-in delay-6">
                <h2 id="education-heading" class="section-title">Education</h2>
                <div class="stack-list stack-list--compact">
${eduHtml}
                </div>
            </section>`
      : '',
    languagesText
      ? `            <section id="languages" aria-labelledby="languages-heading" class="cv-section">
                <h2 id="languages-heading" class="section-title">Languages</h2>
                <p class="edu-degree">${languagesText}</p>
            </section>`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const locationBlock = locationText
    ? `
                    <p class="cv-location">
                        <span class="location-label">
                            ${ICONS.pin}
                            ${escapeHtml(locationText)}
                        </span>
                    </p>`
    : '';

  return `            <header class="cv-header animate-fade-in">
                <div class="header-info">
                    <h1 class="cv-name" id="resume-name">${escapeHtml(data.basics.name)}</h1>
                    <p class="cv-tagline">${escapeHtml(data.basics.label)}</p>${locationBlock}
                    <div class="print-contact">
                        ${printContactEntries.join('\n                        <span aria-hidden="true">/</span>\n                        ')}
                    </div>
                </div>
                <picture class="avatar-picture">
                    <source type="image/avif" srcset="/assets/avatar-168.avif 168w, /assets/avatar-224.avif 224w, /assets/avatar-336.avif 336w" sizes="(min-width: 640px) 112px, (min-width: 380px) 84px, 72px">
                    <source type="image/webp" srcset="/assets/avatar-168.webp 168w, /assets/avatar-224.webp 224w, /assets/avatar-336.webp 336w" sizes="(min-width: 640px) 112px, (min-width: 380px) 84px, 72px">
                    <img class="avatar" src="/assets/avatar.jpg" alt="${escapeHtml(data.basics.name)}" width="112" height="112" decoding="sync" fetchpriority="high">
                </picture>
                <div class="header-actions no-print">
                    <nav aria-label="Social links">
                        <ul class="contact-list">
${headerSocialItems}
                        </ul>
                    </nav>
                    <a href="${escapeHtml(endpoints.resumePdfPath)}" class="icon-btn" aria-label="Download My Resume (PDF)">
                        ${ICONS.download}
                        <span class="sr-only">Download My Resume</span>
                    </a>
                    <button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false">
                        ${ICONS.sun}
                        ${ICONS.moon}
                    </button>
                    <button id="command-trigger-mobile" type="button" class="icon-btn mobile-only-btn" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false">
                        ${ICONS.search}
                    </button>
                </div>
            </header>

${sections}`;
}

function resolveTemplatePath(rootDir) {
  const candidate = path.join(rootDir, 'src', 'templates', 'index.html');
  return fs.existsSync(candidate) ? candidate : path.join(TEMPLATES_DIR, 'index.html');
}

export function buildIndexHtml(
  data,
  { rootDir = ROOT, year = resolveBuildYear(data, rootDir) } = {}
) {
  const endpoints = getSiteEndpoints(data);
  const template = fs.readFileSync(resolveTemplatePath(rootDir), 'utf8');
  const formattedJsonLd = JSON.stringify(buildJsonLd(data), null, 2)
    .replace(/<\//g, '<\\/')
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  const jsonLdBlock = `<script type="application/ld+json">\n${formattedJsonLd}\n    </script>`;

  const canonicalUrl = data.meta?.canonical || `${endpoints.baseUrl}/`;
  const headLinks = [
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<link rel="alternate" type="application/json" href="${escapeHtml(endpoints.resumeJsonPath)}" title="JSON Resume">`,
    `<link rel="alternate" type="text/plain" href="${escapeHtml(endpoints.llmsTxtPath)}" title="LLMs.txt">`,
  ].join('\n    ');

  const skipLinkHref = data.basics?.summary
    ? '#about'
    : data.work?.length
      ? '#experience'
      : '#main-content';

  const footerLinks = [
    { href: endpoints.architecturePath, label: 'Architecture' },
    { href: endpoints.qualityPath, label: 'Quality Report' },
    { href: endpoints.resumeJsonPath, label: 'JSON Resume' },
    { href: endpoints.llmsTxtPath, label: 'llms.txt' },
  ];

  const replacements = {
    '{{META}}': buildIndexMeta(data),
    '{{THEME_COLOR_METAS}}': renderThemeColorMetas('    '),
    '{{CSP_META}}': renderCspMeta(),
    '{{HEAD_LINKS}}': headLinks,
    '{{JSONLD}}': jsonLdBlock,
    '{{SKIP_LINK_HREF}}': escapeHtml(skipLinkHref),
    '{{CV_CONTENT}}': buildCvContentHtml(data),
    '{{COPYRIGHT}}': `<span>&copy; ${escapeHtml(String(year))} ${escapeHtml(data.basics.name)}</span>`,
    '{{FOOTER_LINKS}}': renderFooterLinks(footerLinks),
    '{{COMMAND_BAR}}': renderCommandBarHtml(),
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.replace(token, () => value);
  }
  return html;
}

export function build404Html(data, { year = resolveBuildYear(data) } = {}) {
  const endpoints = getSiteEndpoints(data);
  const mainHtml = `            <section class="panel-card panel-card--spacious">
                <p class="section-title">error 404</p>
                <h1 class="cv-name error-title">Page Not Found</h1>
                <p class="summary-copy error-copy">
                    The page or resource you requested does not exist or may have moved. You can return to the main portfolio, download the latest resume PDF, or inspect the live CI quality report.
                </p>
                <div class="error-actions">
                    <a href="/" class="primary-link">Back to Portfolio</a>
                    <a href="${escapeHtml(endpoints.resumePdfPath)}" class="ghost-link">Download Resume (PDF)</a>
                    <a href="${escapeHtml(endpoints.qualityPath)}" class="ghost-link">Quality Report</a>
                </div>
            </section>`;

  return renderSubpageLayout({
    title: `Page Not Found (404) - ${data.basics.name}`,
    description: `The requested page could not be found on ${endpoints.domain}.`,
    robots: 'noindex',
    ownerName: data.basics.name,
    subtitleHtml: `<p class="entry-sub">${escapeHtml(data.basics.label)}</p>`,
    navLinks: [{ href: '/', label: 'Portfolio' }],
    mainHtml,
    footerLinks: [
      { href: '/', label: 'Portfolio' },
      { href: endpoints.architecturePath, label: 'Architecture' },
      { href: endpoints.qualityPath, label: 'Quality Report' },
      { href: endpoints.resumeJsonPath, label: 'JSON Resume' },
      { href: endpoints.llmsTxtPath, label: 'llms.txt' },
    ],
    copyrightYear: year,
  });
}

export function buildSiteWebmanifest(data, currentManifest = {}) {
  return `${JSON.stringify(
    {
      ...currentManifest,
      name: data.basics.name,
      short_name: data.meta?.shortName || currentManifest.short_name || data.basics.name,
      description: data.meta?.manifestDescription || data.basics.label,
      background_color: THEME_COLORS.light,
      theme_color: THEME_COLORS.light,
    },
    null,
    2
  )}\n`;
}

export function buildSitemapXml(data) {
  const endpoints = getSiteEndpoints(data);
  const entries = [
    { loc: `${endpoints.baseUrl}/`, changefreq: 'monthly', priority: '1.0' },
    { loc: endpoints.resumePdfUrl, changefreq: 'monthly', priority: '0.8' },
    { loc: endpoints.architectureUrl, changefreq: 'monthly', priority: '0.6' },
    { loc: endpoints.qualityReportUrl, changefreq: 'weekly', priority: '0.6' },
  ];
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(data) {
  const endpoints = getSiteEndpoints(data);
  return `User-agent: *\nAllow: /\n\nSitemap: ${endpoints.sitemapUrl}\n`;
}

export function buildCname(data) {
  const endpoints = getSiteEndpoints(data);
  return `${endpoints.domain}\n`;
}

export function syncSecurityTxt(currentContent, data) {
  const endpoints = getSiteEndpoints(data);
  const nextContact = `Contact: mailto:${data.basics.email}`;
  const nextCanonical = `Canonical: ${endpoints.securityTxtUrl}`;
  return currentContent
    .replace(/^Contact:.*$/m, nextContact)
    .replace(/^Canonical:.*$/m, nextCanonical);
}

export function syncAllFromResume(rootDir = ROOT) {
  const resumePath = path.join(rootDir, 'resume.json');
  const indexPath = path.join(rootDir, 'index.html');
  const notFoundPath = path.join(rootDir, '404.html');
  const llmsPath = path.join(rootDir, 'llms.txt');
  const manifestPath = path.join(rootDir, 'site.webmanifest');
  const sitemapPath = path.join(rootDir, 'sitemap.xml');
  const robotsPath = path.join(rootDir, 'robots.txt');
  const cnamePath = path.join(rootDir, 'CNAME');
  const securityTxtPath = path.join(rootDir, '.well-known', 'security.txt');

  const data = readJson(resumePath);
  const year = resolveBuildYear(data, rootDir);

  if (writeTextIfChanged(indexPath, buildIndexHtml(data, { rootDir, year }))) {
    console.log('Updated index.html from resume.json + src/templates/index.html');
  } else {
    console.log('index.html is already in sync with resume.json');
  }

  if (writeTextIfChanged(notFoundPath, build404Html(data, { year }))) {
    console.log('Updated 404.html from resume.json');
  } else {
    console.log('404.html is already in sync with resume.json');
  }

  if (writeTextIfChanged(llmsPath, buildLlmsTxt(data, year))) {
    console.log('Updated llms.txt from resume.json');
  } else {
    console.log('llms.txt is already in sync with resume.json');
  }

  const prevManifestRaw = fs.existsSync(manifestPath)
    ? fs.readFileSync(manifestPath, 'utf8')
    : '{}';
  const prevManifest = JSON.parse(prevManifestRaw);
  const nextManifestRaw = buildSiteWebmanifest(data, prevManifest);
  if (writeTextIfChanged(manifestPath, nextManifestRaw)) {
    console.log('Updated site.webmanifest from resume.json');
  } else {
    console.log('site.webmanifest is already in sync with resume.json');
  }

  if (writeTextIfChanged(sitemapPath, buildSitemapXml(data))) {
    console.log('Updated sitemap.xml from resume.json');
  } else {
    console.log('sitemap.xml is already in sync with resume.json');
  }

  if (writeTextIfChanged(robotsPath, buildRobotsTxt(data))) {
    console.log('Updated robots.txt from resume.json');
  } else {
    console.log('robots.txt is already in sync with resume.json');
  }

  if (writeTextIfChanged(cnamePath, buildCname(data))) {
    console.log('Updated CNAME from resume.json');
  } else {
    console.log('CNAME is already in sync with resume.json');
  }

  if (fs.existsSync(securityTxtPath)) {
    const prevSec = fs.readFileSync(securityTxtPath, 'utf8');
    const nextSec = syncSecurityTxt(prevSec, data);
    if (writeTextIfChanged(securityTxtPath, nextSec)) {
      console.log('Updated .well-known/security.txt from resume.json');
    } else {
      console.log('.well-known/security.txt is already in sync with resume.json');
    }
  }
}

if (isEntrypoint(import.meta.url)) {
  syncAllFromResume();
}
