import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const resumePath = path.join(ROOT, 'resume.json');
const indexPath = path.join(ROOT, 'index.html');
const llmsPath = path.join(ROOT, 'llms.txt');

const resume = JSON.parse(fs.readFileSync(resumePath, 'utf8'));

function buildJsonLd(data) {
  const uniqueSchools = [];
  const seenSchools = new Set();
  // Preserve chronological descending alumni order matching original JSON-LD (Unicamp, IBTA)
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

function buildLlmsTxt(data) {
  const workLines = data.work.flatMap((job) => [
    `- ${job.position} at ${job.name} (${job.displayDate}), ${job.location}`,
    ...(job.highlights || []).map((h) => `  - ${h}`),
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
    `> This is the personal portfolio of ${data.basics.name}, a ${data.meta.jobTitle} with 18+ years of experience.`,
    '',
    '## Summary',
    data.basics.summary,
    '',
    '## Experience',
    ...workLines,
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
    `- Quality Report: ${data.meta.qualityReportUrl}`,
    `- Security Policy: ${data.meta.securityTxtUrl}`,
    '',
    '## Contact',
    `- Email: ${data.basics.email}`,
    ...profileLines,
    `- Website: ${data.basics.url}`,
    '',
  ].join('\n');
}

function syncIndexJsonLd(data) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const startMarker = '<!-- JSONLD_START -->';
  const endMarker = '<!-- JSONLD_END -->';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Could not find JSONLD_START / JSONLD_END markers in index.html');
  }

  const jsonLd = buildJsonLd(data);
  const formattedJson = JSON.stringify(jsonLd, null, 2)
    .replace(/<\//g, '<\\/')
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  const replacement = `${startMarker}\n    <script type="application/ld+json">\n${formattedJson}\n    </script>\n    ${endMarker}`;
  const updatedHtml =
    html.slice(0, startIdx) + replacement + html.slice(endIdx + endMarker.length);

  if (updatedHtml !== html) {
    fs.writeFileSync(indexPath, updatedHtml, 'utf8');
    console.log('Updated JSON-LD in index.html from resume.json');
  } else {
    console.log('index.html JSON-LD is already in sync with resume.json');
  }
}

function syncLlmsTxt(data) {
  const nextLlms = buildLlmsTxt(data);
  const prevLlms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
  if (nextLlms !== prevLlms) {
    fs.writeFileSync(llmsPath, nextLlms, 'utf8');
    console.log('Updated llms.txt from resume.json');
  } else {
    console.log('llms.txt is already in sync with resume.json');
  }
}

syncIndexJsonLd(resume);
syncLlmsTxt(resume);
