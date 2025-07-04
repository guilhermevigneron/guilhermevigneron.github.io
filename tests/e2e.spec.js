const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:4000');
  });

  test('Header Verification', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Guilherme Vigneron de Oliveira');
  });

  test('Navigation Link Verification', async ({ page }) => {
    await expect(page.locator('a[href="https://www.linkedin.com/in/guilherme-vigneron-de-oliveira"]')).toBeVisible();
    await expect(page.locator('a[href="https://github.com/guilhermevigneron"]')).toBeVisible();
    await expect(page.locator('a[href="mailto:guilhermevigneron@gmail.com"]')).toBeVisible();
  });

  test('Section Existence', async ({ page }) => {
    await expect(page.locator('h2:has-text("About Me")')).toBeVisible();
    await expect(page.locator('h2:has-text("Professional Experience")')).toBeVisible();
    await expect(page.locator('h2:has-text("Core Competencies")')).toBeVisible();
  });

  test('Accessibility', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
