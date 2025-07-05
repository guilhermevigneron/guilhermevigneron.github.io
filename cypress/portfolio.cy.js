/**
 * E2E test suite for the portfolio website.
 * This suite now includes accessibility and performance checks.
 */
describe('Portfolio Tests', () => {

  beforeEach(() => {
    // Visit the home page before each test
    cy.visit('/');
    // Inject the axe-core runtime
    cy.injectAxe();
  });

  /**
   * Test to ensure the main page loads and key content is visible.
   */
  it('should load the page and check for main elements', () => {
    cy.contains('h1', 'Guilherme Vigneron de Oliveira').should('be.visible');
    cy.contains('h2', 'Core Competencies').should('be.visible');
  });

  /**
   * Test to verify that the external link to the GitHub profile works correctly.
   */
  it('should navigate to the GitHub profile', () => {
    cy.get('a[aria-label="GitHub Profile"]')
      .invoke('removeAttr', 'target')
      .click();
    cy.url().should('include', 'github.com/guilhermevigneron');
  });

  /**
   * Test to run accessibility checks on the main page.
   */
  it('should be free of accessibility violations', () => {
    // Run accessibility check on the entire page
    cy.checkA11y();
  });

  /**
   * Test to run a Lighthouse performance audit.
   */
  it('should pass the performance audit', () => {
    // Define the performance thresholds for the Lighthouse audit
    const lighthouseThresholds = {
      performance: 90,
      accessibility: 100,
      'best-practices': 90,
      seo: 90,
    };

    // Run the Lighthouse audit with the specified thresholds
    cy.lighthouse(lighthouseThresholds);
  });
});
