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
  };
}
