const { defineConfig } = require('cypress');
const { lighthouse, prepareAudit } = require('cypress-audit');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:4000',
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser = {}, launchOptions) => {
        prepareAudit(launchOptions);
      });

      on('task', {
        lighthouse: lighthouse(),
      });
    },
  },
});
