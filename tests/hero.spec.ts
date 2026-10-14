import { expect, test, type Locator, type Page } from '@playwright/test';

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
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
		//
		// `days?` rather than `days`, because `unit()` singularises a label whose
		// value is exactly 1. Asserting the plural pinned this to the two days in
		// every 24-hour window where no unit happens to read 1 — around an eighth of
		// the time — and it failed the rest. Same shape as the sentence assertion
		// below, which has always been plural-tolerant.
		//
		// Anchored, so these still do not match the screen-reader sentence, which
		// contains all three words.
		for (const label of [/^days?$/i, /^hours?$/i, /^minutes?$/i]) {
			await expect(timer.getByText(label)).toBeVisible();
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
	/**
	 * Mobile only, which is the only place full-bleed survives: above 640 the
	 * `sm:` and `lg:` variants win against the `w-full` inside Sprig, and the
	 * plants are meant to be sized there.
	 *
	 * It previously asserted this at every width, and failed continuously — it was
	 * written when the belief was that a base `w-*` could override `w-full`. It
	 * cannot; only a variant can.
	 */
	test('span the hero on a phone rather than sitting in a corner', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await revealHero(page);

		const hero = await page.locator('section').first().boundingBox();
		const boxes = await plantRects(page);

		expect(boxes).toHaveLength(2);

		for (const box of boxes) {
			expect(box.width, 'plant width').toBeGreaterThanOrEqual(hero!.width * 0.95);
		}
	});

	// The gap nothing covered. The plants are full-bleed below `sm:`, so their
	// heights scale with the viewport width while the hero's height is
	// viewport-bound — and between roughly 520px and the `sm:` breakpoint they
	// grow tall enough to cross each other. On a 600 × 900 screen the top-right
	// and bottom-left plants overlapped through most of the hero.
	//
	// This sweeps the range rather than pinning one width, because the crossing
	// point is set by the viewport's aspect ratio and not by width alone: on a
	// 1000px-tall screen they meet nearer 555px. 375 and 900 are in the sweep as
	// regression guards for the bands that were already right.
	test('never cross each other, at any width', async ({ page }) => {
		for (const width of [375, 520, 560, 600, 639, 900]) {
			await page.setViewportSize({ width, height: 900 });
			await revealHero(page);

			const [top, bottom] = await plantRects(page);

			expect(top, `plants at ${width}px`).toBeDefined();
			expect(bottom, `plants at ${width}px`).toBeDefined();

			const crossing = top!.y + top!.height > bottom!.y;

			expect(crossing, `plants overlap each other at ${width}px`).toBe(false);
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

	/**
	 * Replaces a test that asserted the plants never geometrically intersect a run
	 * of hero text. Under a full-bleed watermark that property is unsatisfiable —
	 * spanning the type is the point — so it could not be repaired, only restated.
	 *
	 * What matters for a watermark behind typography is that it is *behind* it, so
	 * this checks stacking order rather than geometry.
	 *
	 * Compared by computed `z-index`, not by `document.elementFromPoint()`. That
	 * looks like the obvious way to ask what is on top and silently proves nothing
	 * here: the plant container carries `pointer-events-none`, which removes it from
	 * hit testing entirely, so it can never be the element returned no matter what
	 * it is painted over. Both containers are positioned, so `z-index` is the
	 * property that actually decides the order, and inverting the two — which is
	 * what this would exist to catch — makes it fail.
	 */
	test('sit behind the type rather than over it', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await revealHero(page);

		const layers = await page.evaluate(() => {
			const plants = document.querySelector('img[data-sprig]')?.parentElement;
			const type = document.querySelector('[data-hero-type]');

			return {
				plants: plants ? getComputedStyle(plants).zIndex : null,
				type: type ? getComputedStyle(type).zIndex : null
			};
		});

		expect(layers.plants, 'no plant container found').not.toBeNull();
		expect(layers.type, 'no hero type container found').not.toBeNull();

		expect(Number(layers.plants)).toBeLessThan(Number(layers.type));
	});
});
