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

/**
 * How much slower the CSS burst plays than its authored timings. The effect is
 * compositor-only, so slowing it does not reduce per-frame cost; it only makes
 * each frame travel less, which reads as smoother on a weak display. Kept
 * small enough that the burst still clears the envelope's letter phase.
 */
export const DEFAULT_CELEBRATION_SPEED = 1.15;

const MIN_CELEBRATION_SPEED = 0.75;
const MAX_CELEBRATION_SPEED = 1.5;

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

/**
 * Read the `?celebrateSpeed=1.25` override for A/B testing the pacing. Values
 * outside the safe range are clamped; non-numeric values fall back.
 */
export function celebrationSpeedFromSearch(
	search: string,
	fallback: number = DEFAULT_CELEBRATION_SPEED
): number {
	const raw = new URLSearchParams(search).get('celebrateSpeed');
	if (raw === null || raw.trim() === '') return fallback;

	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;

	return Math.min(MAX_CELEBRATION_SPEED, Math.max(MIN_CELEBRATION_SPEED, value));
}
