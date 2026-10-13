import type { Auth, User } from 'firebase/auth';
import { getApp } from './app';
import type { AdminUser, AuthDriver } from '../admin/auth.driver';
import { describeAuthError } from '../admin/auth.driver';

/**
 * The Firebase Auth binding.
 *
 * Every `firebase/auth` import is dynamic and there is no static value import of
 * it anywhere, for the same reason `firebase.client.ts` does the same: the admin
 * route must not drag the Auth SDK into the bundle of a guest reading an
 * invitation.
 */
let instance: Promise<Auth> | null = null;

function auth(): Promise<Auth> {
	instance ??= (async () => {
		const app = await getApp();
		const { browserLocalPersistence, getAuth, setPersistence } = await import('firebase/auth');

		const created = getAuth(app);

		// Explicit, though it is already the default for web. "Stay signed in"
		// should be a decision rather than an accident, and a refusal is not fatal
		// — the session simply will not outlive the tab.
		try {
			await setPersistence(created, browserLocalPersistence);
		} catch {
			// Third-party cookie blocking makes this throw on some browsers.
		}

		return created;
	})();

	return instance;
}

function toAdminUser(user: User | null): AdminUser | null {
	if (!user) return null;

	return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export function createAuthDriver(): AuthDriver {
	return {
		subscribe(onChange) {
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

			// Resolves to null when nothing is pending, which is the common case.
			// Throws when a redirect was abandoned or failed, which `describe()`
			// turns into something the page can show.
			await getRedirectResult(await auth());
		},

		async signIn() {
			const { GoogleAuthProvider, signInWithRedirect } = await import('firebase/auth');

			// Redirect rather than popup. A popup needs manual
			// `auth/popup-redirect-fallback` wiring that shifts between SDK
			// versions, and it breaks outright where third-party cookies are blocked
			// — which, for an admin page used by two or three people on desktop,
			// buys nothing in exchange for a class of failure that is annoying to
			// diagnose and impossible to reproduce locally.
			await signInWithRedirect(await auth(), new GoogleAuthProvider());
		},

		async signOut() {
			const { signOut } = await import('firebase/auth');
			await signOut(await auth());
		},

		async refresh() {
			// `true` forces the network round trip. Without it a freshly granted
			// custom claim stays invisible and the dashboard keeps refusing someone
			// who has, in fact, been made an admin.
			await (await auth()).currentUser?.getIdToken(true);
		},

		describe: describeAuthError
	};
}