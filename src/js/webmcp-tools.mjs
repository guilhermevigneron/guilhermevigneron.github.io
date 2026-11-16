import { matchResumeEvidence, parseLlmsEvidence } from './resume-search.mjs';

export const WEBMCP_TOOL_NAMES = [
  'search_resume',
  'get_resume_section',
  'get_quality_telemetry',
  'navigate_to_section',
  'set_theme',
  'open_command_menu',
];

export const RESUME_SECTIONS = [
  'basics',
  'work',
  'projects',
  'skills',
  'publications',
  'awards',
  'education',
  'languages',
  'endpoints',
];

export const THEME_MODES = ['light', 'dark', 'toggle'];

const MAX_QUERY_LEN = 200;
const MAX_MENU_QUERY_LEN = 100;
const MAX_SEARCH_OUTPUT_BYTES = 1500;
const strProp = (description, extra) => ({ type: 'string', description, ...extra });
const pick = (obj, k1, k2) =>
  obj ? { passed: Boolean(obj.passed), [k1]: obj[k1], [k2]: obj[k2] } : null;

function makeAbortError(message = 'Tool execution aborted') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function makeErrorResult(code, message, details = null) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw makeAbortError();
}

export function serializeSizeBytes(value) {
  const json = JSON.stringify(value);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length;
}

function normalizeEndpoints(siteConfig) {
  const ep = siteConfig.ep || [];
  const baseUrl = String(siteConfig.siteUrl || '').replace(/\/$/, '');
  const abs = (i, fallback) => `${baseUrl}${ep[i] || fallback}`;
  return {
    siteUrl: `${baseUrl}/`,
    email: siteConfig.email || '',
    profiles: (siteConfig.profiles || []).map(([network, display, url]) => ({
      network,
      display,
      url,
    })),
    resumePdf: abs(0, '/resume.pdf'),
    resumeJson: abs(1, '/resume.json'),
    contactVcf: abs(2, '/contact.vcf'),
    architecture: abs(4, '/architecture/'),
    qualityReport: abs(5, '/quality/'),
    qualityTelemetryJson: abs(6, '/quality/report.json'),
    llmsTxt: abs(7, '/llms.txt'),
    blog: abs(8, '/blog/'),
    rssFeed: abs(9, '/feed.xml'),
  };
}

function sliceResumeSection(resume, section, siteConfig) {
  if (section === 'endpoints') return normalizeEndpoints(siteConfig);
  if (section === 'basics') {
    return {
      name: '',
      label: '',
      email: '',
      url: '',
      location: null,
      summary: '',
      profiles: [],
      ...resume?.basics,
    };
  }
  if (section === 'projects') {
    return (resume?.projects || []).map((proj) => ({
      subtitle: '',
      description: '',
      url: '',
      highlights: [],
      keywords: [],
      ...proj,
    }));
  }
  if (section === 'skills') {
    return (resume?.skills || []).map((s) => s?.name).filter(Boolean);
  }
  return resume?.[section] || [];
}

function shapeTelemetrySummary(report) {
  const gates = Array.isArray(report?.gates)
    ? report.gates.map((g) => ({ id: g.id, status: g.status }))
    : [];
  return {
    overallStatus: report?.overallStatus || 'unknown',
    generatedAt: report?.generatedAt || null,
    gateCount: gates.length,
    failingGates: gates.filter((g) => g.status === 'fail').map((g) => g.id),
    gates,
    aiEvaluation: pick(report?.aiEvaluation, 'passAt1Rate', 'groundednessRate'),
    flakyTriage: pick(report?.flakyTriage, 'classificationAccuracy', 'falseFlakeSuppressions'),
    webmcpEvaluation: pick(report?.webmcpEvaluation, 'toolCount', 'contractPassCount'),
  };
}

export function createWebMcpTools({ siteConfig, env }) {
  const ep = siteConfig?.ep || [];
  const jsonPath = ep[1] || '/resume.json';
  const qJsonPath = ep[6] || '/quality/report.json';
  const llmsPath = ep[7] || '/llms.txt';
  const toggleEvent = siteConfig?.toggleEvent || 'theme-toggle-request';
  const secIds = (siteConfig?.sections || []).map(([id]) => id);
  const navSec = secIds.length
    ? secIds
    : ['about', 'experience', 'projects', 'skills', 'publications', 'education'];

  let cachedLlms = null;
  let cachedResume = null;

  async function fetchWithSignal(url, signal, asJson) {
    assertNotAborted(signal);
    if (typeof env.fetch !== 'function') throw new Error('Fetch unavailable');
    const response = await env.fetch(url, signal ? { signal } : undefined);
    assertNotAborted(signal);
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'} loading ${url}`);
    return asJson ? response.json() : response.text();
  }

  function handleError(signal, err, fallbackMessage, code = 'FETCH_FAILED') {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    return makeErrorResult(code, err?.message || fallbackMessage);
  }

  const specs = [
    [
      'search_resume',
      'Search Portfolio & Resume',
      'Search grounded resume highlights, skills, projects, and section citations.',
      true,
      {
        query: strProp('Keywords or question (2-200 chars).', {
          minLength: 2,
          maxLength: MAX_QUERY_LEN,
        }),
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Max matches to return (1-10).',
        },
      },
      ['query'],
      async (input, signal) => {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (query.length < 2 || query.length > MAX_QUERY_LEN) {
          return makeErrorResult('INVALID_INPUT', 'query must be 2-200 characters.');
        }
        const limit = input.limit === undefined ? 5 : input.limit;
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
          return makeErrorResult('INVALID_INPUT', 'limit must be an integer (1-10).');
        }

        let source = 'llms.txt';
        let evidence;
        try {
          if (!cachedLlms) cachedLlms = await fetchWithSignal(llmsPath, signal, false);
          evidence = parseLlmsEvidence(cachedLlms);
        } catch (err) {
          if (err?.name === 'AbortError' || signal?.aborted) throw err;
          source = 'site-config';
          const fallbackSec = secIds.includes('about') ? 'about' : 'main-content';
          evidence = [
            ...(siteConfig.sections || []).map(([id, title, ex]) => [
              title,
              'Portfolio Section',
              id,
              ex || '',
            ]),
            ...(siteConfig.profiles || []).map(([net, disp, url]) => [
              `${net}: ${disp}`,
              url,
              fallbackSec,
              net,
            ]),
            ...(siteConfig.email
              ? [[`Email: ${siteConfig.email}`, 'Contact', fallbackSec, 'contact email']]
              : []),
          ];
        }

        const prefix = `${env.getSectionElement?.('about') ? '' : '/'}#`;
        const matches = matchResumeEvidence(evidence, query, limit).map(({ item }) => {
          const text = String(item[0] || '').trim();
          return {
            title: text.length <= 220 ? text : `${text.slice(0, 219)}…`,
            citation: item[1],
            section: item[2],
            href: `${prefix}${item[2]}`,
          };
        });
        while (
          matches.length > 1 &&
          serializeSizeBytes({ ok: true, query, source, matches }) > MAX_SEARCH_OUTPUT_BYTES
        ) {
          matches.pop();
        }
        return { ok: true, query, source, count: matches.length, matches };
      },
    ],
    [
      'get_resume_section',
      'Get Resume Section Data',
      'Retrieve structured profile, work, projects, skills, publications, or endpoints.',
      true,
      {
        section: strProp('Portfolio or resume section key.', { enum: RESUME_SECTIONS }),
      },
      ['section'],
      async (input, signal) => {
        const section = typeof input.section === 'string' ? input.section.trim() : '';
        if (!RESUME_SECTIONS.includes(section)) {
          return makeErrorResult('INVALID_INPUT', 'Unsupported section.', {
            allowedSections: RESUME_SECTIONS,
          });
        }
        if (section === 'endpoints') {
          return { ok: true, section, data: sliceResumeSection(null, section, siteConfig) };
        }
        try {
          if (!cachedResume) cachedResume = await fetchWithSignal(jsonPath, signal, true);
          return { ok: true, section, data: sliceResumeSection(cachedResume, section, siteConfig) };
        } catch (err) {
          return handleError(signal, err, 'Unable to load resume.json');
        }
      },
    ],
    [
      'get_quality_telemetry',
      'Get CI Quality Telemetry',
      'Fetch build gate statuses, AI retrieval metrics, flaky triage, and WebMCP readiness.',
      true,
      {},
      null,
      async (_input, signal) => {
        try {
          const report = await fetchWithSignal(qJsonPath, signal, true);
          return { ok: true, ...shapeTelemetrySummary(report) };
        } catch (err) {
          return handleError(signal, err, 'Unable to load quality telemetry');
        }
      },
    ],
    [
      'navigate_to_section',
      'Navigate to Resume Section',
      'Scroll to a resume section on the home page, or return its anchor URL on subpages.',
      false,
      {
        section: strProp('Target HTML section id.', { enum: navSec }),
      },
      ['section'],
      async (input) => {
        const section = typeof input.section === 'string' ? input.section.trim() : '';
        if (!navSec.includes(section)) {
          return makeErrorResult('INVALID_INPUT', 'Unknown section.', {
            allowedSections: navSec,
          });
        }
        const target = env.getSectionElement?.(section);
        if (!target) {
          return {
            ok: true,
            navigated: false,
            requiresNavigation: true,
            section,
            url: `/#${section}`,
          };
        }
        env.scrollToSection?.(target, `#${section}`);
        await env.nextFrame?.();
        return { ok: true, navigated: true, section, href: `#${section}` };
      },
    ],
    [
      'set_theme',
      'Set Color Theme',
      'Switch portfolio appearance between light mode, dark mode, or toggle.',
      false,
      {
        theme: strProp('Theme mode: light, dark, or toggle.', { enum: THEME_MODES }),
      },
      ['theme'],
      async (input) => {
        const theme = typeof input.theme === 'string' ? input.theme.trim() : '';
        if (!THEME_MODES.includes(theme)) {
          return makeErrorResult('INVALID_INPUT', 'Invalid theme mode.', {
            allowedThemes: THEME_MODES,
          });
        }
        env.dispatchTheme?.(toggleEvent, theme);
        await env.nextFrame?.();
        return { ok: true, requested: theme, theme: env.getActiveTheme?.() || 'light' };
      },
    ],
    [
      'open_command_menu',
      'Open Command Palette',
      'Open the command palette dialog, optionally pre-filtered by a query.',
      false,
      {
        query: strProp('Optional initial query (<=100 chars).', {
          maxLength: MAX_MENU_QUERY_LEN,
        }),
      },
      null,
      async (input, signal) => {
        if (input.query !== undefined && typeof input.query !== 'string') {
          return makeErrorResult('INVALID_INPUT', 'query must be a string.');
        }
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (query.length > MAX_MENU_QUERY_LEN) {
          return makeErrorResult('INVALID_INPUT', 'query exceeds 100 chars.');
        }
        if (typeof env.openCommandMenu !== 'function') {
          return makeErrorResult('UNAVAILABLE', 'Command menu unavailable.');
        }
        try {
          const vis = await env.openCommandMenu(query);
          assertNotAborted(signal);
          await env.nextFrame?.();
          return {
            ok: true,
            open: Boolean(env.isCommandMenuOpen?.() ?? true),
            query,
            visibleItems: typeof vis === 'number' ? vis : null,
          };
        } catch (err) {
          return handleError(signal, err, 'Unable to open command menu.', 'OPEN_FAILED');
        }
      },
    ],
  ];

  return specs.map(([name, title, description, readOnly, properties, required, run]) => ({
    name,
    title,
    description,
    inputSchema: {
      type: 'object',
      properties,
      ...(required ? { required } : {}),
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: readOnly,
      consequentialHint: false,
      untrustedContentHint: false,
    },
    async execute(input, ctx) {
      const signal = ctx?.signal;
      assertNotAborted(signal);
      return run(input || {}, signal);
    },
  }));
}

export async function registerWebMcpTools(modelContext, tools, { lifecycleTarget } = {}) {
  if (typeof modelContext?.registerTool !== 'function') {
    throw new Error('document.modelContext.registerTool is unavailable');
  }
  const controller = new AbortController();
  const options = { signal: controller.signal };
  try {
    for (const tool of tools) {
      await modelContext.registerTool(tool, options);
    }
  } catch (err) {
    controller.abort();
    throw err;
  }

  const cleanup = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  lifecycleTarget?.addEventListener?.('pagehide', cleanup, { once: true });

  return {
    controller,
    cleanup,
    count: tools.length,
  };
}
