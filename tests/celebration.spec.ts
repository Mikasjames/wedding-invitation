import { expect, test } from '@playwright/test';

// The reveal celebration is selected by `celebration.ts` and can be overridden
// per page load with `?celebrate=`. These tests guard the wiring, not the
// animation frames: the effect should mount on open, clean itself up, and obey
// both the override and reduced motion.

test('the envelope plays the seal effect by default', async ({ page }) => {
	await page.goto('/envelope/');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	const fx = page.locator('[data-celebration="seal"]');
	await expect(fx).toBeVisible();
	await expect(fx).toHaveCount(0, { timeout: 4_000 });
});

test('?celebrate=none removes the effect', async ({ page }) => {
	await page.goto('/envelope/?celebrate=none');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	await expect(page.locator('[data-celebration]')).toHaveCount(0);
});

test('the curtain uses the same configured effect', async ({ page }) => {
	await page.goto('/curtain/?celebrate=seal');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	await expect(page.locator('[data-celebration="seal"]')).toBeVisible();
});

test('?celebrate=confetti keeps the canvas implementation selectable', async ({ page }) => {
	await page.goto('/envelope/?celebrate=confetti');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	await expect(page.locator('[data-celebration]')).toHaveCount(0);
	await expect(page.locator('canvas')).toHaveCount(1, { timeout: 4_000 });
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('skips the celebration entirely', async ({ page }) => {
		await page.goto('/envelope/');

		await page.getByRole('button', { name: 'Open the invitation' }).click();

		await expect(page.locator('[data-celebration]')).toHaveCount(0);
	});
});
