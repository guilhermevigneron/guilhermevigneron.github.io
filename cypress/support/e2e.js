import 'cypress-axe';

// Strict production CSP disallows 'unsafe-eval', so serve axe-core from a same-origin
// test-only route and load it via <script src="..."> rather than window.eval().
Cypress.Commands.overwrite('injectAxe', (_originalFn, injectOptions) => {
  const axePath = injectOptions?.axeCorePath || 'node_modules/axe-core/axe.min.js';
  const testAxeUrl = '/__cypress_axe__/axe.min.js';

  cy.readFile(axePath, { log: false }).then((source) => {
    cy.intercept('GET', testAxeUrl, {
      statusCode: 200,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
      body: source,
    });

    return cy.document({ log: false }).then(
      (doc) =>
        new Cypress.Promise((resolve, reject) => {
          if (doc.defaultView?.axe) {
            resolve();
            return;
          }
          const script = doc.createElement('script');
          script.src = testAxeUrl;
          script.onload = () => resolve();
          script.onerror = (err) => reject(err);
          (doc.head || doc.documentElement).appendChild(script);
        })
    );
  });
});
