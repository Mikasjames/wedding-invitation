import { expect, test } from '@playwright/test';

/**
 * The RSVP flow, exercised as a guest would meet it.
 *
 * There is no Firestore here. These tests run against a build with no
 * `PUBLIC_FIREBASE_*` configured — which is exactly the build a fresh clone and
 * a fork's deploy produce, so asserting the graceful path is what keeps CI honest
 * rather than testing a configuration only the author has.
 *
 * The behaviour that actually matters (the seat cap, the code alphabet, the
 * phase transitions) is covered in `src/lib/rsvp/*.test.ts` and, for the rules
 * themselves, by the Firestore emulator.
 */

test.describe('entering a code', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/rsvp/');
	});

	test('asks for a code rather than showing a form', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
		await expect(page.locator('[data-rsvp-code]')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
	});

	// The code is a capability token. Putting it in the URL means it travels in
	// the Referer header of any outbound request, so the whole document opts out.
	test('the page does not leak the code by referrer', async ({ page }) => {
		await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
			'content',
			'no-referrer'
		);
	});

	test('says plainly when RSVPs are not configured', async ({ page }) => {
		// No Firebase config in CI, so the lookup resolves to "unavailable" rather
		// than to a confusing "code not found".
		await page.locator('[data-rsvp-code]').fill('W8K9JPTR4M');
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'RSVPs are not open just yet' })).toBeVisible();
	});

	test('offers a way to get help when a code cannot be found', async ({ page }) => {
		await expect(page.getByText('Cannot find your code?')).toBeVisible();
	});

	test('is reachable from the invitation', async ({ page }) => {
		await page.goto('/');

		await page.getByRole('button', { name: 'Open the invitation' }).click();
		await expect(page.locator('[data-envelope]')).toHaveClass(/invisible/, { timeout: 10_000 });

		await expect(page.locator('[data-rsvp]')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
	});
});

test.describe('the standalone page', () => {
	// The invitation's reveal exists to make the invitation an object. A guest
	// following a link to answer a question should not have to break a seal first,
	// and the wrapper's scroll lock would fight anyone scrolling back up.
	test('does not ask you to open anything first', async ({ page }) => {
		await page.goto('/rsvp/');

		await expect(page.locator('[data-envelope]')).toHaveCount(0);
		await expect(page.locator('[data-curtain]')).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
	});

	test('keeps itself out of search results', async ({ page }) => {
		await page.goto('/rsvp/');

		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});

	test('links back to the invitation', async ({ page }) => {
		await page.goto('/rsvp/');

		await page.getByRole('link', { name: 'Back to the invitation' }).click();

		await expect(page.locator('[data-envelope]')).toBeVisible();
	});

	test('ignores a code that is not ten characters', async ({ page }) => {
		await page.goto('/rsvp/');

		await page.locator('[data-rsvp-code]').fill('TOOSHORT');
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('alert')).toContainText('does not look like a code');
		// Still on the entry screen, with what they typed still in the box.
		await expect(page.locator('[data-rsvp-code]')).toHaveValue('TOOSHORT');
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	// The whole flow is client-side, so there is no server-rendered fallback. What
	// matters is that a guest without JS still gets the invitation rather than a
	// blank page or a broken one.
	test('the invitation still renders on its own', async ({ page }) => {
		await page.goto('/rsvp/');

		await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
	});
});