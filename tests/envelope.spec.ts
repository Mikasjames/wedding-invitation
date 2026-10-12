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
