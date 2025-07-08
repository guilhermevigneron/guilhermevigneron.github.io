describe('Homepage', () => {
  beforeEach(() => {
    // Visit the base URL defined in cypress.config.js
    cy.visit('/');
    // Inject the axe-core library for accessibility checks
    cy.injectAxe();
  });

  it('should display the correct name in the header', () => {
    cy.get('h1').should('contain.text', 'Guilherme Vigneron de Oliveira');
  });

  it('should have visible navigation links', () => {
    cy.get('a[href="https://www.linkedin.com/in/guilherme-vigneron-de-oliveira"]').should('be.visible');
    cy.get('a[href="https://github.com/guilhermevigneron"]').should('be.visible');
    cy.get('a[href="mailto:guilhermevigneron@gmail.com"]').should('be.visible');
  });

  it('should have the main sections visible', () => {
    cy.contains('h2', 'About Me').should('be.visible');
    cy.contains('h2', 'Professional Experience').should('be.visible');
    cy.contains('h2', 'Core Competencies').should('be.visible');
  });

});
