import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function computeYearsOfExperience(data, currentYear = new Date().getUTCFullYear()) {
  const startYears = (data.work || [])
    .map((job) => {
      const m = String(job.startDate || '').match(/^(\d{4})/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((y) => !Number.isNaN(y));
  if (startYears.length === 0) return null;
  const earliest = Math.min(...startYears);
  return Math.max(1, currentYear - earliest);
}

export function buildJsonLd(data) {
  const uniqueSchools = [];
  const seenSchools = new Set();
  for (const edu of [...data.education].reverse()) {
    if (!seenSchools.has(edu.institution)) {
      seenSchools.add(edu.institution);
      uniqueSchools.push({
        '@type': 'EducationalOrganization',
        name: edu.institution,
      });
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: data.basics.name,
    jobTitle: data.meta.jobTitle,
    url: data.basics.url,
    image: `${data.basics.url}/assets/avatar.jpg`,
    email: data.basics.email,
    sameAs: data.basics.profiles.map((p) => p.url),
    worksFor: {
      '@type': 'Organization',
      name: data.work[0].name,
    },
    knowsAbout: data.skills.map((s) => s.name),
    alumniOf: uniqueSchools,
    address: {
      '@type': 'PostalAddress',
      addressLocality: data.basics.location.city,
      addressRegion: data.basics.location.region,
      addressCountry: data.basics.location.countryCode,
    },
    description: data.meta.shortDescription,
  };
}

export function buildVCard(data) {
  const nameParts = String(data.basics.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');
  const org = data.work?.[0]?.name || '';
  const loc = data.basics.location || {};
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${data.basics.name}`,
    `N:${lastName};${firstName};;;`,
    `ORG:${org}`,
    `TITLE:${data.meta.jobTitle}`,
    `EMAIL;TYPE=INTERNET:${data.basics.email}`,
    `URL:${data.basics.url}`,
    `ADR;TYPE=HOME:;;${loc.city || ''};${loc.region || ''};;${loc.countryCode || ''}`,
    `NOTE:${data.basics.label}`,
    'END:VCARD',
    '',
  ];
  return lines.join('\r\n');
}

export function buildLlmsTxt(data) {
  const years = computeYearsOfExperience(data);
  const yearsLabel = years ? `${years}+ years` : 'extensive';
  const workLines = data.work.flatMap((job) => [
    `- ${job.position} at ${job.name} (${job.displayDate}), ${job.location}`,
    ...(job.highlights || []).map((h) => `  - ${h}`),
  ]);
  const projectLines = (data.projects || []).flatMap((proj) => [
    `- ${proj.name} — ${proj.subtitle} (${proj.url})`,
    `  - ${proj.description}`,
    ...(proj.highlights || []).map((h) => `  - ${h}`),
  ]);
  const skillsLine = data.skills.map((s) => s.name).join(', ');
  const educationLines = data.education.map(
    (edu) =>
      `- ${edu.studyType}, ${edu.area} — ${edu.institution} (${edu.startDate}-${edu.endDate})`
  );
  const publicationLines = data.publications.map(
    (pub) => `- "${pub.name}" — ${pub.publisher} (${pub.url})`
  );
  const awardLines = data.awards.map((award) => `- ${award.title}`);
  const profileLines = data.basics.profiles.map(
    (profile) => `- ${profile.network}: ${profile.url}`
  );

  return [
    `# ${data.basics.name} — Portfolio`,
    '',
    `> This is the personal portfolio of ${data.basics.name}, a ${data.meta.jobTitle} with ${yearsLabel} of experience.`,
    '',
    '## Summary',
    data.basics.summary,
    '',
    '## Experience',
    ...workLines,
    '',
    '## Selected Projects',
    ...projectLines,
    '',
    '## Core Skills',
    skillsLine,
    '',
    '## Education',
    ...educationLines,
    '',
    '## Publications',
    ...publicationLines,
    '',
    '## Awards',
    ...awardLines,
    '',
    '## Machine-Readable & Verification Endpoints',
    `- Resume PDF: ${data.meta.resumePdfUrl}`,
    `- JSON Resume: ${data.meta.resumeJsonUrl}`,
    `- Contact vCard: ${data.meta.contactVcfUrl}`,
    `- Quality Report: ${data.meta.qualityReportUrl}`,
    `- Quality Telemetry JSON: ${data.meta.qualityReportJsonUrl}`,
    `- Security Policy: ${data.meta.securityTxtUrl}`,
    '',
    '## Contact',
    `- Email: ${data.basics.email}`,
    ...profileLines,
    `- Website: ${data.basics.url}`,
    '',
  ].join('\n');
}

function renderTagList(items, extraClass = '') {
  const cls = extraClass ? `tag-list ${extraClass}` : 'tag-list';
  const lis = items
    .map((item, idx) => {
      const sep =
        idx < items.length - 1
          ? '<span class="tag-sep" aria-hidden="true">&nbsp;&middot; </span>'
          : '';
      return `                            <li class="tag-item">${escapeHtml(item)}${sep}</li>`;
    })
    .join('\n');
  return `                        <ul class="${cls}">\n${lis}\n                        </ul>`;
}

export function buildIndexMeta(data) {
  const title = escapeHtml(data.meta.pageTitle || `${data.basics.name} - ${data.basics.label}`);
  const metaDesc = escapeHtml(data.meta.metaDescription || data.basics.summary);
  const ogDesc = escapeHtml(data.meta.ogDescription || data.meta.shortDescription);
  const ogImageUrl = escapeHtml(data.meta.ogImageUrl || `${data.basics.url}/assets/og-card.png`);
  const canonical = escapeHtml(data.meta.canonical || data.basics.url);
  const nameParts = String(data.basics.name || '').trim().split(/\s+/);
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
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${title}">`,
    '<meta property="og:locale" content="en_US">',
    `<meta property="profile:first_name" content="${firstName}">`,
    `<meta property="profile:last_name" content="${lastName}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${ogDesc}">`,
    `<meta name="twitter:image" content="${ogImageUrl}">`,
  ]
    .map((line, index) => (index === 0 || !line ? line : `    ${line}`))
    .join('\n');
}

export function buildCvContentHtml(data) {
  const domain = String(data.basics.url || '').replace(/^https?:\/\//, '');
  const city = data.basics.location?.city || '';
  const region = data.basics.location?.region || '';
  const locationText = region ? `${city}, ${region}` : city;
  const linkedin = data.basics.profiles.find((p) => p.network.toLowerCase() === 'linkedin');
  const github = data.basics.profiles.find((p) => p.network.toLowerCase() === 'github');
  const linkedinDisplay = linkedin ? linkedin.url.replace(/^https?:\/\/(www\.)?/, '') : '';
  const githubDisplay = github ? github.url.replace(/^https?:\/\//, '') : '';

  const workHtml = data.work
    .map((job) => {
      const highlights = (job.highlights || [])
        .map((h) => `                            <li>${escapeHtml(h)}</li>`)
        .join('\n');
      const tags = job.keywords?.length ? `\n${renderTagList(job.keywords, 'tag-list--spaced')}` : '';
      return `                    <article>
                        <div class="entry-header">
                            <div class="entry-top">
                                <h3 class="entry-heading">${escapeHtml(job.name)}</h3>
                                <div class="date-range" title="Employment period: ${escapeHtml(job.displayDate)}">${escapeHtml(job.displayDate)}</div>
                            </div>
                            <h4 class="entry-role">${escapeHtml(job.position)}</h4>
                        </div>
                        <ul class="work-highlights">
${highlights}
                        </ul>${tags}
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
      const extraLinks = (proj.links || [])
        .map(
          (l) =>
            ` <span aria-hidden="true">&middot;</span> <a href="${escapeHtml(l.url)}" class="inline-link">${escapeHtml(l.label)}</a>`
        )
        .join('');
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
                                    <a href="${escapeHtml(proj.url)}" target="_blank" rel="noopener noreferrer" class="inline-link">${escapeHtml(proj.name)}<span class="ext-arrow" aria-hidden="true">&nbsp;&#8599;</span></a>
                                </h3>
                                <div class="date-range" title="Project timeline: ${escapeHtml(dateText)}">${escapeHtml(dateText)}</div>
                            </div>
                            <p class="entry-role">${escapeHtml(proj.subtitle || '')}${extraLinks}</p>
                        </div>
                        <p class="project-desc">${escapeHtml(proj.description)}</p>${highlights}${tags}
                    </article>`;
    })
    .join('\n\n');

  const skillsItems = data.skills
    .map((s, idx) => {
      const sep =
        idx < data.skills.length - 1
          ? '<span class="tag-sep" aria-hidden="true">&nbsp;&middot; </span>'
          : '';
      return `                    <li class="tag-item">${escapeHtml(s.name)}${sep}</li>`;
    })
    .join('\n');

  const pubHtml = data.publications
    .map(
      (pub) => `                    <article>
                        <h3 class="entry-heading">
                            <a href="${escapeHtml(pub.url)}" target="_blank" rel="noopener noreferrer" class="inline-link">${escapeHtml(pub.name)}<span class="ext-arrow" aria-hidden="true">&nbsp;&#8599;</span></a>
                        </h3>
                        <p class="entry-sub">Publication <span aria-hidden="true">&middot;</span> ${escapeHtml(pub.publisher)}</p>
                    </article>`
    )
    .join('\n\n');

  const awardHtml = data.awards
    .map(
      (award) => `                    <article>
                        <h3 class="entry-heading">${escapeHtml(award.title)}</h3>
                        <p class="entry-sub">Award <span aria-hidden="true">&middot;</span> ${escapeHtml(award.awarder)}</p>
                    </article>`
    )
    .join('\n\n');

  const eduHtml = data.education
    .map(
      (edu) => `                    <article>
                        <div class="entry-top">
                            <h3 class="entry-heading">${escapeHtml(edu.institution)}</h3>
                            <div class="date-range" title="Period: ${escapeHtml(edu.startDate)} to ${escapeHtml(edu.endDate)}">${escapeHtml(edu.startDate)} - ${escapeHtml(edu.endDate)}</div>
                        </div>
                        <p class="edu-degree">${escapeHtml(edu.studyType)}, ${escapeHtml(edu.area)}</p>
                    </article>`
    )
    .join('\n\n');

  return `            <header class="cv-header animate-fade-in">
                <div class="header-info">
                    <h1 class="cv-name" id="resume-name">${escapeHtml(data.basics.name)}</h1>
                    <p class="cv-tagline">${escapeHtml(data.basics.label)}</p>
                    <p class="cv-location">
                        <span class="location-label">
                            <svg class="icon-pin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            ${escapeHtml(locationText)}
                        </span>
                    </p>
                    <div class="print-contact">
                        <a href="${escapeHtml(data.basics.url)}">${escapeHtml(domain)}</a>
                        <span aria-hidden="true">/</span>
                        <a href="mailto:${escapeHtml(data.basics.email)}">${escapeHtml(data.basics.email)}</a>
                        <span aria-hidden="true">/</span>
                        <a href="${escapeHtml(github?.url || '')}">${escapeHtml(githubDisplay)}</a>
                        <span aria-hidden="true">/</span>
                        <a href="${escapeHtml(linkedin?.url || '')}">${escapeHtml(linkedinDisplay)}</a>
                    </div>
                </div>
                <picture class="avatar-picture">
                    <source type="image/avif" srcset="/assets/avatar-168.avif 168w, /assets/avatar-224.avif 224w, /assets/avatar-336.avif 336w" sizes="(min-width: 640px) 112px, (min-width: 380px) 84px, 72px">
                    <source type="image/webp" srcset="/assets/avatar-168.webp 168w, /assets/avatar-224.webp 224w, /assets/avatar-336.webp 336w" sizes="(min-width: 640px) 112px, (min-width: 380px) 84px, 72px">
                    <img class="avatar" src="/assets/avatar.jpg" alt="${escapeHtml(data.basics.name)}'s profile picture" width="112" height="112" decoding="async" fetchpriority="high">
                </picture>
                <div class="header-actions no-print">
                    <nav aria-label="Social links">
                        <ul class="contact-list">
                            <li>
                                <a href="mailto:${escapeHtml(data.basics.email)}" class="icon-btn" aria-label="Email" title="Email">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                                        <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                                    </svg>
                                    <span class="sr-only">Email</span>
                                </a>
                            </li>
                            <li>
                                <a href="${escapeHtml(github?.url || '')}" target="_blank" rel="noopener noreferrer" class="icon-btn" aria-label="GitHub Profile (opens in a new tab)" title="GitHub">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                                        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
                                    </svg>
                                    <span class="sr-only">GitHub</span>
                                </a>
                            </li>
                            <li>
                                <a href="${escapeHtml(linkedin?.url || '')}" target="_blank" rel="noopener noreferrer" class="icon-btn" aria-label="LinkedIn Profile (opens in a new tab)" title="LinkedIn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path>
                                    </svg>
                                    <span class="sr-only">LinkedIn</span>
                                </a>
                            </li>
                        </ul>
                    </nav>
                    <a href="${escapeHtml(data.meta.resumePdf)}" class="icon-btn" aria-label="Download My Resume (PDF)" title="Download My Resume (PDF)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                            <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
                            <path d="M12 18v-6"></path>
                            <path d="m9 15 3 3 3-3"></path>
                        </svg>
                        <span class="sr-only">Download My Resume</span>
                    </a>
                    <button id="theme-toggle" type="button" class="icon-btn" aria-label="Switch to dark theme" aria-pressed="false" title="Switch to dark theme">
                        <svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="4"></circle>
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                        </svg>
                        <svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    </button>
                    <button id="command-trigger-mobile" type="button" class="icon-btn mobile-only-btn" aria-label="Open command menu" aria-haspopup="dialog" aria-controls="command-dialog" aria-expanded="false" title="Open command menu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.3-4.3"></path>
                        </svg>
                    </button>
                </div>
            </header>

            <section id="about" aria-labelledby="about-heading" class="cv-section animate-fade-in delay-1">
                <h2 id="about-heading" class="section-title">About Me</h2>
                <p class="summary-copy">
                    ${escapeHtml(data.basics.summary)}
                </p>
            </section>

            <section id="experience" aria-labelledby="experience-heading" class="cv-section animate-fade-in delay-2">
                <h2 id="experience-heading" class="section-title">Professional Experience</h2>
                <div class="work-list">

${workHtml}

                </div>
            </section>

            <section id="projects" aria-labelledby="projects-heading" class="cv-section animate-fade-in delay-3${allProjectsNoPrint ? ' no-print' : ''}">
                <h2 id="projects-heading" class="section-title">Selected Projects</h2>
                <div class="work-list">

${projectsHtml}

                </div>
            </section>

            <section id="skills" aria-labelledby="skills-heading" class="cv-section animate-fade-in delay-4">
                <h2 id="skills-heading" class="section-title">Core Competencies</h2>
                <ul class="tag-list tag-list--skills">
${skillsItems}
                </ul>
            </section>

            <section id="publications" aria-labelledby="publications-heading" class="cv-section animate-fade-in delay-5">
                <h2 id="publications-heading" class="section-title">Publications &amp; Awards</h2>
                <div class="stack-list">
${pubHtml}

${awardHtml}
                </div>
            </section>

            <section id="education" aria-labelledby="education-heading" class="cv-section animate-fade-in delay-6">
                <h2 id="education-heading" class="section-title">Education</h2>
                <div class="stack-list stack-list--compact">
${eduHtml}
                </div>
            </section>`;
}

function replaceMarkedSection(content, startMarker, endMarker, innerBlock, fileName, indent = '') {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Could not find ${startMarker} / ${endMarker} markers in ${fileName}`);
  }
  const replacement = `${startMarker}\n${indent}${innerBlock}\n${indent}${endMarker}`;
  return content.slice(0, startIdx) + replacement + content.slice(endIdx + endMarker.length);
}

function replaceInlineMarkers(content, startMarker, endMarker, innerText, fileName) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Could not find ${startMarker} / ${endMarker} markers in ${fileName}`);
  }
  return (
    content.slice(0, startIdx) +
    `${startMarker}${innerText}${endMarker}` +
    content.slice(endIdx + endMarker.length)
  );
}

export function buildSiteWebmanifest(data, currentManifest = {}) {
  return (
    JSON.stringify(
      {
        ...currentManifest,
        name: data.basics.name,
        short_name: data.meta.shortName || currentManifest.short_name || data.basics.name,
        description: data.meta.manifestDescription || data.basics.label,
      },
      null,
      2
    ) + '\n'
  );
}

export function buildSitemapXml(data) {
  const base = String(data.basics.url || '').replace(/\/$/, '');
  const entries = [
    { loc: `${base}/`, changefreq: 'monthly', priority: '1.0' },
    { loc: `${base}/resume.pdf`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/resume.json`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/llms.txt`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${base}/contact.vcf`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${base}/quality/`, changefreq: 'weekly', priority: '0.6' },
    { loc: `${base}/quality/report.json`, changefreq: 'weekly', priority: '0.5' },
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

export function syncAllFromResume(rootDir = ROOT) {
  const resumePath = path.join(rootDir, 'resume.json');
  const indexPath = path.join(rootDir, 'index.html');
  const notFoundPath = path.join(rootDir, '404.html');
  const llmsPath = path.join(rootDir, 'llms.txt');
  const manifestPath = path.join(rootDir, 'site.webmanifest');
  const sitemapPath = path.join(rootDir, 'sitemap.xml');

  const data = JSON.parse(fs.readFileSync(resumePath, 'utf8'));
  const year = new Date().getUTCFullYear();
  const copyrightHtml = `<span>&copy; ${year} ${escapeHtml(data.basics.name)}</span>`;

  // 1. Sync index.html
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const prevIndexHtml = indexHtml;
  indexHtml = replaceMarkedSection(indexHtml, '<!-- META_START -->', '<!-- META_END -->', buildIndexMeta(data), 'index.html', '    ');

  const formattedJsonLd = JSON.stringify(buildJsonLd(data), null, 2)
    .replace(/<\//g, '<\\/')
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  indexHtml = replaceMarkedSection(
    indexHtml,
    '<!-- JSONLD_START -->',
    '<!-- JSONLD_END -->',
    `<script type="application/ld+json">\n${formattedJsonLd}\n    </script>`,
    'index.html',
    '    '
  );
  indexHtml = replaceMarkedSection(
    indexHtml,
    '<!-- CV_CONTENT_START -->',
    '<!-- CV_CONTENT_END -->',
    buildCvContentHtml(data),
    'index.html',
    ''
  );
  indexHtml = replaceInlineMarkers(
    indexHtml,
    '<!-- COPYRIGHT_START -->',
    '<!-- COPYRIGHT_END -->',
    copyrightHtml,
    'index.html'
  );
  if (indexHtml !== prevIndexHtml) {
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log('Updated index.html (meta, JSON-LD, CV DOM, copyright) from resume.json');
  } else {
    console.log('index.html is already in sync with resume.json');
  }

  // 2. Sync 404.html
  let notFoundHtml = fs.readFileSync(notFoundPath, 'utf8');
  const prevNotFoundHtml = notFoundHtml;
  notFoundHtml = replaceInlineMarkers(
    notFoundHtml,
    '<!-- SUBTITLE_START -->',
    '<!-- SUBTITLE_END -->',
    `<p class="entry-sub">${escapeHtml(data.basics.label)}</p>`,
    '404.html'
  );
  notFoundHtml = replaceInlineMarkers(
    notFoundHtml,
    '<!-- COPYRIGHT_START -->',
    '<!-- COPYRIGHT_END -->',
    copyrightHtml,
    '404.html'
  );
  if (notFoundHtml !== prevNotFoundHtml) {
    fs.writeFileSync(notFoundPath, notFoundHtml, 'utf8');
    console.log('Updated 404.html from resume.json');
  } else {
    console.log('404.html is already in sync with resume.json');
  }

  // 3. Sync llms.txt
  const nextLlms = buildLlmsTxt(data);
  const prevLlms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
  if (nextLlms !== prevLlms) {
    fs.writeFileSync(llmsPath, nextLlms, 'utf8');
    console.log('Updated llms.txt from resume.json');
  } else {
    console.log('llms.txt is already in sync with resume.json');
  }

  // 4. Sync site.webmanifest
  const prevManifestRaw = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '{}';
  const prevManifest = JSON.parse(prevManifestRaw);
  const nextManifestRaw = buildSiteWebmanifest(data, prevManifest);
  if (nextManifestRaw !== prevManifestRaw) {
    fs.writeFileSync(manifestPath, nextManifestRaw, 'utf8');
    console.log('Updated site.webmanifest from resume.json');
  } else {
    console.log('site.webmanifest is already in sync with resume.json');
  }

  // 5. Sync sitemap.xml
  const prevSitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
  const nextSitemap = buildSitemapXml(data);
  if (nextSitemap !== prevSitemap) {
    fs.writeFileSync(sitemapPath, nextSitemap, 'utf8');
    console.log('Updated sitemap.xml from resume.json');
  } else {
    console.log('sitemap.xml is already in sync with resume.json');
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  syncAllFromResume();
}
