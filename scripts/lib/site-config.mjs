import path from 'node:path';
import { normalizeBaseUrl, readJson, toPathname } from './io.mjs';
import { SRC_DIR } from './paths.mjs';

export const THEME_TOKENS = readJson(path.join(SRC_DIR, 'theme-tokens.json'));

export const THEME_COLORS = {
  light: THEME_TOKENS.light,
  dark: THEME_TOKENS.dark,
};

export const CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

export const BANNED_EXTERNAL_REFERENCES = [
  'drive.google.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

export function formatProfileDisplay(url) {
  return String(url || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '');
}

export function deriveVCardFilename(name) {
  const slug = String(name || 'contact')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'contact'}.vcf`;
}

export function getSiteEndpoints(data) {
  const baseUrl = normalizeBaseUrl(data?.meta?.canonical || data?.basics?.url || '');
  const domain = baseUrl.replace(/^https?:\/\//, '');

  const resumePdfPath = toPathname(
    data?.meta?.resumePdf || data?.meta?.resumePdfUrl,
    '/resume.pdf'
  );
  const resumeJsonPath = toPathname(data?.meta?.resumeJsonUrl, '/resume.json');
  const contactVcfPath = toPathname(
    data?.meta?.contactVcf || data?.meta?.contactVcfUrl,
    '/contact.vcf'
  );
  const ogImagePath = toPathname(
    data?.meta?.ogImage || data?.meta?.ogImageUrl,
    '/assets/og-card.png'
  );
  const architecturePath = toPathname(data?.meta?.architectureUrl, '/architecture/');
  const qualityPath = toPathname(data?.meta?.qualityReportUrl, '/quality/');
  const qualityJsonPath = toPathname(data?.meta?.qualityReportJsonUrl, '/quality/report.json');
  const securityTxtPath = toPathname(data?.meta?.securityTxtUrl, '/.well-known/security.txt');
  const llmsTxtPath = '/llms.txt';
  const sitemapPath = '/sitemap.xml';
  const vcardFilename =
    data?.meta?.contactVcfDownloadName || deriveVCardFilename(data?.basics?.name);

  return {
    baseUrl,
    domain,
    resumePdfPath,
    resumeJsonPath,
    contactVcfPath,
    ogImagePath,
    architecturePath,
    qualityPath,
    qualityJsonPath,
    securityTxtPath,
    llmsTxtPath,
    sitemapPath,
    vcardFilename,
    resumePdfUrl: data?.meta?.resumePdfUrl || `${baseUrl}${resumePdfPath}`,
    resumeJsonUrl: data?.meta?.resumeJsonUrl || `${baseUrl}${resumeJsonPath}`,
    contactVcfUrl: data?.meta?.contactVcfUrl || `${baseUrl}${contactVcfPath}`,
    ogImageUrl: data?.meta?.ogImageUrl || `${baseUrl}${ogImagePath}`,
    architectureUrl: data?.meta?.architectureUrl || `${baseUrl}${architecturePath}`,
    qualityReportUrl: data?.meta?.qualityReportUrl || `${baseUrl}${qualityPath}`,
    qualityReportJsonUrl: data?.meta?.qualityReportJsonUrl || `${baseUrl}${qualityJsonPath}`,
    securityTxtUrl: data?.meta?.securityTxtUrl || `${baseUrl}${securityTxtPath}`,
    llmsTxtUrl: `${baseUrl}${llmsTxtPath}`,
    sitemapUrl: `${baseUrl}${sitemapPath}`,
  };
}

export function getRepoUrl(data) {
  const endpoints = getSiteEndpoints(data);
  const githubProject = (data?.projects || []).find((p) =>
    /^https:\/\/github\.com\//.test(p?.url || '')
  );
  if (githubProject?.url) return githubProject.url;
  const githubProfile = (data?.basics?.profiles || []).find(
    (p) => String(p?.network || '').toLowerCase() === 'github'
  );
  return githubProfile?.url || endpoints.baseUrl;
}

function shortenRole(position) {
  return String(position || '')
    .replace(/^Principal Software /, 'Principal ')
    .replace(/^Quality and Test /, 'QA ')
    .trim();
}

function compactExtraKeywords(title, cite, rawExtra) {
  const seen = new Set(
    `${title} ${cite}`
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter(Boolean)
  );
  const out = [];
  for (const tok of String(rawExtra || '')
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)) {
    if (tok.length >= 2 && !seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out.join(' ');
}

export function buildResumeEvidence(data) {
  const evidence = [];
  const loc = data?.basics?.location;
  const locStr = [loc?.city, loc?.region].filter(Boolean).join(', ');

  if (data?.basics?.summary) {
    evidence.push({
      title: `${data.basics.label || data.basics.name}${locStr ? ` (${locStr})` : ''}`,
      cite: locStr ? `Summary · ${locStr}` : 'Summary',
      section: 'about',
      keywords: compactExtraKeywords(
        data.basics.label || '',
        locStr,
        `${data.basics.summary} ${loc?.countryCode || ''} 18+ years`
      ),
    });
  }

  for (const job of data?.work || []) {
    const cite = [job.name, shortenRole(job.position)].filter(Boolean).join(' · ');
    const jobKw = compactExtraKeywords(
      '',
      cite,
      [job.position, job.displayDate, job.location, ...(job.keywords || [])]
        .filter(Boolean)
        .join(' ')
    );
    for (const highlight of job.highlights || []) {
      evidence.push({
        title: highlight,
        cite,
        section: 'experience',
        keywords: jobKw,
      });
    }
  }

  for (const proj of data?.projects || []) {
    const cite = `Project · ${proj.name}`;
    const title = `${proj.name}${proj.subtitle ? ` — ${proj.subtitle}` : ''}`;
    const projKw = compactExtraKeywords(
      title,
      cite,
      [proj.description, ...(proj.keywords || []), ...(proj.highlights || [])]
        .filter(Boolean)
        .join(' ')
    );
    evidence.push({
      title,
      cite,
      section: 'projects',
      keywords: projKw,
    });
  }

  const skillNames = (data?.skills || []).map((s) => s?.name).filter(Boolean);
  for (let i = 0; i < skillNames.length; i += 5) {
    const chunk = skillNames.slice(i, i + 5);
    evidence.push({
      title: `Skills: ${chunk.join(', ')}`,
      cite: 'Core Skills',
      section: 'skills',
      keywords: 'competency stack',
    });
  }

  for (const pub of data?.publications || []) {
    if (!pub?.name) continue;
    evidence.push({
      title: pub.name,
      cite: `Article · ${pub.publisher || 'Publication'}`,
      section: 'publications',
      keywords: 'publication article author',
    });
  }

  for (const award of data?.awards || []) {
    if (!award?.title) continue;
    evidence.push({
      title: `${award.title}${award.summary ? ` — ${award.summary}` : ''}`,
      cite: `Award · ${award.awarder || 'Honor'}`,
      section: 'publications',
      keywords: `award recognition hackathon ${award.date || ''}`.trim(),
    });
  }

  for (const edu of data?.education || []) {
    if (!edu?.institution) continue;
    evidence.push({
      title: `${edu.studyType} in ${edu.area} — ${edu.institution}`,
      cite: `Education · ${edu.startDate}–${edu.endDate}`,
      section: 'education',
      keywords: 'degree university college',
    });
  }

  if (data?.languages?.length) {
    evidence.push({
      title: `Languages: ${data.languages
        .map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language))
        .join(', ')}`,
      cite: 'Languages',
      section: 'languages',
      keywords: 'bilingual spoken',
    });
  }

  return evidence;
}

export function buildCommandMenuConfig(data) {
  const endpoints = getSiteEndpoints(data);
  const sections = [];
  if (data?.basics?.summary) {
    sections.push({ id: 'about', title: 'Summary', extras: 'jump about me' });
  }
  if (data?.work?.length) {
    sections.push({ id: 'experience', title: 'Professional Experience', extras: 'jump work' });
  }
  if (data?.projects?.length) {
    sections.push({ id: 'projects', title: 'Selected Projects', extras: 'jump open source' });
  }
  if (data?.skills?.length) {
    sections.push({ id: 'skills', title: 'Skills', extras: 'jump core competencies' });
  }
  if (data?.publications?.length || data?.awards?.length) {
    sections.push({ id: 'publications', title: 'Publications & Awards', extras: 'jump' });
  }
  if (data?.education?.length) {
    sections.push({ id: 'education', title: 'Education', extras: 'jump' });
  }
  if (data?.languages?.length) {
    sections.push({ id: 'languages', title: 'Languages', extras: 'jump' });
  }

  return {
    email: data?.basics?.email || '',
    host: endpoints.domain,
    siteUrl: endpoints.baseUrl,
    toggleEvent: THEME_TOKENS.toggleEvent,
    profiles: (data?.basics?.profiles || [])
      .filter((p) => p?.network && p?.url)
      .map((p) => ({
        network: p.network,
        url: p.url,
        display: formatProfileDisplay(p.url),
      })),
    endpoints: {
      resumePdf: endpoints.resumePdfPath,
      resumeJson: endpoints.resumeJsonPath,
      contactVcf: endpoints.contactVcfPath,
      contactVcfFilename: endpoints.vcardFilename,
      architecture: endpoints.architecturePath,
      quality: endpoints.qualityPath,
      qualityJson: endpoints.qualityJsonPath,
      llmsTxt: endpoints.llmsTxtPath,
    },
    sections,
    evidence: buildResumeEvidence(data),
  };
}
