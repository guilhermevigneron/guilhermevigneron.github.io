export const GOLDEN_TRIAGE_RUNS = [
  {
    id: 'sel-stale-shard-1',
    framework: 'Selenium / C#',
    testName: 'Grid Virtualization > Renders telemetry rows on filter change',
    retryPassed: true,
    expectedClassification: 'flaky_infra',
    rawLog:
      '[2026-11-14T14:02:11.412Z] OpenQA.Selenium.StaleElementReferenceException: stale element reference: element is not attached to the page document (Session=9f8a1b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c, Element=0x7f9a2b10) at Aveva.Qa.Pages.DataGridPage.ClickRow(Int32 index) in C:\\agent\\_work\\1\\s\\Tests\\DataGridPage.cs:142:17 after 3120ms',
  },
  {
    id: 'sel-stale-shard-2',
    framework: 'Selenium / C#',
    testName: 'Grid Virtualization > Renders telemetry rows on filter change',
    retryPassed: true,
    expectedClassification: 'flaky_infra',
    rawLog:
      '[2026-11-14T14:05:49.008Z] OpenQA.Selenium.StaleElementReferenceException: stale element reference: element is not attached to the page document (Session=1a2b3c4d-5e6f-4a7b-9c8d-1e2f3a4b5c6d, Element=0x4c118e90) at Aveva.Qa.Pages.DataGridPage.ClickRow(Int32 index) in C:\\agent\\_work\\1\\s\\Tests\\DataGridPage.cs:148:9 after 3490ms',
  },
  {
    id: 'sel-assert-calc-1',
    framework: 'Selenium / C#',
    testName: 'Release Gate > Computes SLA availability percentile accurately',
    retryPassed: false,
    expectedClassification: 'deterministic_regression',
    rawLog:
      '[2026-11-14T14:08:12.104Z] NUnit.Framework.AssertionException: Expected: 99.95m But was: 98.40m at Aveva.Qa.Tests.SlaAvailabilityTests.VerifyPercentile() in C:\\agent\\_work\\1\\s\\Tests\\SlaAvailabilityTests.cs:88:13 after 412ms',
  },
  {
    id: 'sel-assert-calc-2',
    framework: 'Selenium / C#',
    testName: 'Release Gate > Computes SLA availability percentile accurately',
    retryPassed: false,
    expectedClassification: 'deterministic_regression',
    rawLog:
      '[2026-11-14T14:09:01.992Z] NUnit.Framework.AssertionException: Expected: 99.95m But was: 98.40m at Aveva.Qa.Tests.SlaAvailabilityTests.VerifyPercentile() in C:\\agent\\_work\\1\\s\\Tests\\SlaAvailabilityTests.cs:89:13 after 389ms',
  },
  {
    id: 'pw-conn-reset-1',
    framework: 'Playwright',
    testName: 'Mobile Web Vitals > measures LCP and CLS on Slow 4G emulation',
    retryPassed: true,
    expectedClassification: 'flaky_infra',
    rawLog:
      '[2026-11-14T14:11:03.220Z] Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:36135/quality/ after 1420ms at runPerformanceAudit (scripts/check-performance.mjs:612:19)',
  },
  {
    id: 'pw-conn-reset-2',
    framework: 'Playwright',
    testName: 'Mobile Web Vitals > measures LCP and CLS on Slow 4G emulation',
    retryPassed: true,
    expectedClassification: 'flaky_infra',
    rawLog:
      '[2026-11-14T14:12:44.815Z] Error: page.goto: net::ERR_CONNECTION_RESET at http://127.0.0.1:44891/quality/ after 1890ms at runPerformanceAudit (scripts/check-performance.mjs:618:21)',
  },
  {
    id: 'pw-budget-breach',
    framework: 'Playwright',
    testName: 'Asset Budgets > enforces lazy command-menu-panel.js <= 12 KB',
    retryPassed: false,
    expectedClassification: 'deterministic_regression',
    rawLog:
      '[2026-11-14T14:15:10.004Z] AssertionError [ERR_ASSERTION]: lazy commandMenuPanelJs: 13995B exceeds budget 12288B at evaluateAssetBudgets (scripts/check-performance.mjs:118:11)',
  },
  {
    id: 'cy-axe-contrast-1',
    framework: 'Cypress + axe',
    testName: 'WCAG 2.1 AA Matrix > passes cy.checkA11y() for home-desktop-dark',
    retryPassed: false,
    expectedClassification: 'deterministic_regression',
    rawLog:
      '[2026-11-14T14:18:22.331Z] AssertionError: 1 accessibility violation was detected: color-contrast (serious) on 2 nodes at Context.eval (cypress/portfolio.cy.js:542:14) after 690ms',
  },
  {
    id: 'cy-axe-contrast-2',
    framework: 'Cypress + axe',
    testName: 'WCAG 2.1 AA Matrix > passes cy.checkA11y() for home-desktop-dark',
    retryPassed: false,
    expectedClassification: 'deterministic_regression',
    rawLog:
      '[2026-11-14T14:19:05.712Z] AssertionError: 1 accessibility violation was detected: color-contrast (serious) on 2 nodes at Context.eval (cypress/portfolio.cy.js:548:18) after 715ms',
  },
  {
    id: 'azdo-auth-env',
    framework: 'Azure DevOps CI',
    testName: 'Pipeline Restore > Authenticates private NuGet artifact feed',
    retryPassed: false,
    expectedClassification: 'env_config',
    rawLog:
      '[2026-11-14T14:21:00.119Z] Error: Response status code does not indicate success: 401 (Unauthorized) — federated service connection token expired on https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json',
  },
];

const ASSERTION_SIGNALS = [
  'assertionerror',
  'assertionexception',
  'expected:',
  'exceeds budget',
  'accessibility violation',
  'color-contrast',
  'wcag',
  'csp violation',
  'nullreferenceexception',
];

const ENV_SIGNALS = [
  '401 (unauthorized)',
  'token expired',
  'certificate has expired',
  'executable not found',
  'missing environment variable',
  'enospc',
];

const INFRA_FLAKE_SIGNALS = [
  'staleelementreferenceexception',
  'webdrivertimeoutexception',
  'err_connection_reset',
  'econnreset',
  'etimedout',
  'element is not attached',
  'target page, context or browser has been closed',
  '503 service unavailable',
];

export function normalizeFailureSignature(rawLog) {
  return String(rawLog || '')
    .replace(/\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]/gi, '[TIMESTAMP]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<HEX>')
    .replace(/(?:127\.0\.0\.1|localhost):\d+/gi, '127.0.0.1:<PORT>')
    .replace(/:\d+:\d+\b/g, ':<LINE>:<COL>')
    .replace(/\bafter\s+\d+\s*ms\b/gi, 'after <DUR>ms')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyFailureCluster({ signature, retryPassed }) {
  const lower = String(signature || '').toLowerCase();
  const hasAssertion = ASSERTION_SIGNALS.some((s) => lower.includes(s));
  const hasEnv = ENV_SIGNALS.some((s) => lower.includes(s));
  const hasInfra = INFRA_FLAKE_SIGNALS.some((s) => lower.includes(s));

  // Safety invariant: deterministic assertion or budget failures never get suppressed as flakes
  if (hasAssertion && !retryPassed) {
    return {
      classification: 'deterministic_regression',
      action: 'block_pr_regression',
      blocksPr: true,
      confidence: 0.98,
    };
  }

  if (hasEnv) {
    return {
      classification: 'env_config',
      action: 'fix_ci_environment',
      blocksPr: true,
      confidence: 0.95,
    };
  }

  if (retryPassed && hasInfra) {
    return {
      classification: 'flaky_infra',
      action: 'quarantine_and_stabilize',
      blocksPr: false,
      confidence: 0.94,
    };
  }

  return {
    classification: 'deterministic_regression',
    action: 'block_pr_regression',
    blocksPr: true,
    confidence: 0.9,
  };
}

export function triageFailureRuns(runs = GOLDEN_TRIAGE_RUNS) {
  const clusterMap = new Map();

  for (const run of runs) {
    const signature = normalizeFailureSignature(run.rawLog);
    const key = `${run.framework}::${run.testName}::${signature}`;
    const existing = clusterMap.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.runIds.push(run.id);
      existing.retryPassed = existing.retryPassed || Boolean(run.retryPassed);
    } else {
      clusterMap.set(key, {
        framework: run.framework,
        testName: run.testName,
        signature,
        occurrences: 1,
        runIds: [run.id],
        retryPassed: Boolean(run.retryPassed),
        expectedClassification: run.expectedClassification || null,
      });
    }
  }

  return [...clusterMap.values()].map((cluster, idx) => {
    const decision = classifyFailureCluster(cluster);
    const accurate = cluster.expectedClassification
      ? decision.classification === cluster.expectedClassification
      : true;
    const falseFlakeSuppression =
      cluster.expectedClassification === 'deterministic_regression' &&
      decision.classification === 'flaky_infra';

    return {
      clusterId: `cluster-${idx + 1}`,
      framework: cluster.framework,
      testName: cluster.testName,
      signature: cluster.signature,
      occurrences: cluster.occurrences,
      runIds: cluster.runIds,
      retryPassed: cluster.retryPassed,
      classification: decision.classification,
      expectedClassification: cluster.expectedClassification,
      action: decision.action,
      blocksPr: decision.blocksPr,
      confidence: decision.confidence,
      accurate,
      falseFlakeSuppression,
    };
  });
}

export function evaluateFlakyTriage({ runs = GOLDEN_TRIAGE_RUNS } = {}) {
  const clusters = triageFailureRuns(runs);
  const rawRunCount = runs.length;
  const clusterCount = clusters.length;
  const deduplicatedRuns = Math.max(0, rawRunCount - clusterCount);
  const noiseReductionRate = rawRunCount ? Number((deduplicatedRuns / rawRunCount).toFixed(4)) : 0;

  const accurateCount = clusters.filter((c) => c.accurate).length;
  const classificationAccuracy = clusterCount
    ? Number((accurateCount / clusterCount).toFixed(4))
    : 0;
  const falseFlakeSuppressions = clusters.filter((c) => c.falseFlakeSuppression).length;

  const flakyClusters = clusters.filter((c) => c.classification === 'flaky_infra').length;
  const regressionClusters = clusters.filter(
    (c) => c.classification === 'deterministic_regression'
  ).length;
  const envClusters = clusters.filter((c) => c.classification === 'env_config').length;

  return {
    passed:
      rawRunCount > 0 &&
      clusterCount > 0 &&
      accurateCount === clusterCount &&
      falseFlakeSuppressions === 0 &&
      deduplicatedRuns > 0,
    rawRunCount,
    clusterCount,
    deduplicatedRuns,
    noiseReductionRate,
    accurateCount,
    classificationAccuracy,
    falseFlakeSuppressions,
    flakyClusters,
    regressionClusters,
    envClusters,
    clusters,
  };
}
