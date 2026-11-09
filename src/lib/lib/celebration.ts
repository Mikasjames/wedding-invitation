/**
 * Which decorative effect plays when a reveal is opened.
 *
 * The point of this module is that the effect is a value, not a branch buried
 * in the reveal components. Swapping `DEFAULT_CELEBRATION` changes every
 * reveal, and `?celebrate=` overrides it per page load so the alternatives can
 * be compared on a real device without a rebuild.
 *
 * Everything here is pure so it can be unit tested without a browser.
 */

export type CelebrationKind = 'seal' | 'confetti' | 'none';

/**
 * How much of the effect to render. `reduced` is the low-end tier: the bloom
 * and a handful of wax shards, but no ripple or dust.
 */
export type CelebrationTier = 'full' | 'reduced' | 'none';

export interface CelebrationInput {
	/** `prefers-reduced-motion: reduce`. */
	reducedMotion: boolean;
	/** Very constrained hardware, from `isLowEnd()`. */
	lowEnd: boolean;
	/** Device budget for canvas work, from `confettiScale()`. */
	confettiScale: number;
}

export interface ResolvedCelebration {
	kind: CelebrationKind;
	tier: CelebrationTier;
	/** Particle budget; only meaningful for the confetti effect. */
	scale: number;
}

/**
 * The effect every reveal uses unless it is overridden. Change this one line
 * to `'confetti'` to put the previous burst back, or to `'none'` to turn the
 * celebration off entirely.
 */
export const DEFAULT_CELEBRATION: CelebrationKind = 'seal';

export const CELEBRATION_KINDS = ['seal', 'confetti', 'none'] as const;

export function resolveCelebration(
	kind: CelebrationKind,
	{ reducedMotion, lowEnd, confettiScale }: CelebrationInput
): ResolvedCelebration {
	if (kind === 'none' || reducedMotion) {
		return { kind: 'none', tier: 'none', scale: 0 };
	}

	if (kind === 'confetti') {
		if (confettiScale <= 0) return { kind: 'none', tier: 'none', scale: 0 };
		return { kind: 'confetti', tier: 'full', scale: confettiScale };
	}

	return {
		kind: 'seal',
		// The CSS effect is cheap enough to keep on low-end devices, just with
		// fewer shards and no dust. Dropping it entirely makes the seal feel dead.
		tier: lowEnd ? 'reduced' : 'full',
		scale: 1
	};
}

/**
 * Read the `?celebrate=seal|confetti|none` override. Unknown values fall back
 * to the configured default, so a stale link cannot break the reveal.
 */
export function celebrationFromSearch(
	search: string,
	fallback: CelebrationKind = DEFAULT_CELEBRATION
): CelebrationKind {
	const value = new URLSearchParams(search).get('celebrate');
	return value && (CELEBRATION_KINDS as readonly string[]).includes(value)
		? (value as CelebrationKind)
		: fallback;
}
