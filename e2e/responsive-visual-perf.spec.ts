import { test, expect } from '@playwright/test';

test.describe('Responsive Layout, Visual Regression & Core Web Vitals', () => {
  test('Zero horizontal overflow across homepage and tool workspaces', async ({ page }) => {
    const routes = ['/', '/#/compress-pdf', '/#/batch-pdf', '/#/rotate'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(overflow, `Horizontal overflow detected at ${route}`).toBe(false);
    }
  });

  test('Homepage Core Web Vitals (LCP <= 2500ms, CLS <= 0.1) in laboratory preview', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__kloudPerf = { cls: 0, lcp: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            (window as any).__kloudPerf.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });

      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) (window as any).__kloudPerf.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(() => (window as any).__kloudPerf);
    expect(metrics.cls).toBeLessThanOrEqual(0.1);
    expect(metrics.lcp).toBeLessThanOrEqual(2500);
  });

  test('Visual baseline snapshot of homepage shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.hero-section')).toHaveScreenshot('hero-section.png');
  });
});
