import confetti from 'canvas-confetti';

const GOLD = ['#d4af37', '#e3d0ae', '#a8852a', '#c9a227'];
const PETAL = ['#ead3cb', '#e3d0ae', '#c08a6b'];

/**
 * Three-stage burst fired from the centre seam as the wax seal breaks:
 * a core spray straight up, then two angled "door" cannons from the panel edges.
 * zIndex 120 keeps the canvas above the curtain overlay (z-50).
 *
 * Warm tones only — a plain white in the mix reads as generic party confetti
 * rather than gold leaf, which is the whole point of the palette.
 */
export function sealBurst(enabled = true) {
	if (!enabled) return;

	confetti({
		particleCount: 34,
		spread: 62,
		startVelocity: 32,
		decay: 0.93,
		gravity: 0.85,
		origin: { y: 0.48 },
		colors: GOLD,
		shapes: ['circle', 'square'],
		scalar: 0.7,
		ticks: 190,
		zIndex: 120,
		disableForReducedMotion: true
	});

	setTimeout(() => {
		confetti({
			particleCount: 16,
			angle: 62,
			spread: 52,
			origin: { x: 0, y: 0.6 },
			colors: GOLD,
			disableForReducedMotion: true
		});
		confetti({
			particleCount: 16,
			angle: 118,
			spread: 52,
			origin: { x: 1, y: 0.6 },
			colors: PETAL,
			disableForReducedMotion: true
		});
	}, 210);
}
