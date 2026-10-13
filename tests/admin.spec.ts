import { expect, test } from '@playwright/test';

/**
 * The dashboard, as far as it can be exercised without a signed-in account.
 *
 * `playwright.config.ts` blanks the Firebase config for the test build, so the
 * page can only reach its "not configured" state here. That is not a limitation
 * to apologise for — it is the same state a fresh clone and a fork's deploy are
 * in, and it is what keeps CI from inheriting a developer's real project and
 * sending requests to it.
 *
 * The signed-out and authorised paths need a real Google redirect and a real
 * ruleset, so they are a manual pass rather than an automated one. See
 * `tests/rsvp.spec.ts` for the same trade-off on the guest side.
 */

test.describe('the admin dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/');
	});

	test('does not throw on a build with no Firebase config', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.getByRole('heading', { name: 'RSVP dashboard' }).waitFor();

		expect(errors).toEqual([]);
	});

	// The most valuable assertion here: reaching `getApp()` on an unconfigured
	// build rejects, and an unhandled rejection on mount is a crash rather than a
	// page that explains itself.
	test('explains itself instead of crashing', async ({ page }) => {
		await expect(page.getByText('Not configured', { exact: true })).toBeVisible();
		await expect(page.getByText('.env.example')).toBeVisible();
	});

	test('never offers a sign-in button it cannot fulfil', async ({ page }) => {
		await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
	});

	// The same principle, for the control that was easiest to get wrong: "Add a
	// household" needs a loaded list to sit on, so on a build with no Firebase it
	// must not appear at all. A button that submits into an unconfigured backend
	// produces an error with nothing to have asked.
	test('never offers to add a household it cannot store', async ({ page }) => {
		await expect(page.getByRole('button', { name: /add a household/i })).toHaveCount(0);
	});

	test('renders no guest data', async ({ page }) => {
		await expect(page.locator('table')).toHaveCount(0);
		await expect(page.getByText(/seats invited/i)).toHaveCount(0);
	});

	test('links back to the invitation', async ({ page }) => {
		await page.getByRole('link', { name: 'Back to the invitation' }).click();

		await expect(page.locator('[data-envelope]')).toBeVisible();
	});
});

test.describe('the admin dashboard is private', () => {
	test('keeps itself out of search results', async ({ page }) => {
		await page.goto('/admin/');

		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});

	// Hygiene, not a control — the HTML is public either way, and everything in it
	// is authorised by Firestore rules rather than by anything on screen. Asserted
	// so the line survives a future tidy-up of robots.txt.
	test('asks crawlers to stay away', async ({ request }) => {
		const robots = await (await request.get('/robots.txt')).text();

		expect(robots).toContain('Disallow: /admin/');
	});

	test('is not linked from the invitation', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('a[href="/admin/"]')).toHaveCount(0);
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	// What a no-JS visitor actually sees is the prerendered HTML. On this build
	// that is "Not configured", because the Playwright config blanks Firebase; on a
	// real configured build it is "Checking your session", since `auth.ready` can
	// never become true without JS. Either way the page must render rather than
	// come up blank.
	test('still renders the page rather than a blank one', async ({ page }) => {
		await page.goto('/admin/');

		await expect(page.getByRole('heading', { name: 'RSVP dashboard' })).toBeVisible();
		await expect(page.getByText('Not configured', { exact: true })).toBeVisible();
	});

	// Scoped to `noscript` deliberately: Playwright's text engine does not index
	// content inside a `<noscript>` element, so `getByText` finds nothing even
	// though the element is there and rendered.
	test('says what it needs rather than only "One moment."', async ({ page }) => {
		await page.goto('/admin/');

		await expect(page.locator('noscript p')).toHaveText('This dashboard needs JavaScript.');
	});
});