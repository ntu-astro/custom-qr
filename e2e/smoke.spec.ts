import { test, expect } from '@playwright/test';

/**
 * E2E smoke suite for the Astro QR halftone-QR generator.
 *
 * Each test asserts a critical user flow end-to-end against the production
 * Vite preview build (see `playwright.config.ts`'s `webServer`). Locators are
 * semantic (`getByRole`, `getByLabel`, `getByText`) wherever possible so the
 * suite remains stable across cosmetic refactors.
 */

// The QR pipeline is async — give the initial render a generous window so we
// don't race against the worker, but rely on `toBeVisible` auto-waiting rather
// than `waitForTimeout`.
const QR_RENDER_TIMEOUT = 20_000;

test.describe('Astro QR smoke', () => {
  test('loads the page and renders a QR canvas', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Astro QR', level: 1 })).toBeVisible();

    // The QR canvas is appended into the preview mount as a real <canvas>
    // element; once the pipeline finishes, it should have positive dimensions.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const dims = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  test('typing a new URL re-renders and reports scannable', async ({ page }) => {
    await page.goto('/');

    // Wait for the initial render so we know the pipeline is alive.
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const urlInput = page.getByPlaceholder('https://www.instagram.com/ntu_astro/');
    await urlInput.fill('https://example.com/ntu-astro-test');

    // After re-render, the scan badge should report a scannable result.
    // ScanBadge text is "✓ Scannable" or "✓ Scannable on screen" depending on
    // multi-size mode.
    await expect(page.getByText(/Scannable/i).first()).toBeVisible({
      timeout: QR_RENDER_TIMEOUT,
    });

    // Canvas should still have positive dimensions after the re-render.
    const dims = await page.locator('canvas').first().evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  test('switching template moves aria-pressed to the new tile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const orionTile = page.getByRole('button', { name: 'Orion' });
    await expect(orionTile).toHaveAttribute('aria-pressed', 'false');

    await orionTile.click();

    await expect(orionTile).toHaveAttribute('aria-pressed', 'true');

    // Default template (NTUAS) should now be unpressed.
    const ntuasTile = page.getByRole('button', { name: 'NTUAS' });
    await expect(ntuasTile).toHaveAttribute('aria-pressed', 'false');
  });

  test('Advanced silhouette scale slider updates displayed percentage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    // Open the <details> Advanced options panel.
    await page.getByText('Advanced options', { exact: true }).click();

    const slider = page.getByRole('slider', { name: /Silhouette size/i });
    await expect(slider).toBeVisible();

    // Range input doesn't accept fill() reliably; set the value and dispatch
    // input/change so React picks it up.
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, '50');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.getByText('50%', { exact: true })).toBeVisible();
  });

  test('caption input accepts text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const caption = page.getByPlaceholder('NTU Astro · 2026');
    await caption.fill('Stargazers welcome');

    await expect(caption).toHaveValue('Stargazers welcome');
  });

  test('download buttons are enabled once the QR is ready', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: QR_RENDER_TIMEOUT });

    const qrPng = page.getByRole('button', { name: 'QR only (PNG)' });
    const qrSvg = page.getByRole('button', { name: 'QR only (SVG)' });
    const poster = page.getByRole('button', { name: 'Poster (PNG)' });

    // Auto-waits until each becomes enabled — the initial render flips the
    // disabled flag once both qrCanvas and posterCanvas are populated.
    await expect(qrPng).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });
    await expect(qrSvg).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });
    await expect(poster).toBeEnabled({ timeout: QR_RENDER_TIMEOUT });
  });
});
