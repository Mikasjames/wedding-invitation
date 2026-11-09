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

test('?celebrateSpeed scales the burst animation', async ({ page }) => {
	const shardDuration = async (speed: number) => {
		await page.goto(`/envelope/?celebrate=seal&celebrateSpeed=${speed}`);
		await page.getByRole('button', { name: 'Open the invitation' }).click();

		return await page.locator('.shard').first().evaluate((element) => {
			const value = getComputedStyle(element).animationDuration;
			return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
		});
	};

	// Authored shard duration is 860ms, so 1.25 becomes 1075ms.
	expect(await shardDuration(1)).toBeLessThan(950);
	expect(await shardDuration(1.25)).toBeGreaterThan(1000);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('skips the celebration entirely', async ({ page }) => {
		await page.goto('/envelope/');

		await page.getByRole('button', { name: 'Open the invitation' }).click();

		await expect(page.locator('[data-celebration]')).toHaveCount(0);
	});
});
