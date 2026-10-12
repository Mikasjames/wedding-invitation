import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scriptFonts, systemFonts } from './fonts';

const fonts = [...systemFonts, ...scriptFonts];

/**
 * Every face the site sets copy in, whether it ships on every page or only on
 * the specimen sheet. A manifest entry with no matching import is a silent
 * failure: the specimen just falls back to the serif stack.
 */
const cssSources = ['../../app.css', '../fonts.css'].map((path) =>
	readFileSync(new URL(path, import.meta.url), 'utf8')
);

/** `Cormorant Garamond Variable` ships as `@fontsource-variable/cormorant-garamond`. */
function packageSlug(family: string): string {
	return family
		.replace(/\s+Variable$/, '')
		.toLowerCase()
		.replace(/\s+/g, '-');
}

describe('font manifest', () => {
	it('lists no duplicate families', () => {
		expect(new Set(fonts.map((f) => f.family)).size).toBe(fonts.length);
	});

	it('describes every face', () => {
		for (const font of fonts) {
			expect(font.label.length, font.family).toBeGreaterThan(0);
			expect(font.note.length, font.family).toBeGreaterThan(0);
		}
	});

	it('backs every face with an @import', () => {
		for (const font of fonts) {
			const slug = packageSlug(font.family);
			const imported = cssSources.some((css) =>
				css.includes(`@fontsource/${slug}/`) || css.includes(`@fontsource-variable/${slug}/`)
			);
			expect(imported, `${font.family} has no @import in app.css or fonts.css`).toBe(true);
		}
	});

	it('marks exactly one script face as the hero names', () => {
		const inUse = scriptFonts.filter((f) => f.usage === 'hero names');
		expect(inUse).toHaveLength(1);
		expect(inUse[0].family).toBe('Pinyon Script');
	});
});
