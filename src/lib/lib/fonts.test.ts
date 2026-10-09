import { describe, expect, it } from 'vitest';
import { scriptFonts, systemFonts } from './fonts';

const fonts = [...systemFonts, ...scriptFonts];

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

	it('marks exactly one script face as the hero names', () => {
		const inUse = scriptFonts.filter((f) => f.usage === 'hero names');
		expect(inUse).toHaveLength(1);
		expect(inUse[0].family).toBe('Pinyon Script');
	});
});
