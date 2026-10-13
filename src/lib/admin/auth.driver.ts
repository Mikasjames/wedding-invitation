/**
 * What the admin session needs from an authentication backend.
 *
 * Separate from the Firebase binding so `auth.svelte.ts` can be tested with a
 * fake, exactly as `RsvpFlow` is tested against an injected `RsvpBackend`. No
 * Firebase import appears in this file, which is the point.
 */

/**
 * The subset of a Firebase user the dashboard renders.
 *
 * Deliberately not the SDK's `User`. Nothing here needs `getIdTokenResult` or a
 * provider id, and handing a narrower shape around means the session cannot grow
 * an accidental dependency on credential material.
 */
export interface AdminUser {
	uid: string;
	email: string | null;
	displayName: string | null;
}

export interface AuthDriver {
	/**
	 * Reports the signed-in user, now and on every change. Returns a function that
	 * detaches the listener.
	 *
	 * Must fire once on subscribe even when nobody is signed in — that first call
	 * is what moves the session out of its "still resolving" state.
	 */
	subscribe(onChange: (user: AdminUser | null) => void): () => void;

	/**
	 * Settles a redirect left pending by a previous page load.
	 *
	 * Called once on mount. Without it, a sign-in the user abandoned half-way is a
	 * silent no-op and the page just sits there looking signed out with no way to
	 * tell what happened.
	 */
	resume(): Promise<void>;

	/** Starts sign-in. Navigates away on success, so this rarely resolves. */
	signIn(): Promise<void>;

	signOut(): Promise<void>;

	/**
	 * Re-mints the ID token, discarding the cached one.
	 *
	 * This is the whole reason `refresh()` exists. A custom claim granted by
	 * `scripts/set-admin.mjs` while somebody was already signed in does not appear
	 * in their token until it is refreshed, so a fourth admin would be refused by
	 * the rules and told to try again, forever, unless something forces a refresh.
	 */
	refresh(): Promise<void>;

	/** Turns a backend failure into something worth showing a human. */
	describe(error: unknown): string;
}

/**
 * Firebase Auth error codes, in the words that will actually help.
 *
 * `auth/unauthorized-domain` leads because it is the single most likely first
 * failure and its default message ("operation not allowed") sends people
 * looking in entirely the wrong place.
 */
export function describeAuthError(error: unknown): string {
	const code = (error as { code?: string } | null)?.code ?? '';

	switch (code) {
		case 'auth/unauthorized-domain':
			return 'This site is not an authorised domain for the Firebase project. Add it under Authentication → Settings → Authorized domains.';

		case 'auth/operation-not-allowed':
			return 'Google sign-in is not switched on for this Firebase project. Turn on the Google provider under Authentication → Sign-in method.';

		case 'auth/network-request-failed':
			return 'Could not reach Firebase. Check your connection and try again.';

		case 'auth/too-many-requests':
			return 'Too many attempts. Wait a moment and try again.';

		case 'auth/popup-blocked':
			return 'Your browser blocked the sign-in window. Allow popups for this site, or turn off blocking extensions.';

		// The user closed the window or navigated back. Nothing went wrong, and
		// showing an error for it would be accusing them of something they didn't do.
		case 'auth/cancelled-popup-request':
		case 'auth/user-cancelled':
		case 'auth/popup-closed-by-user':
			return '';

		default:
			return 'Sign-in failed. Please try again.';
	}
}