import type { Auth, User } from 'firebase/auth';
import { getApp, isAuthConfigured } from './app';
import type { AdminUser, AuthDriver } from '../admin/auth.driver';
import { describeAuthError } from '../admin/auth.driver';

/**
 * The Firebase Auth binding.
 *
 * Every `firebase/auth` import is dynamic and there is no static value import of
 * it anywhere, for the same reason `firebase.client.ts` does the same: the admin
 * route must not drag the Auth SDK into the bundle of a guest reading an
 * invitation.
 *
 * Note there is no `setPersistence` call, and that is a correction rather than an
 * omission. `browserLocalPersistence` is already the web default, so the call
 * bought nothing — and running it from `auth()`, which resolves on mount while a
 * redirect result may still be in the URL, is a race against the very thing it
 * was supposed to protect.
 */
let instance: Promise<Auth> | null = null;

function auth(): Promise<Auth> {
	instance ??= (async () => {
		const app = await getApp();
		const { getAuth } = await import('firebase/auth');

		return getAuth(app);
	})();

	return instance;
}

/**
 * Logs every failure with its raw Firebase code before anything turns it into
 * friendly copy.
 *
 * Present because of how long a silent failure here cost: `describeAuthError`
 * collapses anything unmapped to "Sign-in failed. Please try again.", and without
 * this on the console every diagnosis had to be inferred from network traffic.
 * The code is the fact; the sentence is the translation.
 */
function report(operation: string, error: unknown): unknown {
	console.error(
		`[admin-auth] ${operation} failed:`,
		(error as { code?: string } | null)?.code ?? '(no code)',
		error
	);

	return error;
}

function toAdminUser(user: User | null): AdminUser | null {
	if (!user) return null;

	return { uid: user.uid, email: user.email, displayName: user.displayName };
}

/** Errors that mean "the popup path is unusable, use a redirect instead". */
const FALL_BACK_TO_REDIRECT = new Set(['auth/popup-redirect-fallback', 'auth/popup-blocked']);

export function createAuthDriver(): AuthDriver {
	return {
		subscribe(onChange) {
			// Nothing to listen to. Report signed-out rather than throwing inside the
			// async IIFE below, where it would surface as an unhandled rejection
			// instead of a page that can explain itself.
			if (!isAuthConfigured()) {
				onChange(null);
				return () => {};
			}

			// `onAuthStateChanged` needs the instance, which needs an await, so the
			// listener cannot be attached synchronously — but the caller expects a
			// detach function right now. These two flags cover the window where the
			// caller unsubscribes before the SDK has loaded.
			let detached = false;
			let stop: (() => void) | null = null;

			void (async () => {
				const { onAuthStateChanged } = await import('firebase/auth');
				const unsubscribe = onAuthStateChanged(await auth(), (user) => {
					if (!detached) onChange(toAdminUser(user));
				});

				if (detached) unsubscribe();
				else stop = unsubscribe;
			})();

			return () => {
				detached = true;
				stop?.();
			};
		},

		async resume() {
			const { getRedirectResult } = await import('firebase/auth');

			// Only the redirect fallback leaves a result pending. Resolves to null
			// otherwise, which is the common case.
			await getRedirectResult(await auth());
		},

		/**
		 * Popup first, redirect as a fallback.
		 *
		 * Popup is the default because the redirect flow's last hop hands the
		 * credential back across an origin boundary, which depends on storage on the
		 * auth domain surviving the trip. Browsers block that under their
		 * cross-site cookie restrictions. A popup transfers the result to the opener
		 * with `postMessage` and does not depend on it.
		 *
		 * Redirect is kept as the fallback rather than dropped, because popups are
		 * the flakier of the two on iOS Safari — which matters when the couple opens
		 * this on a phone. Both `popup-redirect-fallback` (the SDK asking us to
		 * switch) and `popup-blocked` (the user blocked it) route there.
		 */
		async signIn() {
			const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
				await import('firebase/auth');

			const provider = new GoogleAuthProvider();
			const instance = await auth();

			try {
				await signInWithPopup(instance, provider);
			} catch (error) {
				const code = (error as { code?: string } | null)?.code ?? '';

				if (!FALL_BACK_TO_REDIRECT.has(code)) {
					throw report('signIn', error);
				}

				console.warn(`[admin-auth] ${code} — falling back to a redirect`);

				try {
					await signInWithRedirect(instance, provider);
				} catch (fallbackError) {
					throw report('signIn (redirect fallback)', fallbackError);
				}
			}
		},

		async signOut() {
			const { signOut } = await import('firebase/auth');

			try {
				await signOut(await auth());
			} catch (error) {
				throw report('signOut', error);
			}
		},

		async refresh() {
			// `true` forces the network round trip. Without it a freshly granted
			// custom claim stays invisible and the dashboard keeps refusing someone
			// who has, in fact, been made an admin.
			try {
				await (await auth()).currentUser?.getIdToken(true);
			} catch (error) {
				throw report('refresh', error);
			}
		},

		describe(error: unknown): string {
			const described = describeAuthError(error);

			if (!described) return '';

			// Unmapped codes are worth seeing even when the message is generic.
			const code = (error as { code?: string } | null)?.code ?? '';
			if (code && !MAPPED_CODES.has(code)) console.warn(`[admin-auth] unmapped code:`, code);

			return described;
		}
	};
}

/** Codes `describeAuthError` has something specific to say about. */
const MAPPED_CODES = new Set([
	'auth/unauthorized-domain',
	'auth/operation-not-allowed',
	'auth/network-request-failed',
	'auth/too-many-requests',
	'auth/popup-blocked',
	'auth/cancelled-popup-request',
	'auth/user-cancelled',
	'auth/popup-closed-by-user'
]);