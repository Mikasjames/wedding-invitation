/**
 * Curtain state, in memory only.
 *
 * There is deliberately no persistence here. An earlier version recorded the
 * opened state in `sessionStorage` so a returning guest would not sit through the
 * reveal twice — and because the key was read at module-evaluation time, before
 * hydration, a reload usually skipped the curtain.
 *
 * That is gone on purpose: the curtain now plays on every reload, so this state
 * starts closed each time and is thrown away with the tab.
 *
 * A useful side effect: because there is no storage to read, the server-rendered
 * curtain and the client's initial state can no longer disagree. The old
 * prerendered HTML baked in the *closed* curtain while the module flipped to
 * `opened` for a returning guest, which raced first paint and could flash rose
 * on a slow load. Both sides now agree on "closed" unconditionally.
 */
export const reveal = $state({ opened: false });

/**
 * Flips the curtain open. Called from the seal's click handler — the single
 * place user activation is available, which is what unlocks audio.
 */
export function openInvite() {
	reveal.opened = true;
}
