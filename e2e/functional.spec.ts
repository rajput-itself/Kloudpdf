import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  createSyntheticPdf,
  readDownloadBytes,
  inspectPdfOutput,
} from './helpers/pdfFixtures';

test.describe('KloudPDF End-to-End Functional & Security Tests', () => {
  test('Homepage loads, filters tools, supports dark mode, modals, and handles 404 routes', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/KloudPDF/i);
    await expect(page.getByRole('heading', { name: /Everything you need/i })).toBeVisible();

    // Quick Search filter
    const searchInput = page.getByLabel('Search PDF tools');
    await searchInput.fill('Compress');
    await expect(page.getByRole('button', { name: /Compress PDF/i })).toBeVisible();
    await searchInput.fill('');

    // FAQ modal check (footer button is visible on both desktop and mobile viewports)
    await page.getByRole('button', { name: 'FAQ & Capabilities' }).click();
    await expect(page.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeVisible();
    await page.keyboard.press('Escape');

    // Theme toggle check (use mobile drawer on small viewports if hamburger toggle is visible)
    const mobileToggle = page.locator('.header-mobile-toggle');
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      const drawer = page.locator('.header-mobile-menu');
      await drawer.getByRole('button', { name: /Switch to dark theme/i }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await drawer.getByRole('button', { name: /Switch to light theme/i }).click();
      await page.keyboard.press('Escape');
    } else {
      await page.locator('.header-nav').getByLabel(/Switch to dark theme/i).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('.header-nav').getByLabel(/Switch to light theme/i).click();
    }

    // Invalid route 404 check
    await page.goto('/#/non-existent-route-xyz');
    await expect(page.getByRole('heading', { name: /404/i })).toBeVisible();
    await page.getByRole('button', { name: /Return to All PDF Tools/i }).click();
    await expect(page.getByRole('heading', { name: /Everything you need/i })).toBeVisible();
  });

  test('Static PWA & SEO assets resolve cleanly', async ({ request }) => {
    const manifestRes = await request.get('./manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.short_name).toBe('KloudPDF');

    const swRes = await request.get('./sw.js');
    expect(swRes.status()).toBe(200);

    const robotsRes = await request.get('./robots.txt');
    expect(robotsRes.status()).toBe(200);

    const sitemapRes = await request.get('./sitemap.xml');
    expect(sitemapRes.status()).toBe(200);
  });

  test('Merge PDF produces valid combined multi-page PDF without external uploads', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://127.0.0.1') && !url.startsWith('blob:') && !url.startsWith('data:') && !url.includes('fonts.g')) {
        externalRequests.push(url);
      }
    });

    const pdfA = await createSyntheticPdf(1, 'DocA');
    const pdfB = await createSyntheticPdf(2, 'DocB');

    await page.goto('/#/merge');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'docA.pdf', mimeType: 'application/pdf', buffer: pdfA },
      { name: 'docB.pdf', mimeType: 'application/pdf', buffer: pdfB },
    ]);

    await page.getByRole('button', { name: /Merge PDF/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download/i }).click();
    const download = await downloadPromise;

    const bytes = await readDownloadBytes(download);
    const meta = await inspectPdfOutput(bytes);
    expect(meta.isValidPdfHeader).toBe(true);
    expect(meta.pageCount).toBe(3);

    // Ensure zero third-party document transmissions occurred
    const pdfLeakReqs = externalRequests.filter((u) => !u.includes('unpkg.com'));
    expect(pdfLeakReqs).toEqual([]);
  });

  test('Rotate PDF exports validated rotated PDF output', async ({ page }) => {
    const pdf = await createSyntheticPdf(1, 'RotateCheck');
    await page.goto('/#/rotate');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'rotate.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    await page.getByRole('button', { name: /Rotate PDF/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download/i }).click();
    const download = await downloadPromise;

    const meta = await inspectPdfOutput(await readDownloadBytes(download));
    expect(meta.isValidPdfHeader).toBe(true);
    expect(meta.pageCount).toBe(1);
    expect(meta.rotations[0]).toBe(90);
  });

  test('Compress PDF renders metrics UI and exports valid PDF', async ({ page }) => {
    const pdf = await createSyntheticPdf(2, 'CompressDoc');
    await page.goto('/#/compress-pdf');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    await page.getByRole('button', { name: /^Compress PDF$/i }).click();
    await expect(page.getByText(/Original Size/i)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Compressed PDF/i }).click();
    const download = await downloadPromise;

    const meta = await inspectPdfOutput(await readDownloadBytes(download));
    expect(meta.isValidPdfHeader).toBe(true);
    expect(meta.pageCount).toBe(2);
  });

  test('Batch PDF processes multiple files and exports consolidated ZIP', async ({ page }) => {
    const pdf1 = await createSyntheticPdf(1, 'Batch1');
    const pdf2 = await createSyntheticPdf(1, 'Batch2');

    await page.goto('/#/batch-pdf');
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'b1.pdf', mimeType: 'application/pdf', buffer: pdf1 },
      { name: 'b2.pdf', mimeType: 'application/pdf', buffer: pdf2 },
    ]);

    await page.getByRole('button', { name: /Rotate/i }).click();
    await page.getByRole('button', { name: /Process Batch \(2\)/i }).click();

    await expect(page.getByText('2 of 2 Completed')).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download ZIP \(2\)/i }).click();
    const download = await downloadPromise;

    const zipBytes = await readDownloadBytes(download);
    const zip = await JSZip.loadAsync(zipBytes);
    expect(zip.file('b1_rotated.pdf')).toBeTruthy();
    expect(zip.file('b2_rotated.pdf')).toBeTruthy();
  });

  test('PDF to Word produces valid .docx download', async ({ page }) => {
    const pdf = await createSyntheticPdf(1, 'WordExportHeading');
    await page.goto('/#/pdf-to-word');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'convert.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    await page.getByRole('button', { name: /Convert to Word/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('convert.docx');
    const zip = await JSZip.loadAsync(await readDownloadBytes(download));
    const xml = await zip.file('word/document.xml')?.async('text');
    expect(xml).toContain('WordExportHeading');
  });

  test('Security: rejects spoofed .pdf extension with invalid magic bytes', async ({ page }) => {
    await page.goto('/#/rotate');
    const fakePdf = Buffer.from('<script>alert("xss")</script>');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'spoofed.pdf',
      mimeType: 'application/pdf',
      buffer: fakePdf,
    });

    await expect(page.getByRole('alert')).toContainText(/valid PDF header/i);
  });
});
