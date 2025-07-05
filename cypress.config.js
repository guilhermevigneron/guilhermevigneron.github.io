const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    // The base URL of the local Jekyll server
    baseUrl: 'http://127.0.0.1:4000',
    // We don't need a support file for this simple test
    supportFile: false,
  },
});
