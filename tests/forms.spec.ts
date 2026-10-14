import { expect, test } from '@playwright/test';

/**
 * Spacing between a form label and the control it labels.
 *
 * Driven by injection rather than by clicking through a form, because neither form
 * is reachable on a test build: the RSVP flow needs a successful code lookup and
 * the dashboard needs a signed-in admin account, and this suite runs against a build
 * with the Firebase config blanked on purpose. What is injected is the markup the
 * components actually render, measured against the stylesheet the real build emits —
 * so it fails if the `@utility` stops being generated, which is the failure mode
 * worth catching.
 *
 * What it does not cover is a component dropping the class. Nothing here proves
 * `HouseholdEditor` still says `form-label form-legend`; that is review's job.
 *
 * The defect this pins is specific. A `<legend>` in a `<fieldset>` that is a flex
 * container is the fieldset's *rendered legend*: laid out against the fieldset box
 * rather than as a flex item, so the fieldset's `gap` never reaches it and the
 * distance to the first control collapses to zero — while `gap` still computes
 * correctly, so nothing about the CSS looks wrong. `gap-3` is in the markup below
 * precisely so the test would fail for the original reason.
 */

/** The fieldset and legend exactly as `RsvpFlow` renders them. */
const LEGEND_MARKUP = `
	<fieldset data-probe="legend" class="flex w-full flex-col gap-3">
		<legend class="form-label form-legend">How many of you are coming?</legend>
		<div class="h-11 w-11 rounded-full border border-gold/30"></div>
	</fieldset>
`;

/** The label and input exactly as `AddHousehold` renders them. */
const LABEL_MARKUP = `
	<label data-probe="label" class="flex flex-col gap-2">
		<span class="form-label">Household</span>
		<input class="rounded-full border border-gold/30 px-5 py-3" />
	</label>
`;

async function measure(page: import('@playwright/test').Page, markup: string, probe: string) {
	await page.evaluate(
		([html, selector]) => {
			const host = document.createElement('div');
			host.dataset.probeHost = '1';
			host.className = 'p-8';
			host.innerHTML = html;
			document.body.append(host);
		},
		[markup, probe] as const
	);

	return page.evaluate((selector) => {
		const root = document.querySelector<HTMLElement>(`[data-probe="${selector}"]`)!;
		const label = root.querySelector('legend, span')!;
		const control = root.querySelector('div, input')!;

		const gap = Math.round(
			control.getBoundingClientRect().top - label.getBoundingClientRect().bottom
		);

		root.closest('[data-probe-host]')?.remove();

		return gap;
	}, probe);
}

test.describe('form labels', () => {
	test.beforeEach(async ({ page }) => {
		// Any page will do — this needs the stylesheet, not the content. The RSVP
		// entry screen is the least animated of them.
		await page.goto('/rsvp/');
		await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
	});

	// 8px rather than 12px on purpose. It is well below the 12px `form-legend` sets
	// and so still fails against a legend with no margin at all, which is the
	// regression — but it leaves room for sub-pixel rounding and for a font that
	// reports a slightly larger line box on one platform than another.
	test('leaves room between a legend and its control', async ({ page }) => {
		expect(await measure(page, LEGEND_MARKUP, 'legend')).toBeGreaterThanOrEqual(8);
	});

	// The label side is not broken, only tight, and the same probe keeps the two
	// from drifting apart again.
	test('leaves room between a label and its control', async ({ page }) => {
		expect(await measure(page, LABEL_MARKUP, 'label')).toBeGreaterThanOrEqual(8);
	});

	// A legend and a label should read identically. Anything else means one of the
	// two utilities has drifted from the other, which is the only reason they are
	// defined separately.
	test('spaces a legend the same as a label', async ({ page }) => {
		const legend = await measure(page, LEGEND_MARKUP, 'legend');
		const label = await measure(page, LABEL_MARKUP, 'label');

		expect(legend).toBe(label);
	});
});