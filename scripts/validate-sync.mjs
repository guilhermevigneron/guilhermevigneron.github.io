import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&middot;': '·',
  '&copy;': '©',
  '&nbsp;': ' ',
  '&mdash;': '—',
};

export function decodeHtmlEntities(text) {
  return String(text).replace(
    /&(amp|lt|gt|quot|#39|middot|copy|nbsp|mdash);/g,
    (entity) => HTML_ENTITIES[entity] || entity
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTagsAndEntities(html) {
  return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripNonContentBlocks(html) {
  const input = String(html);
  const lower = input.toLowerCase();
  const chunks = [];
  let cursor = 0;

  while (cursor < input.length) {
    const tagStart = input.indexOf('<', cursor);
    if (tagStart === -1) {
      chunks.push(input.slice(cursor));
      break;
    }

    chunks.push(input.slice(cursor, tagStart));

    if (lower.startsWith('<!--', tagStart)) {
      const commentEnd = input.indexOf('-->', tagStart + 4);
      cursor = commentEnd === -1 ? input.length : commentEnd + 3;
      continue;
    }

    let matchedTag = null;
    for (const tag of ['script', 'style']) {
      if (lower.startsWith(`<${tag}`, tagStart)) {
        const nextCh = lower[tagStart + 1 + tag.length];
        if (!nextCh || /[\s>/]/.test(nextCh)) {
          matchedTag = tag;
          break;
        }
      }
    }

    if (matchedTag) {
      const openEnd = input.indexOf('>', tagStart + 1 + matchedTag.length);
      if (openEnd === -1) {
        cursor = input.length;
        continue;
      }
      let searchPos = openEnd + 1;
      let nextCursor = input.length;
      while (searchPos < input.length) {
        const closeStart = lower.indexOf(`</${matchedTag}`, searchPos);
        if (closeStart === -1) {
          break;
        }
        const afterCloseName = lower[closeStart + 2 + matchedTag.length];
        const closeEnd = input.indexOf('>', closeStart + 2 + matchedTag.length);
        if (closeEnd === -1) {
          break;
        }
        if (!afterCloseName || /[\s>/]/.test(afterCloseName)) {
          nextCursor = closeEnd + 1;
          break;
        }
        searchPos = closeStart + 2 + matchedTag.length;
      }
      cursor = nextCursor;
      continue;
    }

    chunks.push('<');
    cursor = tagStart + 1;
  }

  return chunks.join('');
}

export function extractSectionById(html, id) {
  const re = new RegExp(
    `<section\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/section>`,
    'i'
  );
  const match = String(html).match(re);
  return match ? match[1] : null;
}

export function extractArticles(sectionHtml) {
  return [...String(sectionHtml).matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(
    (m) => m[1]
  );
}

export function extractMetaContent(headHtml, attrName, attrValue) {
  const escapedName = escapeRegExp(attrName);
  const escapedVal = escapeRegExp(attrValue);
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*\\b${escapedName}=["']${escapedVal}["'][^>]*\\bcontent=["']([^"']*)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${escapedName}=["']${escapedVal}["'][^>]*>`,
      'i'
    ),
  ];
  for (const pattern of patterns) {
    const match = String(headHtml).match(pattern);
    if (match) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
}

function computeYears(data, currentYear) {
  const startYears = (data.work || [])
    .map((job) => {
      const m = String(job.startDate || '').match(/^(\d{4})/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((y) => !Number.isNaN(y));
  if (startYears.length === 0) return null;
  return Math.max(1, currentYear - Math.min(...startYears));
}

function formatAwardDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return iso || '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function validateResumeSchema(resume) {
  assert.ok(resume && typeof resume === 'object', 'resume.json must be a JSON object');
  assert.ok(resume.basics?.name, 'basics.name missing');
  assert.ok(resume.basics?.label, 'basics.label missing');
  assert.match(
    String(resume.basics?.email || ''),
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    'basics.email invalid'
  );
  assert.match(
    String(resume.basics?.url || ''),
    /^https:\/\/[^\s]+$/,
    'basics.url must use https://'
  );
  assert.ok(resume.basics?.summary, 'basics.summary missing');
  assert.ok(
    resume.basics?.location?.city &&
      resume.basics?.location?.region &&
      resume.basics?.location?.countryCode,
    'basics.location fields incomplete'
  );
  assert.ok(
    Array.isArray(resume.basics?.profiles) && resume.basics.profiles.length >= 2,
    'basics.profiles missing'
  );
  for (const profile of resume.basics.profiles) {
    assert.ok(profile.network, 'profile.network missing');
    assert.match(
      String(profile.url || ''),
      /^https:\/\/[^\s]+$/,
      `Invalid profile URL for ${profile.network}`
    );
  }

  assert.ok(Array.isArray(resume.work) && resume.work.length >= 3, 'work entries missing');
  for (const job of resume.work) {
    assert.ok(job.name && job.position, 'work entry name or position missing');
    assert.match(
      String(job.startDate || ''),
      /^\d{4}-\d{2}$/,
      `Invalid work startDate for ${job.position}`
    );
    if (job.endDate) {
      assert.match(
        String(job.endDate),
        /^\d{4}-\d{2}$/,
        `Invalid work endDate for ${job.position}`
      );
      assert.ok(
        job.endDate >= job.startDate,
        `work endDate precedes startDate for ${job.position}`
      );
    }
    assert.ok(
      job.displayDate && job.location,
      `work displayDate/location missing for ${job.position}`
    );
    assert.ok(
      Array.isArray(job.highlights) && job.highlights.length > 0,
      `work highlights missing for ${job.position}`
    );
    assert.ok(
      Array.isArray(job.keywords) && job.keywords.length > 0,
      `work keywords missing for ${job.position}`
    );
  }

  assert.ok(
    Array.isArray(resume.projects) && resume.projects.length >= 1,
    'projects entries missing'
  );
  for (const project of resume.projects) {
    assert.ok(project.name && project.description && project.url, 'project fields incomplete');
    assert.match(String(project.url), /^https:\/\/[^\s]+$/, `Invalid project URL: ${project.url}`);
  }

  assert.ok(
    Array.isArray(resume.education) && resume.education.length >= 2,
    'education entries missing'
  );
  for (const edu of resume.education) {
    assert.ok(edu.institution && edu.studyType && edu.area, 'education fields incomplete');
    assert.match(
      String(edu.startDate || ''),
      /^\d{4}$/,
      `Invalid education startDate for ${edu.institution}`
    );
    assert.match(
      String(edu.endDate || ''),
      /^\d{4}$/,
      `Invalid education endDate for ${edu.institution}`
    );
    assert.ok(
      edu.endDate >= edu.startDate,
      `education endDate precedes startDate for ${edu.institution}`
    );
  }

  assert.ok(Array.isArray(resume.skills) && resume.skills.length >= 10, 'skills entries missing');
  for (const skill of resume.skills) {
    assert.ok(skill.name, 'skill.name missing');
  }

  if (resume.languages !== undefined) {
    assert.ok(Array.isArray(resume.languages), 'languages must be an array');
    for (const lang of resume.languages) {
      assert.ok(lang.language, 'language.language missing');
    }
  }

  assert.ok(
    Array.isArray(resume.publications) && resume.publications.length >= 2,
    'publications missing'
  );
  for (const pub of resume.publications) {
    assert.ok(pub.name && pub.publisher && pub.url, 'publication fields incomplete');
    assert.match(String(pub.url), /^https:\/\/[^\s]+$/, `Invalid publication URL: ${pub.url}`);
  }

  assert.ok(Array.isArray(resume.awards) && resume.awards.length >= 1, 'awards missing');
  for (const award of resume.awards) {
    assert.ok(award.title && award.awarder, 'award title or awarder missing');
    if (award.date) {
      assert.match(
        String(award.date),
        /^\d{4}-\d{2}(-\d{2})?$/,
        `Invalid award date for ${award.title}`
      );
    }
  }

  assert.equal(resume.meta?.resumePdf, '/resume.pdf');
  assert.equal(resume.meta?.contactVcf, '/contact.vcf');
  assert.equal(resume.meta?.ogImage, '/assets/og-card.png');
  assert.ok(
    Number.isInteger(resume.meta?.maxPdfPages) && resume.meta.maxPdfPages >= 1,
    'meta.maxPdfPages invalid'
  );
  for (const metaField of [
    'shortName',
    'pageTitle',
    'jobTitle',
    'metaDescription',
    'ogDescription',
    'shortDescription',
    'manifestDescription',
    'ogImageUrl',
    'resumePdfUrl',
    'resumeJsonUrl',
    'contactVcfUrl',
    'qualityReportUrl',
    'qualityReportJsonUrl',
    'securityTxtUrl',
  ]) {
    assert.ok(resume.meta?.[metaField], `meta.${metaField} missing`);
  }
}

export function validateSyncState({
  resume,
  indexHtml,
  notFoundHtml,
  llmsTxt,
  webmanifest,
  sitemapXml,
  robotsTxt = null,
  securityTxt = null,
  commandPanelJs = null,
  contactVcf = null,
  currentYear = new Date().getUTCFullYear(),
}) {
  const yearStr = String(currentYear);
  const baseUrl = String(resume.basics?.url || '').replace(/\/$/, '');
  const canonicalUrl = String(resume.meta?.canonical || baseUrl).replace(/\/$/, '');
  const headMatch = String(indexHtml).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const headSource = headMatch ? headMatch[1] : '';
  const bodyMatch = String(indexHtml).match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodySource = stripNonContentBlocks(bodyMatch ? bodyMatch[1] : String(indexHtml));
  const decodedIndex = decodeHtmlEntities(bodySource);
  const decoded404 = decodeHtmlEntities(notFoundHtml);
  const checks = [];

  function check(name, fn) {
    try {
      fn();
      checks.push({ name, passed: true });
    } catch (err) {
      checks.push({ name, passed: false, error: err.message });
      throw err;
    }
  }

  check('JSON Resume schema fields exist', () => {
    validateResumeSchema(resume);
  });

  check('index.html meta tags, canonical, and JSON-LD match resume.json', () => {
    const titleMatch = headSource.match(/<title>([\s\S]*?)<\/title>/i);
    assert.ok(titleMatch, '<title> missing from index.html');
    assert.equal(
      decodeHtmlEntities(titleMatch[1].trim()),
      resume.meta.pageTitle,
      '<title> mismatch'
    );
    const canonicalPageUrl = resume.meta?.canonical || `${canonicalUrl}/`;
    assert.ok(
      headSource.includes(`<link rel="canonical" href="${canonicalPageUrl}">`),
      'canonical link missing or mismatched in index.html'
    );
    assert.equal(
      extractMetaContent(headSource, 'name', 'description'),
      resume.meta.metaDescription,
      'meta description mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'property', 'og:title'),
      resume.meta.pageTitle,
      'og:title mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'property', 'og:description'),
      resume.meta.ogDescription,
      'og:description mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'property', 'og:url'),
      canonicalPageUrl,
      'og:url mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'property', 'og:image'),
      resume.meta.ogImageUrl,
      'og:image mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'name', 'twitter:title'),
      resume.meta.pageTitle,
      'twitter:title mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'name', 'twitter:description'),
      resume.meta.ogDescription,
      'twitter:description mismatch'
    );
    assert.equal(
      extractMetaContent(headSource, 'name', 'twitter:image'),
      resume.meta.ogImageUrl,
      'twitter:image mismatch'
    );

    const match = indexHtml.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/
    );
    assert.ok(match, 'JSON-LD script block missing from index.html');
    const jsonLd = JSON.parse(match[1]);
    assert.ok(Array.isArray(jsonLd['@graph']), 'JSON-LD missing @graph array');
    const website = jsonLd['@graph'].find((n) => n['@type'] === 'WebSite');
    const profilePage = jsonLd['@graph'].find((n) => n['@type'] === 'ProfilePage');
    const person = jsonLd['@graph'].find((n) => n['@type'] === 'Person');
    assert.ok(website, 'JSON-LD @graph missing WebSite');
    assert.ok(profilePage, 'JSON-LD @graph missing ProfilePage');
    assert.ok(person, 'JSON-LD @graph missing Person');
    assert.equal(profilePage.mainEntity?.['@id'], person['@id']);
    assert.equal(person.name, resume.basics.name);
    assert.equal(person.jobTitle, resume.meta.jobTitle);
    assert.equal(person.url, `${resume.basics.url.replace(/\/$/, '')}/`);
    assert.equal(person.email, resume.basics.email);
    assert.deepEqual(
      person.sameAs,
      resume.basics.profiles.map((p) => p.url)
    );
    const activeJob = resume.work.find((j) => !j.endDate);
    if (activeJob) {
      assert.equal(person.worksFor?.name, activeJob.name);
    } else {
      assert.equal(person.worksFor, undefined);
    }
    const expectedKnowsAbout = Array.from(
      new Set([
        ...resume.skills.map((s) => s.name),
        ...(resume.projects || []).flatMap((p) => p.keywords || []),
      ])
    );
    assert.deepEqual(person.knowsAbout, expectedKnowsAbout);
    if (resume.languages?.length) {
      assert.deepEqual(
        person.knowsLanguage,
        resume.languages.map((l) => l.language)
      );
    }
    assert.equal(person.address?.addressLocality, resume.basics.location.city);
    assert.equal(person.address?.addressRegion, resume.basics.location.region);
    assert.equal(person.address?.addressCountry, resume.basics.location.countryCode);
    assert.equal(person.description, resume.meta.shortDescription);
    for (const edu of resume.education) {
      assert.ok(
        person.alumniOf.some((a) => a.name === edu.institution),
        `Missing alumniOf: ${edu.institution}`
      );
    }
    for (const award of resume.awards || []) {
      assert.ok(person.award?.includes(award.title), `Missing award in JSON-LD: ${award.title}`);
    }
    const articles = jsonLd['@graph'].filter((n) => n['@type'] === 'Article');
    for (const pub of resume.publications || []) {
      assert.ok(
        articles.some((a) => a.url === pub.url && a.headline === pub.name),
        `Missing Article node in JSON-LD: ${pub.name}`
      );
    }
    const canonical = resume.meta.canonical || `${resume.basics.url.replace(/\/$/, '')}/`;
    assert.ok(
      indexHtml.includes(`<link rel="canonical" href="${canonical}">`),
      'canonical link missing or mismatched in index.html'
    );
    assert.ok(
      indexHtml.includes(`content="${resume.meta.ogImageUrl}"`),
      'og:image missing or mismatched'
    );
  });

  check('index.html DOM sections match resume.json with valid anchors and zero CDNs', () => {
    for (const banned of [
      'drive.google.com',
      'cdn.tailwindcss.com',
      'cdnjs.cloudflare.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ]) {
      assert.ok(!indexHtml.includes(banned), `External third-party reference found: ${banned}`);
    }

    const headerMatch = decodedIndex.match(
      /<header\b[^>]*class=["'][^"']*cv-header[^"']*["'][^>]*>([\s\S]*?)<\/header>/i
    );
    assert.ok(headerMatch, 'Missing .cv-header in index.html');
    const headerHtml = headerMatch[1];
    assert.ok(headerHtml.includes(resume.basics.name), 'Header missing name');
    assert.ok(headerHtml.includes(resume.basics.label), 'Header missing label');
    assert.ok(
      headerHtml.includes(`${resume.basics.location.city}, ${resume.basics.location.region}`),
      'Header missing location'
    );
    const actionsMatch = headerHtml.match(
      /<div\b[^>]*class=["'][^"']*header-actions[^"']*["'][^>]*>([\s\S]*)$/i
    );
    assert.ok(actionsMatch, 'Header missing .header-actions');
    assert.ok(
      actionsMatch[1].includes(`href="mailto:${resume.basics.email}"`),
      'Header actions missing mailto link'
    );
    assert.ok(actionsMatch[1].includes('href="/resume.pdf"'), 'Header actions missing /resume.pdf');
    for (const profile of resume.basics.profiles) {
      assert.ok(
        actionsMatch[1].includes(`href="${profile.url}"`),
        `Header actions missing ${profile.url}`
      );
    }
    const printContactMatch = headerHtml.match(
      /<div\b[^>]*class=["'][^"']*print-contact[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    assert.ok(printContactMatch, 'Header missing .print-contact');
    assert.ok(printContactMatch[1].includes(resume.basics.email), 'Print contact missing email');

    const aboutHtml = extractSectionById(decodedIndex, 'about');
    assert.ok(aboutHtml?.includes(resume.basics.summary), '#about missing summary');

    const expHtml = extractSectionById(decodedIndex, 'experience');
    assert.ok(expHtml, 'Missing #experience section');
    const expArticles = extractArticles(expHtml);
    assert.equal(expArticles.length, resume.work.length, '#experience article count mismatch');
    resume.work.forEach((job, idx) => {
      const art = expArticles[idx];
      assert.ok(art.includes(job.name), `#experience[${idx}] missing company: ${job.name}`);
      assert.ok(
        art.includes(job.position),
        `#experience[${idx}] missing position: ${job.position}`
      );
      assert.ok(
        art.includes(job.displayDate),
        `#experience[${idx}] missing displayDate: ${job.displayDate}`
      );
      assert.ok(
        art.includes(job.location),
        `#experience[${idx}] missing location: ${job.location}`
      );
      for (const highlight of job.highlights) {
        assert.ok(art.includes(highlight), `#experience[${idx}] missing highlight`);
      }
      for (const kw of job.keywords) {
        assert.ok(art.includes(kw), `#experience[${idx}] missing keyword: ${kw}`);
      }
    });

    const projectsHtml = extractSectionById(decodedIndex, 'projects');
    assert.ok(projectsHtml, 'Missing #projects section');
    const projArticles = extractArticles(projectsHtml);
    assert.equal(projArticles.length, resume.projects.length, '#projects article count mismatch');
    resume.projects.forEach((project, idx) => {
      const art = projArticles[idx];
      assert.ok(art.includes(project.name), `#projects[${idx}] missing name`);
      assert.ok(art.includes(project.subtitle), `#projects[${idx}] missing subtitle`);
      assert.ok(art.includes(project.description), `#projects[${idx}] missing description`);
      assert.ok(art.includes(project.url), `#projects[${idx}] missing url`);
      for (const extra of project.links || []) {
        assert.ok(art.includes(extra.url), `#projects[${idx}] missing extra link ${extra.url}`);
      }
      for (const h of project.highlights || []) {
        assert.ok(art.includes(h), `#projects[${idx}] missing highlight`);
      }
      for (const kw of project.keywords || []) {
        assert.ok(art.includes(kw), `#projects[${idx}] missing keyword: ${kw}`);
      }
    });

    const skillsHtml = extractSectionById(decodedIndex, 'skills');
    assert.ok(skillsHtml, 'Missing #skills section');
    for (const skill of resume.skills) {
      assert.ok(skillsHtml.includes(skill.name), `#skills missing skill: ${skill.name}`);
    }

    const pubHtml = extractSectionById(decodedIndex, 'publications');
    assert.ok(pubHtml, 'Missing #publications section');
    for (const pub of resume.publications) {
      assert.ok(pubHtml.includes(pub.name), `#publications missing pub: ${pub.name}`);
      assert.ok(
        pubHtml.includes(pub.publisher),
        `#publications missing publisher: ${pub.publisher}`
      );
      assert.ok(pubHtml.includes(pub.url), `#publications missing url: ${pub.url}`);
    }
    for (const award of resume.awards) {
      assert.ok(pubHtml.includes(award.title), `#publications missing award: ${award.title}`);
      assert.ok(pubHtml.includes(award.awarder), `#publications missing awarder: ${award.awarder}`);
      if (award.summary) {
        assert.ok(pubHtml.includes(award.summary), '#publications missing award summary');
      }
      if (award.date) {
        assert.ok(
          pubHtml.includes(formatAwardDate(award.date)),
          '#publications missing formatted award date'
        );
      }
    }

    const eduHtml = extractSectionById(decodedIndex, 'education');
    assert.ok(eduHtml, 'Missing #education section');
    const eduArticles = extractArticles(eduHtml);
    assert.equal(eduArticles.length, resume.education.length, '#education article count mismatch');
    resume.education.forEach((edu, idx) => {
      const art = eduArticles[idx];
      assert.ok(art.includes(edu.institution), `#education[${idx}] missing institution`);
      assert.ok(art.includes(edu.studyType), `#education[${idx}] missing studyType`);
      assert.ok(art.includes(edu.area), `#education[${idx}] missing area`);
      assert.ok(
        art.includes(`${edu.startDate} - ${edu.endDate}`),
        `#education[${idx}] missing dates`
      );
    });

    if (resume.languages?.length) {
      const langHtml = extractSectionById(decodedIndex, 'languages');
      assert.ok(langHtml, 'Missing #languages section');
      for (const lang of resume.languages) {
        assert.ok(langHtml.includes(lang.language), `#languages missing ${lang.language}`);
        if (lang.fluency) {
          assert.ok(langHtml.includes(lang.fluency), `#languages missing fluency ${lang.fluency}`);
        }
      }
    }

    const footerMatch = decodedIndex.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i);
    assert.ok(footerMatch, 'Missing <footer> in index.html');
    const footerText = stripTagsAndEntities(footerMatch[1]);
    assert.ok(
      footerText.includes(`${yearStr} ${resume.basics.name}`),
      `Footer missing current copyright year ${yearStr} and owner name`
    );
    assert.ok(footerMatch[1].includes('href="/quality/"'), 'Footer missing /quality/ link');
    assert.ok(
      footerMatch[1].includes('href="/architecture/"'),
      'Footer missing /architecture/ link'
    );

    // Internal anchor parity across static HTML and command-menu-panel.js
    const domIds = new Set([...indexHtml.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]));
    for (const anchorMatch of indexHtml.matchAll(/href=["']#([^"']+)["']/gi)) {
      assert.ok(
        domIds.has(anchorMatch[1]),
        `Broken internal anchor #${anchorMatch[1]} in index.html`
      );
    }
    if (commandPanelJs) {
      const groupsMatch = commandPanelJs.match(
        /function getGroups\s*\([^)]*\)\s*\{([\s\S]*?)\n {2}\}/
      );
      assert.ok(groupsMatch, 'Could not locate getGroups() in command-menu-panel.js');
      for (const hashMatch of groupsMatch[1].matchAll(/['"]\/?#([a-zA-Z0-9_-]+)['"]/g)) {
        if (hashMatch[1] === 'languages' && !resume.languages?.length) {
          continue;
        }
        assert.ok(
          domIds.has(hashMatch[1]),
          `Broken command-menu anchor #${hashMatch[1]} missing from index.html`
        );
      }
    }
  });

  check('llms.txt matches resume.json and links self-hosted endpoints', () => {
    const years = computeYears(resume, currentYear);
    assert.ok(llmsTxt.includes(resume.basics.name), 'llms.txt missing basics.name');
    assert.ok(llmsTxt.includes(resume.meta.jobTitle), 'llms.txt missing meta.jobTitle');
    if (years) {
      assert.ok(llmsTxt.includes(`${years}+ years`), 'llms.txt missing years of experience');
    }
    assert.ok(llmsTxt.includes(resume.basics.summary), 'llms.txt missing basics.summary');
    assert.ok(llmsTxt.includes(resume.basics.email), 'llms.txt missing basics.email');
    assert.ok(llmsTxt.includes(resume.basics.url), 'llms.txt missing basics.url');
    assert.ok(llmsTxt.includes(resume.meta.resumePdfUrl), 'llms.txt missing resumePdfUrl');
    assert.ok(llmsTxt.includes(resume.meta.resumeJsonUrl), 'llms.txt missing resumeJsonUrl');
    assert.ok(llmsTxt.includes(resume.meta.contactVcfUrl), 'llms.txt missing contactVcfUrl');
    assert.ok(llmsTxt.includes(`${baseUrl}/architecture/`), 'llms.txt missing /architecture/');
    assert.ok(llmsTxt.includes(resume.meta.qualityReportUrl), 'llms.txt missing qualityReportUrl');
    assert.ok(
      llmsTxt.includes(resume.meta.qualityReportJsonUrl),
      'llms.txt missing qualityReportJsonUrl'
    );
    assert.ok(llmsTxt.includes(resume.meta.securityTxtUrl), 'llms.txt missing securityTxtUrl');
    assert.ok(!llmsTxt.includes('drive.google.com'), 'External Google Drive link in llms.txt');

    for (const profile of resume.basics.profiles) {
      assert.ok(llmsTxt.includes(profile.url), `llms.txt missing profile ${profile.url}`);
    }
    for (const job of resume.work) {
      assert.ok(llmsTxt.includes(job.position), `llms.txt missing position ${job.position}`);
      assert.ok(llmsTxt.includes(job.name), `llms.txt missing company ${job.name}`);
      assert.ok(
        llmsTxt.includes(job.displayDate),
        `llms.txt missing displayDate ${job.displayDate}`
      );
      assert.ok(llmsTxt.includes(job.location), `llms.txt missing location ${job.location}`);
      for (const h of job.highlights) {
        assert.ok(llmsTxt.includes(h), `llms.txt missing highlight: ${h}`);
      }
    }
    for (const project of resume.projects) {
      assert.ok(llmsTxt.includes(project.name), 'llms.txt missing project.name');
      assert.ok(llmsTxt.includes(project.subtitle), 'llms.txt missing project.subtitle');
      assert.ok(llmsTxt.includes(project.description), 'llms.txt missing project.description');
      assert.ok(llmsTxt.includes(project.url), 'llms.txt missing project.url');
      for (const h of project.highlights || []) {
        assert.ok(llmsTxt.includes(h), 'llms.txt missing project highlight');
      }
    }
    for (const skill of resume.skills) {
      assert.ok(llmsTxt.includes(skill.name), `llms.txt missing skill ${skill.name}`);
    }
    for (const pub of resume.publications) {
      assert.ok(llmsTxt.includes(pub.name), `llms.txt missing publication ${pub.name}`);
      assert.ok(llmsTxt.includes(pub.publisher), `llms.txt missing publisher ${pub.publisher}`);
      assert.ok(llmsTxt.includes(pub.url), `llms.txt missing pub url ${pub.url}`);
    }
    for (const edu of resume.education) {
      assert.ok(
        llmsTxt.includes(edu.institution),
        `llms.txt missing institution ${edu.institution}`
      );
      assert.ok(llmsTxt.includes(edu.studyType), `llms.txt missing studyType ${edu.studyType}`);
      assert.ok(llmsTxt.includes(edu.area), `llms.txt missing area ${edu.area}`);
      assert.ok(llmsTxt.includes(`${edu.startDate}-${edu.endDate}`), 'llms.txt missing edu dates');
    }
    for (const award of resume.awards) {
      assert.ok(llmsTxt.includes(award.title), `llms.txt missing award ${award.title}`);
      assert.ok(llmsTxt.includes(award.awarder), `llms.txt missing awarder ${award.awarder}`);
      if (award.date) assert.ok(llmsTxt.includes(award.date), 'llms.txt missing award.date');
      if (award.summary)
        assert.ok(llmsTxt.includes(award.summary), 'llms.txt missing award.summary');
    }
    for (const lang of resume.languages || []) {
      assert.ok(llmsTxt.includes(lang.language), `llms.txt missing language ${lang.language}`);
    }
  });

  check(
    'site.webmanifest, sitemap.xml, robots.txt, security.txt, command-menu-panel.js, and 404.html align with resume.json',
    () => {
      assert.equal(webmanifest.name, resume.basics.name);
      assert.equal(webmanifest.short_name, resume.meta.shortName);
      assert.equal(webmanifest.description, resume.meta.manifestDescription);
      assert.ok(
        Array.isArray(webmanifest.icons) && webmanifest.icons.length >= 3,
        'manifest icons missing'
      );

      const expectedUrls = [
        `${baseUrl}/`,
        resume.meta.resumePdfUrl,
        `${baseUrl}/architecture/`,
        resume.meta.qualityReportUrl,
      ];
      assert.ok(sitemapXml.includes('<urlset '), 'sitemap.xml missing <urlset>');
      const actualLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.equal(
        new Set(actualLocs).size,
        actualLocs.length,
        'sitemap.xml contains duplicate <loc>'
      );
      for (const url of expectedUrls) {
        assert.ok(actualLocs.includes(url), `sitemap.xml missing ${url}`);
      }
      for (const nonDocUrl of [
        resume.meta.resumeJsonUrl,
        `${baseUrl}/llms.txt`,
        resume.meta.contactVcfUrl,
        resume.meta.qualityReportJsonUrl,
      ]) {
        assert.ok(
          !actualLocs.includes(nonDocUrl),
          `sitemap.xml should not include non-document endpoint ${nonDocUrl}`
        );
      }

      if (robotsTxt !== null) {
        assert.ok(robotsTxt.includes('User-agent: *'), 'robots.txt missing User-agent');
        assert.ok(robotsTxt.includes('Allow: /'), 'robots.txt missing Allow directive');
        assert.ok(
          robotsTxt.includes(`Sitemap: ${baseUrl}/sitemap.xml`),
          'robots.txt Sitemap URL out of sync'
        );
      }

      if (commandPanelJs !== null) {
        const host = baseUrl.replace(/^https?:\/\//, '');
        const github = resume.basics.profiles.find((p) => p.network.toLowerCase() === 'github');
        const linkedin = resume.basics.profiles.find((p) => p.network.toLowerCase() === 'linkedin');
        assert.ok(
          commandPanelJs.includes(`email: '${resume.basics.email}'`),
          'command-menu-panel.js email out of sync'
        );
        assert.ok(
          commandPanelJs.includes(`siteUrl: '${baseUrl}'`),
          'command-menu-panel.js siteUrl out of sync'
        );
        assert.ok(
          commandPanelJs.includes(`host: '${host}'`),
          'command-menu-panel.js host out of sync'
        );
        assert.ok(
          commandPanelJs.includes(`githubUrl: '${github?.url || ''}'`),
          'command-menu-panel.js githubUrl out of sync'
        );
        assert.ok(
          commandPanelJs.includes(`linkedinUrl: '${linkedin?.url || ''}'`),
          'command-menu-panel.js linkedinUrl out of sync'
        );
        assert.ok(
          commandPanelJs.includes(`hasLanguages: ${Boolean(resume.languages?.length)}`),
          'command-menu-panel.js hasLanguages out of sync'
        );
      }

      assert.ok(decoded404.includes(resume.basics.name), '404.html owner name out of sync');
      assert.ok(decoded404.includes(resume.basics.label), '404.html subtitle out of sync');
      assert.ok(
        decoded404.includes(`${yearStr} ${resume.basics.name}`),
        '404.html copyright out of sync'
      );
      assert.ok(decoded404.includes('/assets/js/theme-init.js'), '404.html missing theme-init.js');
      assert.ok(decoded404.includes('/assets/js/theme.js'), '404.html missing theme.js');
      assert.ok(
        decoded404.includes('/assets/js/command-menu.js'),
        '404.html missing command-menu.js'
      );
      assert.ok(decoded404.includes('/assets/css/styles.css'), '404.html missing styles.css');
      assert.ok(decoded404.includes('/assets/css/subpage.css'), '404.html missing subpage.css');
      assert.ok(decoded404.includes('href="/"'), '404.html missing / link');
      assert.ok(decoded404.includes('href="/resume.pdf"'), '404.html missing /resume.pdf link');
      assert.ok(decoded404.includes('href="/quality/"'), '404.html missing /quality/ link');
    }
  );

  if (contactVcf !== null || securityTxt !== null) {
    check('contact.vcf and security.txt conform to resume.json and RFC 9116', () => {
      if (contactVcf !== null) {
        assert.ok(contactVcf.includes('\r\n'), 'contact.vcf must use CRLF line endings');
        assert.ok(
          contactVcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'),
          'contact.vcf header invalid'
        );
        assert.ok(contactVcf.includes(`FN:${resume.basics.name}\r\n`), 'contact.vcf FN mismatch');
        assert.ok(
          contactVcf.includes(`EMAIL;TYPE=INTERNET:${resume.basics.email}\r\n`),
          'contact.vcf EMAIL mismatch'
        );
        assert.ok(contactVcf.includes(`URL:${resume.basics.url}\r\n`), 'contact.vcf URL mismatch');
        assert.ok(contactVcf.trimEnd().endsWith('END:VCARD'), 'contact.vcf missing END:VCARD');
      }
      if (securityTxt !== null) {
        assert.match(
          securityTxt,
          new RegExp(`^Contact:\\s*mailto:${escapeRegExp(resume.basics.email)}$`, 'm'),
          'security.txt Contact out of sync'
        );
        assert.match(
          securityTxt,
          new RegExp(`^Canonical:\\s*${escapeRegExp(resume.meta.securityTxtUrl)}$`, 'm'),
          'security.txt Canonical out of sync'
        );
        assert.match(
          securityTxt,
          /^Preferred-Languages:\s*en,\s*pt$/m,
          'security.txt Preferred-Languages invalid'
        );
        const expMatch = securityTxt.match(/^Expires:\s*(.+)$/m);
        assert.ok(expMatch, 'security.txt missing Expires');
        const expiresMs = Date.parse(expMatch[1].trim());
        assert.ok(!Number.isNaN(expiresMs), 'security.txt Expires invalid ISO timestamp');
        const daysRemaining = (expiresMs - Date.now()) / (1000 * 60 * 60 * 24);
        assert.ok(
          daysRemaining >= 30,
          `security.txt Expires < 30 days (${daysRemaining.toFixed(1)}d)`
        );
      }
    });
  }

  return checks;
}

export function validateAllFromRoot(rootDir = ROOT) {
  const resume = JSON.parse(fs.readFileSync(path.join(rootDir, 'resume.json'), 'utf8'));
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const notFoundHtml = fs.readFileSync(path.join(rootDir, '404.html'), 'utf8');
  const llmsTxt = fs.readFileSync(path.join(rootDir, 'llms.txt'), 'utf8');
  const webmanifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'site.webmanifest'), 'utf8'));
  const sitemapXml = fs.readFileSync(path.join(rootDir, 'sitemap.xml'), 'utf8');
  const robotsPath = path.join(rootDir, 'robots.txt');
  const robotsTxt = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : null;
  const secPath = path.join(rootDir, '.well-known', 'security.txt');
  const securityTxt = fs.existsSync(secPath) ? fs.readFileSync(secPath, 'utf8') : null;
  const commandPanelPath = path.join(rootDir, 'assets', 'js', 'command-menu-panel.js');
  const commandPanelJs = fs.existsSync(commandPanelPath)
    ? fs.readFileSync(commandPanelPath, 'utf8')
    : null;
  const vcfPath = path.join(rootDir, '_site', 'contact.vcf');
  const contactVcf = fs.existsSync(vcfPath) ? fs.readFileSync(vcfPath, 'utf8') : null;

  const checks = [];
  try {
    const passedChecks = validateSyncState({
      resume,
      indexHtml,
      notFoundHtml,
      llmsTxt,
      webmanifest,
      sitemapXml,
      robotsTxt,
      securityTxt,
      commandPanelJs,
      contactVcf,
    });
    checks.push(...passedChecks);
  } catch (err) {
    checks.push({ name: 'validateSyncState', passed: false, error: err.message });
    throw err;
  } finally {
    fs.mkdirSync(path.join(rootDir, '.ci-reports'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, '.ci-reports', 'sync-validation.json'),
      JSON.stringify(
        {
          passed: checks.length > 0 && checks.every((c) => c.passed),
          timestamp: new Date().toISOString(),
          checks,
        },
        null,
        2
      )
    );
  }

  return checks;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isEntrypoint) {
  const checks = validateAllFromRoot(ROOT);
  console.log(`Sync validation passed (${checks.length}/${checks.length} checks).`);
}
