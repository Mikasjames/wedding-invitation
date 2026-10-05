import { expect, test } from '@playwright/test';

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('reveal completes quickly without animation', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Open the invitation' }).click();
		await expect(page.locator('[data-curtain]')).toHaveClass(/invisible/, { timeout: 3_000 });
		await expect(page.getByText('Save the date')).toBeVisible();
	});
});

test('music toggle mounts after reveal', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Open the invitation' }).click();
	const toggle = page.getByRole('button', { name: /background music/i });
	await expect(toggle).toBeVisible({ timeout: 10_000 });
	await toggle.click();
});

test.describe('mobile', () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test('hero renders and reveal works', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Open the invitation' }).click();
		await expect(page.getByText('Save the date')).toBeVisible({ timeout: 10_000 });
	});
});
