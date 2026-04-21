/**
 * E2E test suite for the portfolio website.
 * Covers content verification, navigation, accessibility, and SEO.
 */
describe('Portfolio Tests', () => {

  beforeEach(() => {
    // Visit the home page before each test
    cy.visit('/');
    // Inject the axe-core runtime for accessibility checks
    cy.injectAxe();
  });

  // --- Content Verification ---

  it('should have the correct page title', () => {
    cy.title().should('eq', 'Guilherme Vigneron de Oliveira - Principal Technologist');
  });

  it('should display the correct name in the header', () => {
    cy.contains('h1', 'Guilherme Vigneron de Oliveira').should('be.visible');
  });

  it('should display the correct subtitle', () => {
    cy.contains('Principal Technologist | QA & Software Testing Expert').should('be.visible');
  });

  it('should have all five section headers visible', () => {
    cy.contains('h2', 'About Me').should('be.visible');
    cy.contains('h2', 'Professional Experience').should('be.visible');
    cy.contains('h2', 'Core Competencies').should('be.visible');
    cy.contains('h2', 'Publications & Awards').should('be.visible');
    cy.contains('h2', 'Education').should('be.visible');
  });

  it('should display the footer with correct copyright', () => {
    cy.get('footer').should('be.visible');
    cy.get('footer').should('contain.text', '2026 Guilherme Vigneron de Oliveira');
  });

  // --- Navigation & Links ---

  it('should have visible social navigation links', () => {
    cy.get('a[aria-label="LinkedIn Profile (opens in a new tab)"]').should('be.visible');
    cy.get('a[aria-label="GitHub Profile (opens in a new tab)"]').should('be.visible');
    cy.get('a[aria-label="Email"]').should('be.visible');
  });

  it('should have the correct LinkedIn href', () => {
    cy.get('a[aria-label="LinkedIn Profile (opens in a new tab)"]')
      .should('have.attr', 'href', 'https://www.linkedin.com/in/guilherme-vigneron-de-oliveira');
  });

  it('should have the correct GitHub href', () => {
    cy.get('a[aria-label="GitHub Profile (opens in a new tab)"]')
      .should('have.attr', 'href', 'https://github.com/guilhermevigneron');
  });

  it('should have the correct email href', () => {
    cy.get('a[aria-label="Email"]')
      .should('have.attr', 'href', 'mailto:guilhermevigneron@gmail.com');
  });

  it('should have a working resume download link', () => {
    cy.contains('a', 'Download My Resume')
      .should('be.visible')
      .and('have.attr', 'href')
      .and('include', 'drive.google.com');
  });

  it('should have publication links with correct attributes', () => {
    cy.get('#publications a[target="_blank"]').each(($link) => {
      cy.wrap($link)
        .should('have.attr', 'rel')
        .and('include', 'noopener');
    });
  });

  // --- External links security ---

  it('should have rel="noopener noreferrer" on all external links', () => {
    cy.get('a[target="_blank"]').each(($link) => {
      cy.wrap($link)
        .should('have.attr', 'rel')
        .and('include', 'noopener');
    });
  });

  // --- SEO & AI Agent Readability ---

  it('should have a meta description', () => {
    cy.get('meta[name="description"]')
      .should('have.attr', 'content')
      .and('not.be.empty');
  });

  it('should have Open Graph meta tags', () => {
    cy.get('meta[property="og:title"]').should('exist');
    cy.get('meta[property="og:description"]').should('exist');
    cy.get('meta[property="og:type"]').should('have.attr', 'content', 'profile');
    cy.get('meta[property="og:url"]').should('have.attr', 'content', 'https://guilhermevigneron.dev');
  });

  it('should have JSON-LD structured data', () => {
    cy.get('script[type="application/ld+json"]').should('exist').then(($script) => {
      const jsonLd = JSON.parse($script.text());
      expect(jsonLd['@type']).to.eq('Person');
      expect(jsonLd.name).to.eq('Guilherme Vigneron de Oliveira');
      expect(jsonLd.jobTitle).to.include('QA');
      expect(jsonLd.knowsAbout).to.be.an('array').and.have.length.greaterThan(5);
    });
  });

  it('should have a canonical URL', () => {
    cy.get('link[rel="canonical"]')
      .should('have.attr', 'href', 'https://guilhermevigneron.dev');
  });

  // --- Accessibility ---


  it('should have a skip-to-content link', () => {
    cy.get('a[href="#about"]').should('exist');
  });

  it('should wrap social links in a nav element', () => {
    cy.get('nav[aria-label="Social links"]').should('exist');
  });

  it('should have aria-hidden on decorative icon elements', () => {
    cy.get('header i[aria-hidden="true"]').should('have.length', 3);
  });
});
