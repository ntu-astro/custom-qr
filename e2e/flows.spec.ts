import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the secondary user flows: multi-size scan check, caption
 * persistence across reloads, upload validation paths (decode-QR + custom
 * template), download events, and the over-long-URL error recovery path.
 *
 * These complement the lighter smoke suite in `smoke.spec.ts` — splitting the
 * specs keeps each file focused enough to scan without scrolling. Locators are
 * semantic where possible; auto-waiting is preferred over `waitForTimeout`.
 */

// Mirror of the constant in smoke.spec.ts. The QR pipeline is async — give the
// initial render a generous window so we don't race against the worker.
const QR_RENDER_TIMEOUT = 20_000;
test.describe('Astro QR flows', () => {
  test('multi-size scan check renders both screen and print badges', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    // Open the Advanced options panel and toggle the multi-size checkbox.
    await page.getByText('Advanced options', { exact: true }).click();

    const multiSize = page.getByLabel(/Multi-size scan check/i);
    await multiSize.check();

    // After the pipeline re-runs we should see both the screen scan badge
    // and the print scan badge. The screen badge gains an "on screen" suffix
    // when multiSize is true; the print badge mentions "200×200px" when ok.
    await expect(page.getByText(/Scannable on screen/i)).toBeVisible({
      timeout: QR_RENDER_TIMEOUT,
    });
    await expect(
      page.getByText(/Scannable when printed small|Won.t scan at print size/i),
    ).toBeVisible({ timeout: QR_RENDER_TIMEOUT });
  });

  test('caption persists across a full page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const captionText = 'E2E persisted caption';
    const caption = page.getByPlaceholder('NTU Astro · 2026');
    await caption.fill(captionText);
    await expect(caption).toHaveValue(captionText);

    await page.reload();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    // App.tsx persists { url, templateId, caption } to localStorage under
    // PERSIST_KEY = 'astro-qr:v1', so the caption input should rehydrate.
    await expect(page.getByPlaceholder('NTU Astro · 2026')).toHaveValue(captionText);
  });

  test('Decode QR upload rejects a non-image file with a MIME error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    // The decode-qr <input type="file"> is hidden behind a button. We can
    // address it directly by id — Playwright's setInputFiles works on hidden
    // inputs and bypasses the native file picker.
    await page.locator('#decode-qr-upload').setInputFiles({
      name: 'plain.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });

    await expect(
      page.getByRole('alert').filter({ hasText: 'Only PNG, JPG, or WebP images can be decoded.' }),
    ).toBeVisible();
  });

  test('Custom template upload rejects a GIF with a MIME error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    await page.locator('#custom-source-upload').setInputFiles({
      name: 'forbidden.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a-stub'),
    });

    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Only PNG, JPG, WebP, or SVG uploads are supported.' }),
    ).toBeVisible();
  });

  test('download buttons trigger downloads with the expected filenames', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const qrPng = page.getByRole('button', { name: 'QR only (PNG)' });
    const qrSvg = page.getByRole('button', { name: 'QR only (SVG)' });
    const poster = page.getByRole('button', { name: 'Poster (PNG)' });
    await expect(qrPng).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });
    await expect(qrSvg).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });
    await expect(poster).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });

    {
      const downloadPromise = page.waitForEvent('download');
      await qrPng.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('astro-qr.png');
    }
    {
      const downloadPromise = page.waitForEvent('download');
      await qrSvg.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('astro-qr.svg');
    }
    {
      const downloadPromise = page.waitForEvent('download');
      await poster.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('astro-qr-poster.png');
    }
  });

  test('typing an over-long URL surfaces a pipeline error then recovers when cleared', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const urlInput = page.getByPlaceholder('https://www.instagram.com/ntu_astro/');
    // 5000+ chars — well past what fits at ECC level H even in the largest
    // QR version. The qrcode lib throws and useQrPipeline surfaces the message
    // via the "alert" role; the wording is either the friendly mapped one
    // ("Input too long for ECC level H …") or the raw qrcode message
    // ("The amount of data is too big …"). Match either to stay decoupled from
    // the message-mapping branch in useQrPipeline.
    const overlong = 'x'.repeat(5200);
    await urlInput.fill(overlong);

    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /too (long|big)/i }),
    ).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    // Now restore a valid URL and confirm the error clears + a canvas renders.
    await urlInput.fill('https://example.com/recovered');
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: QR_RENDER_TIMEOUT });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });
  });
});
