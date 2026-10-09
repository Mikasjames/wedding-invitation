import { expect, test } from '@playwright/test';
import { scriptFonts, systemFonts } from '../src/lib/lib/fonts';

test.describe('opening types', () => {
	test('root shows the envelope reveal', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('[data-envelope]')).toBeVisible();
		await expect(page.locator('[data-curtain]')).toHaveCount(0);
	});

	test('/envelope shows the envelope reveal', async ({ page }) => {
		await page.goto('/envelope/');

		await expect(page.locator('[data-envelope]')).toBeVisible();
		await expect(page.locator('[data-curtain]')).toHaveCount(0);
	});

	test('/curtain shows the curtain reveal', async ({ page }) => {
		await page.goto('/curtain/');

		await expect(page.locator('[data-curtain]')).toBeVisible();
		await expect(page.locator('[data-envelope]')).toHaveCount(0);
	});

	test('curtain seal click reveals the invitation', async ({ page }) => {
		await page.goto('/curtain/');

		await page.getByRole('button', { name: 'Open the invitation' }).click();

		await expect(page.locator('[data-curtain]')).toHaveClass(/invisible/, {
			timeout: 10_000
		});
		await expect(page.getByText('Save the date')).toBeVisible();
	});

	test('every opening type renders the same invitation', async ({ page }) => {
		for (const route of ['/', '/envelope/', '/curtain/']) {
			await page.goto(route);
			await expect(page.getByText('Save the date')).toBeAttached();
			await expect(page).toHaveTitle(/Michal & Lemuel/);
		}
	});

	test('client-side navigation replays the reveal', async ({ page }) => {
		await page.goto('/envelope/');
		await page.getByRole('button', { name: 'Open the invitation' }).click();
		await expect(page.locator('[data-envelope]')).toHaveClass(/invisible/, {
			timeout: 10_000
		});

		// A real anchor so SvelteKit handles this as a client-side navigation.
		await page.evaluate(() => {
			const link = document.createElement('a');
			link.href = '/curtain/';
			link.id = 'to-curtain';
			link.textContent = 'to curtain';
			link.style.cssText =
				'position:fixed;top:0;left:0;z-index:9999;padding:8px;background:#fff';
			document.body.appendChild(link);
		});
		await page.locator('#to-curtain').click();

		// Reveal state is a module singleton, so it must be reset on navigation
		// or the curtain would be skipped entirely.
		await expect(page.locator('[data-curtain]')).toBeVisible();
		await expect(page.locator('[data-curtain]')).not.toHaveClass(/invisible/);
	});
});

test.describe('type specimen', () => {
	test('renders every family in the manifest', async ({ page }) => {
		await page.goto('/fonts/');

		await expect(page.getByRole('heading', { name: 'Typefaces', level: 1 })).toBeVisible();
		await expect(page.locator('[data-font]')).toHaveCount(
			systemFonts.length + scriptFonts.length
		);
	});

	test('the hero names face is the one marked in use', async ({ page }) => {
		await page.goto('/fonts/');

		const names = page.locator('[data-font="Pinyon Script"]');
		await expect(names).toBeVisible();
		await expect(names.getByText('in use')).toBeVisible();
		await expect(names.getByText('Michal')).toBeVisible();
	});

	// A missing @font-face is silent: the specimen just falls back to the serif
	// stack. Ask the browser which faces it actually loaded. Note that
	// `document.fonts.check()` is useless here — it reports true for families
	// that do not exist at all.
	test('every specimen really loads its face', async ({ page }) => {
		await page.goto('/fonts/');
		await page.evaluate(() => document.fonts.ready);

		const missing = await page.evaluate((families) => {
			const loaded = new Set(
				[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
			);
			return families.filter((family) => !loaded.has(family));
		}, [...systemFonts, ...scriptFonts].map((f) => f.family));

		expect(missing).toEqual([]);
	});
});

test.describe('no JS', () => {
	test.use({ javaScriptEnabled: false });

	for (const route of ['/', '/envelope/', '/curtain/']) {
		test('invitation is visible without the reveal on ' + route, async ({ page }) => {
			await page.goto(route);

			await expect(page.locator('[data-envelope]')).toBeHidden();
			await expect(page.locator('[data-curtain]')).toBeHidden();
			await expect(page.getByText('Save the date')).toBeVisible();
		});
	}
});
