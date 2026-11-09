import { describe, expect, it } from 'vitest';
import {
	celebrationFromSearch,
	celebrationSpeedFromSearch,
	DEFAULT_CELEBRATION,
	DEFAULT_CELEBRATION_SPEED,
	resolveCelebration,
	type CelebrationInput
} from './celebration';

const capable: CelebrationInput = {
	reducedMotion: false,
	lowEnd: false,
	confettiScale: 1
};

describe('resolveCelebration', () => {
	it('renders the full seal effect on capable hardware', () => {
		expect(resolveCelebration('seal', capable)).toEqual({
			kind: 'seal',
			tier: 'full',
			scale: 1
		});
	});

	// The CSS burst is cheap enough to keep on constrained devices; it just
	// drops the ripple and dust rather than going dark.
	it('trims the seal effect on low-end hardware', () => {
		expect(resolveCelebration('seal', { ...capable, lowEnd: true, confettiScale: 0 })).toEqual({
			kind: 'seal',
			tier: 'reduced',
			scale: 1
		});
	});

	it('keeps the confetti scale for the canvas effect', () => {
		expect(resolveCelebration('confetti', { ...capable, confettiScale: 0.6 })).toEqual({
			kind: 'confetti',
			tier: 'full',
			scale: 0.6
		});
	});

	it('disables confetti when the device budget is zero', () => {
		expect(resolveCelebration('confetti', { ...capable, confettiScale: 0 }).kind).toBe('none');
	});

	it('honours reduced motion over any configured effect', () => {
		for (const kind of ['seal', 'confetti'] as const) {
			expect(resolveCelebration(kind, { ...capable, reducedMotion: true })).toEqual({
				kind: 'none',
				tier: 'none',
				scale: 0
			});
		}
	});

	it('leaves an explicit none alone', () => {
		expect(resolveCelebration('none', capable).kind).toBe('none');
	});
});

describe('celebrationFromSearch', () => {
	it('accepts the supported overrides', () => {
		expect(celebrationFromSearch('?celebrate=none')).toBe('none');
		expect(celebrationFromSearch('?celebrate=confetti')).toBe('confetti');
		expect(celebrationFromSearch('?celebrate=seal&foo=bar')).toBe('seal');
	});

	it('falls back on a missing or unknown value', () => {
		expect(celebrationFromSearch('')).toBe(DEFAULT_CELEBRATION);
		expect(celebrationFromSearch('?celebrate=fireworks')).toBe(DEFAULT_CELEBRATION);
		expect(celebrationFromSearch('?celebrate=seal', 'none')).toBe('seal');
		expect(celebrationFromSearch('', 'none')).toBe('none');
	});
});

describe('celebrationSpeedFromSearch', () => {
	it('reads a decimal multiplier', () => {
		expect(celebrationSpeedFromSearch('?celebrateSpeed=1.25')).toBe(1.25);
		expect(celebrationSpeedFromSearch('?celebrateSpeed=1')).toBe(1);
	});

	// The clamp keeps a hand-edited URL from turning the burst into a slideshow.
	it('clamps values to the safe range', () => {
		expect(celebrationSpeedFromSearch('?celebrateSpeed=4')).toBe(1.5);
		expect(celebrationSpeedFromSearch('?celebrateSpeed=0.1')).toBe(0.75);
	});

	it('falls back on a missing or invalid value', () => {
		expect(celebrationSpeedFromSearch('')).toBe(DEFAULT_CELEBRATION_SPEED);
		expect(celebrationSpeedFromSearch('?celebrateSpeed=fast')).toBe(DEFAULT_CELEBRATION_SPEED);
		expect(celebrationSpeedFromSearch('', 1.3)).toBe(1.3);
	});
});
