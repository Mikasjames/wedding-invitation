import { browser } from '$app/environment';

const KEY = 'wedding-invite:opened';

/**
 * Read at module-evaluation time on purpose. The module is evaluated when the
 * client bundle loads — i.e. before SvelteKit hydrates — so a returning guest
 * never sees a flash of the curtain on reload.
 */
function read(): boolean {
	if (!browser) return false;
	try {
		return sessionStorage.getItem(KEY) === '1';
	} catch {
		// Safari private mode / storage disabled
		return false;
	}
}

export const reveal = $state({ opened: read() });

/**
 * Flips the curtain open for good. Called from the seal's click handler —
 * the single place user activation is available, which is what unlocks audio.
 */
export function openInvite() {
	reveal.opened = true;
	if (browser) {
		try {
			sessionStorage.setItem(KEY, '1');
		} catch {
			// Non-fatal: the curtain still opens, it just reappears on reload.
		}
	}
}
