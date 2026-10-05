import { browser } from '$app/environment';
import { base } from '$app/paths';

const TARGET_VOLUME = 0.34;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 450;

class Ambience {
	#el: HTMLAudioElement | null = null;
	#raf = 0;
	#pauseTimer: ReturnType<typeof setTimeout> | null = null;

	playing = $state(false);
	unlocked = $state(false);

	#ensure(): HTMLAudioElement {
		if (this.#el) return this.#el;

		const el = new Audio(`${base}/audio/ambience.m4a`);
		el.preload = 'none';
		el.volume = 0;
		el.addEventListener('ended', () => {
			cancelAnimationFrame(this.#raf);
			el.volume = 0;
			this.playing = false;
		});
		document.body.append(el);

		this.#el = el;
		return el;
	}

	#fade(to: number, ms: number) {
		const el = this.#el;
		if (!el) return;
		cancelAnimationFrame(this.#raf);
		const from = el.volume;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min((now - start) / ms, 1);
			const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
			el.volume = Math.min(1, Math.max(0, from + (to - from) * k));
			if (t < 1) this.#raf = requestAnimationFrame(step);
		};
		this.#raf = requestAnimationFrame(step);
	}

	async play() {
		if (!browser) return;
		const el = this.#ensure();
		this.unlocked = true;
		try {
			await el.play();
		} catch (err) {
			console.warn('[ambience] playback blocked', err);
			return;
		}
		this.playing = true;
		this.#fade(TARGET_VOLUME, FADE_IN_MS);
	}

	async toggle() {
		if (this.#pauseTimer) {
			clearTimeout(this.#pauseTimer);
			this.#pauseTimer = null;
		}

		if (!this.playing) return this.play();

		const el = this.#el;
		this.playing = false;
		this.#fade(0, FADE_OUT_MS);
		this.#pauseTimer = setTimeout(() => el?.pause(), FADE_OUT_MS + 20);
	}
}

export const ambience = new Ambience();
