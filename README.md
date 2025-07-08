# Guilherme Vigneron - Portfolio & Resume

![Build, Test, and Deploy](https://github.com/guilhermevigneron/guilhermevigneron.github.io/actions/workflows/ci.yml/badge.svg)

This repository contains the source code for my personal portfolio and resume website. While it serves as a standard resume, it has also been engineered with a comprehensive Continuous Integration (CI) pipeline to demonstrate a commitment to code quality, stability, and modern development practices.

The primary goal is to ensure the website is always functional, accessible, and professional—just like the work I deliver.

---

## Technical Overview & Quality Assurance

To maintain a high standard, this project is configured with a **GitHub Actions** workflow that automatically builds, tests, and validates the site on every single commit. This ensures that any change, no matter how small, is verified before it goes live.

### The pipeline performs the following automated checks:

---

### 1. Dependency Management & Security Audit

- **`npm ci`**  
  Installs the exact versions of all Node.js dependencies listed in the `package-lock.json` file, ensuring a consistent and reproducible environment.

- **`npm audit`**  
  Scans for and fails the build if any high-severity security vulnerabilities are found in the project's dependencies.

---

### 2. Static Site Generation

- **`jekyll build`**  
  Compiles the Markdown and template files into a static HTML website, ensuring the site builds correctly.

---

### 3. Code & Content Validation

- **HTML Validation**  
  Uses `w3c-html-validator` to check the generated HTML against W3C standards, guaranteeing the markup is valid and well-formed.

- **Link Checking**  
  Employs `lychee-action` to crawl the entire site and verify that there are no broken links (404s or other errors), ensuring a seamless user experience.

---

### 4. End-to-End (E2E) Testing

- **Cypress**  
  The pipeline launches a live server with the built site and runs a suite of E2E tests using Cypress. These tests simulate real user interactions to verify:

  - **Content Verification**  
    The correct name and section headers are present.

  - **Navigational Integrity**  
    All key links (LinkedIn, GitHub, Email) are visible and functional.

---

This automated, multi-layered testing strategy ensures that my professional portfolio is not only a reflection of my experience but also a testament to the quality and care I put into my work.
