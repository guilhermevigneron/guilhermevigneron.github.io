/**
 * E2E test suite for the portfolio website.
 */
describe('Portfolio E2E Test', () => {
  /**
   * Test to ensure the main page loads correctly and key content is visible.
   */
  it('should load the page and check for main elements', () => {
    // Visit the home page using the baseUrl from the config file
    cy.visit('/');

    // Assert that the main heading with your name is visible
    cy.contains('h1', 'Guilherme Vigneron de Oliveira').should('be.visible');

    // Assert that the "Core Competencies" section is on the page
    cy.contains('h2', 'Core Competencies').should('be.visible');
  });

  /**
   * Test to verify that the external link to the GitHub profile works correctly.
   */
  it('should navigate to the GitHub profile', () => {
    cy.visit('/');

    // Find the GitHub link by its aria-label.
    // We must remove the `target="_blank"` attribute so the link opens
    // in the same browser tab, which allows Cypress to track the URL change.
    cy.get('a[aria-label="GitHub Profile"]')
      .invoke('removeAttr', 'target')
      .click();

    // Assert that the URL has changed to the correct GitHub profile
    cy.url().should('include', 'github.com/guilhermevigneron');
  });
});
