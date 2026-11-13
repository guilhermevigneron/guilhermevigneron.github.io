const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('cypress');

const reportsDir = path.join(__dirname, '.ci-reports');
const resultsFile = path.join(reportsDir, 'cypress-results.json');

const state = {
  a11y: {
    checksRun: 0,
    violations: 0,
    audits: [],
  },
  mobile: {
    checksRun: 0,
    failures: 0,
    checks: [],
  },
  network: {
    pagesChecked: 0,
    externalRequests: 0,
    blockedUrls: [],
  },
};

function persistMetrics(extra = {}) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const payload = {
    ...state,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(resultsFile, JSON.stringify(payload, null, 2));
}

module.exports = defineConfig({
  video: false,
  allowCypressEnv: false,
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://127.0.0.1:4000',
    specPattern: 'cypress/**/*.cy.js',
    setupNodeEvents(on) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium') {
          launchOptions.args.push(
            '--disable-component-update',
            '--disable-background-networking',
            '--disable-domain-reliability'
          );
        }
        return launchOptions;
      });

      on('before:run', () => {
        state.a11y = { checksRun: 0, violations: 0, audits: [] };
        state.mobile = { checksRun: 0, failures: 0, checks: [] };
        state.network = { pagesChecked: 0, externalRequests: 0, blockedUrls: [] };
        persistMetrics({ totalTests: 0, totalPassed: 0, totalFailed: 0 });
      });

      on('task', {
        recordA11yAudit({ label, violations }) {
          state.a11y.checksRun += 1;
          state.a11y.violations += violations;
          state.a11y.audits.push({ label, violations });
          persistMetrics();
          return null;
        },
        recordMobileAudit({ label, passed }) {
          state.mobile.checksRun += 1;
          if (!passed) state.mobile.failures += 1;
          state.mobile.checks.push({ label, passed });
          persistMetrics();
          return null;
        },
        recordNetworkAudit({ externalUrls }) {
          state.network.pagesChecked += 1;
          state.network.externalRequests += externalUrls.length;
          state.network.blockedUrls.push(...externalUrls);
          persistMetrics();
          return null;
        },
      });

      on('after:run', (results) => {
        persistMetrics({
          totalTests: results?.totalTests ?? 0,
          totalPassed: results?.totalPassed ?? 0,
          totalFailed: results?.totalFailed ?? 0,
        });
      });
    },
  },
});
