import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/docs',
  '/docs/introduction',
  '/docs/install',
  '/docs/first-workspace',
  '/docs/concepts/local-first',
  '/docs/concepts/isolated-workspaces',
  '/docs/community/we-are-mozart',
  '/blog',
  '/blog/hello-mozart',
  '/changelog',
  '/privacy',
  '/terms',
] as const;

test.describe('landing site smoke', () => {
  for (const route of ROUTES) {
    test(`renders a single h1 at ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status() ?? 0).toBeLessThan(400);

      // Wait until the SPA has hydrated at least one heading.
      await page.locator('h1').first().waitFor({ state: 'attached' });
      const headingCount = await page.locator('h1').count();
      expect(headingCount).toBe(1);
    });
  }

  test('theme toggle persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('[aria-label="Toggle theme"]').first().click();

    const isDarkBeforeReload = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    await page.reload();
    await page.locator('h1').first().waitFor({ state: 'attached' });

    const isDarkAfterReload = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    expect(isDarkAfterReload).toBe(isDarkBeforeReload);
    const persisted = await page.evaluate(() =>
      window.localStorage.getItem('app:color-mode'),
    );
    expect(persisted === 'light' || persisted === 'dark').toBe(true);
  });

  test('docs sidebar exposes the expected entries in order', async ({
    page,
  }) => {
    await page.goto('/docs/introduction');
    await page.locator('h1').first().waitFor({ state: 'attached' });

    const sidebarLinks = await page
      .locator('nav[aria-label="Documentation"] a')
      .allInnerTexts();

    const titles = sidebarLinks.map((s) => s.trim()).filter(Boolean);

    for (const expected of [
      'Introduction',
      'Install',
      'First workspace',
      'Local first',
      'Isolated workspaces',
      'We are mozart',
    ]) {
      expect(titles).toContain(expected);
    }

    const positions = [
      'Introduction',
      'Install',
      'First workspace',
      'Isolated workspaces',
      'Local first',
    ].map((t) => titles.indexOf(t));
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      expect(positions[i]).toBeGreaterThan(prev ?? -1);
    }
  });
});
