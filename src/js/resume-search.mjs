const SYN = {
  ado: 'azure devops',
  cicd: 'ci cd pipelines',
  dx: 'developer experience snapshots',
  devex: 'developer experience',
  llm: 'ai workflows',
  genai: 'ai llm',
  rag: 'ai llm',
  qa: 'quality test',
  qe: 'quality automation',
  sdet: 'selenium playwright dotnet',
  pom: 'page object model',
  flake: 'flaky stickyminds',
  flaky: 'reliability stickyminds',
  a11y: 'wcag axe',
  scrum: 'agile master',
  location: 'austin tx',
  located: 'austin tx',
  years: '18+ experience',
  degree: 'education bs',
};

const STOPS = new Set(
  'about and any are at be by can did do does for from guilherme has have he his how in is it me my of on or show tell that the this to use used using was what when where which who with work'.split(
    ' '
  )
);

export function tokenizeSearch(text, stripStops = false) {
  const raw = `${text || ''}`
    .toLowerCase()
    .replace(/c#|csharp|\.net\b/g, ' dotnet ')
    .replace(/ci\/cd/g, ' cicd ci cd ')
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 1);
  if (!stripStops) return raw;
  const out = raw.filter((t) => !STOPS.has(t));
  return out.length ? out : raw;
}

const hasTok = (q, pool) =>
  pool.some(
    (t) => t === q || (q.length > 2 && t.length > 2 && (t.startsWith(q) || q.startsWith(t)))
  );

export function scoreEvidenceItem(entry, qToks, rawQ = '') {
  if (!qToks.length) return 0;
  const [title, cite, , kw = ''] = entry.title
    ? [entry.title, entry.cite, entry.section, entry.keywords]
    : entry;
  const tPool = tokenizeSearch(title);
  const mPool = tokenizeSearch(`${cite} ${kw}`);
  let hits = 0;
  let score = 0;

  for (const q of qToks) {
    const inT = hasTok(q, tPool);
    const inM = hasTok(q, mPool);
    if (inT || inM) {
      hits += 1;
      score += (inT ? 4 : 0) + (inM ? 3 : 0);
    } else if (SYN[q]?.split(' ').some((s) => hasTok(s, tPool) || hasTok(s, mPool))) {
      hits += 1;
      score += 2;
    }
  }

  if (hits < (qToks.length < 3 ? qToks.length : Math.ceil(qToks.length * 0.6))) return 0;
  if (rawQ.length > 2 && `${title} ${cite} ${kw}`.toLowerCase().includes(rawQ)) score += 5;
  return score;
}

export function matchResumeEvidence(list, rawQuery, limit = 6) {
  const q = `${rawQuery || ''}`.trim().toLowerCase();
  if (q.length < 2 || !list?.length) return [];
  const qToks = [...new Set(tokenizeSearch(q, true))];
  return list
    .map((item, index) => ({ item, score: scoreEvidenceItem(item, qToks, q), index }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

export function parseLlmsEvidence(txt) {
  const items = [];
  let sec = '';
  let cite = '';
  let grp = [];

  for (const raw of `${txt || ''}`.split(/\r?\n/)) {
    const s = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    if (!s || s[0] === '>') continue;
    if (s.startsWith('## ')) {
      if (s[3] === 'M') break;
      const w = s.slice(3).split(' ').pop().toLowerCase();
      sec = w === 'summary' ? 'about' : w === 'awards' ? 'publications' : w;
      cite = sec === 'about' ? 'Summary · Austin, TX' : s.slice(3);
      grp = [];
    } else if (sec && s[0] !== '#') {
      const b = s.replace(/^-\s*/, '');
      if (
        raw.startsWith('- ') &&
        (sec === 'experience' || sec === 'projects' || cite === 'Awards')
      ) {
        cite =
          sec === 'projects' ? `Project · ${b.split(' — ')[0]}` : `AVEVA · ${b.split(' at ')[0]}`;
        grp = [];
      } else if (/^(Keywords|Technologies):/.test(b)) {
        for (const g of grp) g[3] += ` ${b}`;
      } else {
        const e = [b, cite, sec, sec === 'about' ? 'austin tx' : ''];
        grp.push(e);
        items.push(e);
      }
    }
  }
  return items;
}
