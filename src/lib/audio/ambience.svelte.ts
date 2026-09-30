import { browser } from '$app/environment';
import { base } from '$app/paths';

const TARGET_VOLUME = 0.34;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 450;

class Ambience {
	#el: HTMLAudioElement | null = null;
	#raf = 0;
	#pauseTimer: ReturnType<typeof setTimeout> | null = null;

	/** true while the track is audible */
	playing = $state(false);
	/** true once the guest has interacted — gates every play() attempt */
	unlocked = $state(false);

	#ensure(): HTMLAudioElement {
		if (this.#el) return this.#el;

		// `base` is `''` on a custom domain, so this resolves to the same
		// root-relative URL it always was. Prefixed anyway: a hardcoded root path is
		// the one thing that silently 404s if this ever moves under a subpath, and
		// it would take an audit rather than a grep to find. `base` is a build-time
		// constant, so this costs nothing.
		const el = new Audio(`${base}/audio/ambience.m4a`);
		// No loop: the track plays once and stays silent. Replaying is the guest's
		// choice via the toggle, not something that happens on its own.
		el.preload = 'none';
		el.volume = 0;
		el.addEventListener('ended', () => {
			// Park the element at silence so a later play() always fades in from
			// 0, and reflect the finished state in the toggle.
			cancelAnimationFrame(this.#raf);
			el.volume = 0;
			this.playing = false;
		});
		// Older WebKit is markedly more reliable when the element is in the document.
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
			// cubicInOut, mirroring --ease-silk
			const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
			// Clamp to [0, 1]. Floating-point error on the tail of the curve produced
			// values like -2.48e-9, and assigning a negative volume throws
			// IndexSizeError, which surfaced as an uncaught exception mid-reveal.
			el.volume = Math.min(1, Math.max(0, from + (to - from) * k));
			if (t < 1) this.#raf = requestAnimationFrame(step);
		};
		this.#raf = requestAnimationFrame(step);
	}

	/**
	 * MUST stay synchronous up to the `el.play()` call: it has to happen inside
	 * the user-gesture task or the browser's autoplay policy rejects it.
	 * Nothing else in the app is allowed to call this — a returning guest is
	 * deliberately never auto-resumed.
	 */
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
