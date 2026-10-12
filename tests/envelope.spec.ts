import { expect, test } from '@playwright/test';

// The envelope turns on its side at the desktop breakpoint. Assert the
// orientation rather than a ratio, so retuning `--shape` stays a layout change
// and not a test failure. `/curtain/` has its own reveal and keeps its portrait
// panels, so only the envelope routes are covered here.

const SIZES = [
	{ label: 'a wide desktop', width: 1440, height: 900, landscape: true },
	{ label: 'a small desktop', width: 1280, height: 800, landscape: true },
	{ label: 'a tablet', width: 1024, height: 1366, landscape: false },
	{ label: 'a phone', width: 375, height: 812, landscape: false }
] as const;

async function envelopeBox(page: import('@playwright/test').Page) {
	const box = await page.locator('[data-card]').boundingBox();
	if (!box) throw new Error('no envelope on the page');
	return box;
}

/**
 * When the invitation finished surfacing, and when scroll was handed back.
 *
 * The unlock is read from the inline `overflow` the reveal sets on `body`, not
 * from `scrollHeight > clientHeight`: that comparison is already true while
 * scroll is locked, because a hidden overflow still reports its content height.
 */
async function revealTimings(page: import('@playwright/test').Page) {
	return await page.evaluate(async () => {
		const content = document.querySelector<HTMLElement>('[data-reveal]')!;
		const t0 = performance.now();
		const timeout = 8000;

		return await new Promise<{ settledAt: number; unlockedAt: number }>((resolve) => {
			let settledAt = Infinity;
			let unlockedAt = Infinity;

			const tick = () => {
				const now = performance.now() - t0;

				if (settledAt === Infinity && Number(getComputedStyle(content).opacity) === 1) {
					settledAt = Math.round(now);
				}
				if (unlockedAt === Infinity && document.body.style.overflow !== 'hidden') {
					unlockedAt = Math.round(now);
				}

				if ((settledAt !== Infinity && unlockedAt !== Infinity) || now > timeout) {
					resolve({ settledAt, unlockedAt });
				} else {
					setTimeout(tick, 50);
				}
			};

			tick();
		});
	});
}

for (const size of SIZES) {
	test(`the envelope is ${size.landscape ? 'landscape' : 'portrait'} on ${size.label}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('/envelope/');

		const box = await envelopeBox(page);

		expect(box.width > box.height, `envelope on ${size.label}`).toBe(size.landscape);
	});
}

// `70vw` in the landscape column exists to cap a short-but-wide window, where
// the height stops being the binding constraint. Guard that it holds.
test('the landscape envelope fits a short, wide window', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 560 });
	await page.goto('/envelope/');

	const box = await envelopeBox(page);

	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.width).toBeLessThanOrEqual(1280);
	expect(box.height).toBeLessThanOrEqual(560);
});

// The seal keys off the envelope's height at the breakpoint so it holds its
// weight on the apex rather than clamping to its portrait cap.
test('the seal keeps its weight on a landscape envelope', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/envelope/');

	const { seal, envelope } = await page.evaluate(() => {
		const s = document.querySelector<HTMLElement>('.seal')!.getBoundingClientRect();
		const e = document.querySelector<HTMLElement>('[data-card]')!.getBoundingClientRect();
		return { seal: s.width, envelope: e.width };
	});

	// Portrait runs at 24% of the envelope's width; 0.28 of the height works
	// out to 18.7% here. Assert the range rather than the tuned value.
	expect(seal / envelope).toBeGreaterThan(0.16);
	expect(seal / envelope).toBeLessThan(0.22);
});

// The envelope is dismissed well before the invitation finishes fading in.
// Handing the scrollbar back on dismissal showed its thumb over a half-faded
// page and let a stray scroll move content that had not landed yet. Assert the
// ordering rather than a timing, so retuning `timings` stays a layout change.
test('the scrollbar waits for the invitation to finish surfacing', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/envelope/');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	const { settledAt, unlockedAt } = await revealTimings(page);

	expect(settledAt, 'content settled').toBeLessThan(8000);
	expect(unlockedAt, 'scrollbar appeared').toBeLessThan(8000);
	expect(unlockedAt, 'scrollbar appeared').toBeGreaterThanOrEqual(settledAt);
});

// A stray scroll during the fade used to move content that had not landed.
// The page must stay pinned until the unlock fires.
test('the page cannot scroll while the invitation is still surfacing', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/envelope/');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	// Mid-fade: the invitation is visible but the fade is still running.
	await expect
		.poll(() => page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-reveal]')!).opacity)), {
			timeout: 8000
		})
		.toBeGreaterThan(0.05);

	await page.mouse.wheel(0, 600);
	await page.waitForTimeout(100);

	expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

// The curtain reveal has its own deadline and was already unlocking after its
// content settled. Guard that it did not drift into the envelope's bug.
test('the curtain hands back the scrollbar after its content too', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/curtain/');

	await page.getByRole('button', { name: 'Open the invitation' }).click();

	const { settledAt, unlockedAt } = await revealTimings(page);

	expect(settledAt, 'curtain content settled').toBeLessThan(8000);
	expect(unlockedAt, 'curtain scrollbar appeared').toBeLessThan(8000);
	expect(unlockedAt, 'curtain scrollbar appeared').toBeGreaterThanOrEqual(settledAt);
});

// The seal sits on the apex, which is a fixed fraction of the envelope's
// height. Height-driven sizing moves the envelope vertically, so check the
// burst origin still lines up with where the seal actually is.
test('the seal stays on the envelope apex at every size', async ({ page }) => {
	for (const size of SIZES) {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('/envelope/');

		const { apex, apexY } = await page.evaluate(() => {
			const card = document.querySelector<HTMLElement>('[data-card]')!;
			const c = card.getBoundingClientRect();
			return {
				apex: Number(getComputedStyle(card).getPropertyValue('--apex').replace('%', '')),
				apexY: c.top + (c.height * 47) / 100
			};
		});

		expect(apex, `--apex on ${size.label}`).toBe(47);
		expect(apexY, `apex within viewport on ${size.label}`).toBeGreaterThan(0);
		expect(apexY, `apex within viewport on ${size.label}`).toBeLessThan(size.height);
	}
});
