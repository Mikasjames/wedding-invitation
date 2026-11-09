/**
 * Coarse device-capability helpers used to scale or drop decorative work on
 * low-end hardware. These are intentionally conservative heuristics, not
 * benchmarks: they only read static navigator hints.
 */

function readCores(): number {
	if (typeof navigator === 'undefined') return 8;
	return navigator.hardwareConcurrency ?? 8;
}

function readMemory(): number {
	if (typeof navigator === 'undefined') return 8;
	const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
	return typeof memory === 'number' && memory > 0 ? memory : 8;
}

/** True for very constrained devices where heavy decoration should be dropped. */
export function isLowEnd(): boolean {
	const cores = readCores();
	const memory = readMemory();
	return cores <= 2 || memory <= 2;
}

/**
 * Scale factor for non-essential effects such as confetti. Returns 0 to
 * disable them entirely on the weakest devices.
 */
export function confettiScale(): number {
	const cores = readCores();
	const memory = readMemory();
	if (cores <= 2 || memory <= 2) return 0;
	if (cores <= 4 || memory <= 4) return 0.6;
	return 1;
}