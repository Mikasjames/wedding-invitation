import { expect, test } from '@playwright/test';

test('seal click reveals the invitation', async ({ page }) => {
	await page.goto('/');

	const seal = page.getByRole('button', { name: 'Open the invitation' });
	await expect(seal).toBeVisible();

	await seal.click();

	await expect(page.locator('[data-curtain]')).toHaveClass(/invisible/, {
		timeout: 10_000
	});
	await expect(page.getByText('Save the date')).toBeVisible();
});

test.describe('no JS', () => {
	test.use({ javaScriptEnabled: false });

	test('invitation is visible without the curtain', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('[data-curtain]')).toBeHidden();
		await expect(page.getByText('Save the date')).toBeVisible();
	});
});
