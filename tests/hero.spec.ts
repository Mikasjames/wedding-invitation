import { expect, test, type Locator, type Page } from '@playwright/test';

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function revealHero(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Open the invitation' }).click();
	await expect(page.locator('[data-envelope]')).toHaveClass(/invisible/, { timeout: 10_000 });
}

function sprigs(page: Page): Locator {
	return page.locator('img[data-sprig]');
}

function plantRects(page: Page): Promise<Box[]> {
	return sprigs(page).evaluateAll((els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height };
		})
	);
}

function opacities(page: Page): Promise<number[]> {
	return sprigs(page).evaluateAll((els) =>
		els.map((el) => Number(getComputedStyle(el).opacity))
	);
}

/** The rectangle of every run of hero text, glyph by glyph, rather than the
 *  bounding box of the element around it. The countdown's three columns are
 *  held apart by gaps and a rule, so its container box claims far more of the
 *  hero than the words on the page actually occupy — measuring the container
 *  is what forces the plants into the corners to stay out of empty space. */
function heroGlyphRects(page: Page): Promise<Box[]> {
	return page.evaluate(() => {
		const section = document.querySelector('section');
		if (!section) return [];

		const rects: Box[] = [];
		const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);

		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.textContent?.trim()) continue;

			// The screen-reader sentence is deliberately off-screen, so it cannot
			// collide with anything a guest can see.
			if (node.parentElement?.closest('.sr-only')) continue;

			const range = document.createRange();
			range.selectNodeContents(node);

			for (const r of range.getClientRects()) {
				if (r.width > 0 && r.height > 0) {
					rects.push({ x: r.x, y: r.y, width: r.width, height: r.height });
				}
			}
		}

		return rects;
	});
}

test.describe('hero countdown', () => {
	// The column countdown is `lg:hidden`, so without an explicit phone width
	// these run at Playwright's 1280px default and match nothing.
	test.use({ viewport: { width: 375, height: 812 } });

	test('labels what it is counting down to', async ({ page }) => {
		await revealHero(page);

		const timer = page.getByRole('timer');
		await expect(timer).toBeVisible();

		// Lowercase in the DOM: the small-caps look is a CSS `uppercase`, so
		// asserting the capitalised form would be asserting the stylesheet.
		// `exact` keeps these off the screen-reader sentence, which contains the
		// same words.
		for (const label of ['days', 'hours', 'minutes']) {
			await expect(timer.getByText(label, { exact: true })).toBeVisible();
		}
	});

	// The layout carries the grouping visually and a single sentence to screen
	// readers, so assert the numbers are not left to be read column by column.
	test('exposes the countdown as one sentence to assistive tech', async ({ page }) => {
		await revealHero(page);

		// Scoped to the sentence itself: the timer wraps it, so a loose
		// `getByText` would also match the container and trip strict mode.
		await expect(page.getByRole('timer').locator('.sr-only')).toHaveText(
			/\d+ days?, \d+ hours? and \d+ minutes? until we say I do\./
		);
	});

	// The digits used to be baked into the prerendered HTML at build time, so a
	// guest without JS was served a countdown frozen on the build day. The
	// desktop line is the one that has to be caught: it carries the same
	// `role="timer"`, so a count of zero covers both breakpoints.
	test('renders no stale countdown before the clock is read', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		await page.goto('/');

		await expect(page.getByRole('timer')).toHaveCount(0);
		await expect(page.locator('span.sr-only')).toHaveCount(0);
		await expect(page.getByText('Save the date')).toBeVisible();

		await context.close();
	});

	// The countdown was sitting outside the `now > 0` guard, so the desktop
	// line rendered against the Unix epoch — "20858 days" — in the shipped
	// HTML, and printed "0 days" beside the thank-you copy after the date.
	test('shows nothing at all in the prerendered HTML', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		await page.goto('/');

		// Nothing anywhere on the page should read as a countdown yet.
		await expect(page.getByText(/days/)).toHaveCount(0);
		await expect(page.getByText(/hours/)).toHaveCount(0);
		await expect(page.getByText(/minutes/)).toHaveCount(0);

		await context.close();
	});
});

test.describe('hero plants', () => {
	// The whole reason this suite exists: the plants were sized by a `w-*`
	// utility that a hardcoded `w-full` in the component silently outranked, so
	// each one rendered a full viewport wide and lay itself across the date and
	// the countdown.
	test('stay a corner decoration instead of growing to the viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await revealHero(page);

		const viewport = page.viewportSize();
		const boxes = await plantRects(page);

		expect(boxes).toHaveLength(2);

		// The widest the hero asks for is 56%. The bound is here to catch a
		// plant falling back to the full viewport, not to police the design.
		for (const box of boxes) {
			expect(box.width, 'plant width').toBeLessThanOrEqual(viewport!.width * 0.6);
		}
	});

	// The reveal rule was specific enough to beat the caller's `opacity-*`, which
	// turned a watermark into a foreground element competing with the type. The
	// hero holds them back on a phone, where there is barely a gutter either
	// side of the text, and lets them run at full strength from `sm` up.
	test('hold back on a phone and run at full strength on a wide screen', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await revealHero(page);
		await expect.poll(() => opacities(page), { timeout: 10_000 }).toEqual([0.55, 0.55]);

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect.poll(() => opacities(page), { timeout: 10_000 }).toEqual([1, 1]);
	});

	test('do not sit on top of the date, city or countdown', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await revealHero(page);

		const plantBoxes = await plantRects(page);
		const textRects = await heroGlyphRects(page);

		expect(plantBoxes).toHaveLength(2);
		expect(textRects.length).toBeGreaterThan(3);

		for (const plant of plantBoxes) {
			for (const text of textRects) {
				expect(overlaps(plant, text), `plant over glyph ${JSON.stringify(text)}`).toBe(false);
			}
		}
	});
});
