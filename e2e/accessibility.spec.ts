import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WCAG 2.2 AA Accessibility Audits (axe-core)', () => {
  test('Homepage has zero critical or serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(
      seriousOrCritical,
      `Accessibility violations found: ${JSON.stringify(seriousOrCritical.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)}`
    ).toEqual([]);
  });

  test('Compress PDF & Batch PDF upload views pass accessibility checks', async ({ page }) => {
    for (const route of ['/#/compress-pdf', '/#/batch-pdf', '/#/edit-pdf']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(
        seriousOrCritical,
        `Accessibility violations on ${route}: ${JSON.stringify(seriousOrCritical.map((v) => v.id))}`
      ).toEqual([]);
    }
  });
});
