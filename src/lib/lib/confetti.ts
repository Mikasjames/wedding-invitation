import confetti from 'canvas-confetti';

const GOLD = ['#ddc9b4', '#cdb59b', '#c4c6cd', '#ebded5'];
const PETAL = ['#9ba3ac', '#c4c6cd', '#74838f'];

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

/**
 * Wait two frames before building the confetti canvas, so the reveal's first
 * paint is not queued behind canvas-confetti's setup and first draw. Returns a
 * cancel function; calling sealBurst synchronously here added ~20ms to the
 * click task at 6x CPU throttle.
 */
export function deferredSealBurst(enabled = true): () => void {
	if (!enabled) return () => {};

	let frame = requestAnimationFrame(() => {
		frame = requestAnimationFrame(() => sealBurst());
	});

	return () => cancelAnimationFrame(frame);
}
