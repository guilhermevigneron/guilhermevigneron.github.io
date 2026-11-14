import {
  matchResumeEvidence,
  parseLlmsEvidence,
  tokenizeSearch,
} from '../../src/js/resume-search.mjs';
import { buildResumeEvidence } from './site-config.mjs';

export const MAX_LLMS_TOKEN_BUDGET = 1500;

export const GOLDEN_RECRUITER_QUERIES = [
  {
    id: 'dx-snapshots',
    category: 'Developer Experience',
    query: 'Developer Experience DX Snapshots',
    expectedSection: 'experience',
    expectedToken: 'snapshots',
  },
  {
    id: 'azure-devops-cicd',
    category: 'DevOps & CI/CD',
    query: 'Azure DevOps CI/CD release pipelines',
    expectedSection: 'experience',
    expectedToken: 'azure',
  },
  {
    id: 'selenium-csharp',
    category: 'Test Automation',
    query: 'Selenium C# Page Object Model automation',
    expectedSection: 'experience',
    expectedToken: 'selenium',
  },
  {
    id: 'ai-llm-workflows',
    category: 'AI Engineering',
    query: 'AI and LLM engineering workflows',
    expectedSection: 'experience',
    expectedToken: 'workflows',
  },
  {
    id: 'flaky-tests-publication',
    category: 'Thought Leadership',
    query: 'StickyMinds article on flaky tests reliability',
    expectedSection: 'publications',
    expectedToken: 'stickyminds',
  },
  {
    id: 'test-strategy-publication',
    category: 'Test Strategy',
    query: 'Software Testing Magazine test automation strategy',
    expectedSection: 'publications',
    expectedToken: 'strategy',
  },
  {
    id: 'portfolio-wcag-csp',
    category: 'Web Quality & Security',
    query: 'Playwright Cypress WCAG accessibility CSP',
    expectedSection: 'projects',
    expectedToken: 'wcag',
  },
  {
    id: 'performance-scalability',
    category: 'Performance Engineering',
    query: 'performance testing scalability reliability',
    expectedSection: 'experience',
    expectedToken: 'performance',
  },
  {
    id: 'scrum-leadership',
    category: 'Agile Delivery',
    query: 'Scrum Master cross-functional sprint delivery',
    expectedSection: 'experience',
    expectedToken: 'scrum',
  },
  {
    id: 'risk-based-testing',
    category: 'Quality Governance',
    query: 'risk-based testing business impact',
    expectedSection: 'experience',
    expectedToken: 'risk',
  },
  {
    id: 'hackathon-award',
    category: 'Innovation & Awards',
    query: 'AVEVA Innovation award CanAms Hackathon',
    expectedSection: 'publications',
    expectedToken: 'hackathon',
  },
  {
    id: 'seniority-location',
    category: 'Profile & Location',
    query: 'Where is Guilherme located and how many years of experience',
    expectedSection: 'about',
    expectedToken: '18+',
  },
];

const VALID_SECTIONS = new Set([
  'about',
  'experience',
  'projects',
  'skills',
  'publications',
  'education',
  'languages',
]);

export function evaluateAiReadiness({ resume, llmsTxt, queries = GOLDEN_RECRUITER_QUERIES } = {}) {
  const llmsText = String(llmsTxt || '');
  const llmsBytes = Buffer.byteLength(llmsText, 'utf8');
  const estimatedTokens = Math.ceil(llmsBytes / 4);
  const withinTokenBudget = llmsBytes > 0 && estimatedTokens <= MAX_LLMS_TOKEN_BUDGET;

  const llmsEvidence = parseLlmsEvidence(llmsText);
  const resumeEvidence = resume ? buildResumeEvidence(resume) : [];
  const canonicalTokens = new Set(tokenizeSearch(JSON.stringify(resume || {})));

  let groundedCount = 0;
  for (const [title, cite, section] of llmsEvidence) {
    const titleTokens = tokenizeSearch(title);
    const matchedTokens = titleTokens.filter((t) => canonicalTokens.has(t));
    const tokenCoverage = titleTokens.length ? matchedTokens.length / titleTokens.length : 0;
    if (VALID_SECTIONS.has(section) && cite && tokenCoverage >= 0.8) {
      groundedCount += 1;
    }
  }

  const groundednessRate = llmsEvidence.length
    ? Number((groundedCount / llmsEvidence.length).toFixed(4))
    : 0;

  let passAt1Count = 0;
  let hitAt3Count = 0;

  const results = queries.map((q) => {
    const matches = matchResumeEvidence(llmsEvidence, q.query, 3);
    const checkHit = (m) => {
      if (!m) return false;
      const [title, cite, sec, kw = ''] = m.item;
      const combined = `${title} ${cite} ${kw}`.toLowerCase();
      return sec === q.expectedSection && combined.includes(q.expectedToken.toLowerCase());
    };

    const passAt1 = checkHit(matches[0]);
    const hitAt3 = matches.some(checkHit);
    if (passAt1) passAt1Count += 1;
    if (hitAt3) hitAt3Count += 1;

    const top = matches[0]?.item;
    return {
      id: q.id,
      category: q.category,
      query: q.query,
      expectedSection: q.expectedSection,
      passAt1,
      hitAt3,
      passed: passAt1 && hitAt3,
      topCitation: top ? top[1] : null,
      topSection: top ? top[2] : null,
      topScore: matches[0]?.score || 0,
    };
  });

  const totalQueries = queries.length;
  const passAt1Rate = totalQueries ? Number((passAt1Count / totalQueries).toFixed(4)) : 0;
  const hitAt3Rate = totalQueries ? Number((hitAt3Count / totalQueries).toFixed(4)) : 0;

  return {
    passed:
      totalQueries > 0 &&
      passAt1Count === totalQueries &&
      hitAt3Count === totalQueries &&
      groundedCount === llmsEvidence.length &&
      llmsEvidence.length >= 10 &&
      withinTokenBudget,
    totalQueries,
    passAt1Count,
    hitAt3Count,
    passAt1Rate,
    hitAt3Rate,
    evidenceCount: llmsEvidence.length,
    resumeEvidenceCount: resumeEvidence.length,
    groundedCount,
    groundednessRate,
    llmsBytes,
    estimatedTokens,
    maxTokenBudget: MAX_LLMS_TOKEN_BUDGET,
    withinTokenBudget,
    results,
  };
}
