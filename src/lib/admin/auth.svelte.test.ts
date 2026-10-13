import { describe, expect, it } from 'vitest';
import type { AdminUser, AuthDriver } from './auth.driver';
import { describeAuthError } from './auth.driver';
import { AdminSession } from './auth.svelte';

function authError(code: string): Error {
	return Object.assign(new Error(code), { code });
}

const MICA = { uid: 'u1', email: 'mikasjames@gmail.com', displayName: 'Mika' };

/**
 * Stands in for Firebase Auth.
 *
 * Fires synchronously on subscribe rather than on a microtask, which Firebase
 * does not: the session's handling of the *second* and later calls is what these
 * tests are about, and an async first call would only make every assertion
 * noisier without testing anything the session has to handle.
 */
class FakeDriver implements AuthDriver {
	user: AdminUser | null = null;
	signInError: Error | null = null;
	signOutError: Error | null = null;
	resumeError: Error | null = null;
	refreshError: Error | null = null;

	refreshCalls = 0;
	signOutCalls = 0;
	activeSubscriptions = 0;

	#listeners = new Set<(user: AdminUser | null) => void>();

	subscribe(onChange: (user: AdminUser | null) => void): () => void {
		this.#listeners.add(onChange);
		this.activeSubscriptions += 1;
		onChange(this.user);

		return () => {
			this.#listeners.delete(onChange);
			this.activeSubscriptions -= 1;
		};
	}

	async resume(): Promise<void> {
		if (this.resumeError) throw this.resumeError;
	}

	async signIn(): Promise<void> {
		if (this.signInError) throw this.signInError;
	}

	async signOut(): Promise<void> {
		this.signOutCalls += 1;
		if (this.signOutError) throw this.signOutError;
	}

	async refresh(): Promise<void> {
		this.refreshCalls += 1;
		if (this.refreshError) throw this.refreshError;
	}

	describe: (error: unknown) => string = describeAuthError;

	/** Stands in for the user signing in somewhere else — another tab, say. */
	emit(user: AdminUser | null): void {
		this.user = user;

		for (const listener of [...this.#listeners]) listener(user);
	}
}

function setup(driver = new FakeDriver()) {
	return { driver, session: new AdminSession(driver) };
}

describe('AdminSession.start', () => {
	// Before the backend answers, `signedIn` has to be false. Relying on `user`
	// alone would flash the signed-out state at somebody who is signed in.
	it('is not ready until the backend reports', () => {
		const { session } = setup();

		expect(session.ready).toBe(false);
		expect(session.signedIn).toBe(false);
		expect(session.user).toBeNull();
	});

	it('becomes ready and signed out when nobody is signed in', () => {
		const { session } = setup();

		session.start();

		expect(session.ready).toBe(true);
		expect(session.signedIn).toBe(false);
	});

	it('reports a signed-in user', () => {
		const { driver, session } = setup();
		driver.emit(MICA);

		session.start();

		expect(session.user).toEqual(MICA);
		expect(session.signedIn).toBe(true);
		expect(session.label).toBe('Mika');
	});

	it('follows a sign-out', () => {
		const { driver, session } = setup();
		driver.emit(MICA);
		session.start();

		driver.emit(null);

		expect(session.user).toBeNull();
		expect(session.signedIn).toBe(false);
	});

	it('falls back through name, email, then uid for a label', () => {
		const { driver, session } = setup();
		driver.emit({ uid: 'u2', email: 'guest@example.com', displayName: null });
		session.start();

		expect(session.label).toBe('guest@example.com');

		driver.emit({ uid: 'u3', email: null, displayName: null });

		expect(session.label).toBe('u3');
	});

	it('detaches on the returned disposer', () => {
		const { driver, session } = setup();
		const detach = session.start();

		detach();
		driver.emit(MICA);

		expect(session.user).toBeNull();
		expect(driver.activeSubscriptions).toBe(0);
	});

	// A remount must not leave the previous listener feeding a discarded session,
	// which would keep a signed-out session's state alive forever.
	it('drops the previous listener when started twice', () => {
		const { driver, session } = setup();

		session.start();
		session.start();

		expect(driver.activeSubscriptions).toBe(1);
	});

	it('clears a stale error when started again', async () => {
		const { driver, session } = setup();
		driver.signInError = authError('auth/operation-not-allowed');

		await session.signIn();
		expect(session.error).not.toBeNull();

		session.start();

		expect(session.error).toBeNull();
	});
});

describe('AdminSession.signIn', () => {
	it('does nothing while already busy', async () => {
		const { driver, session } = setup();
		driver.signInError = null;

		const first = session.signIn();
		await session.signIn();
		await first;

		expect(session.busy).toBe(false);
	});

	it('clears busy whether it succeeds or fails', async () => {
		const driver = new FakeDriver();
		const session = new AdminSession(driver);

		await session.signIn();
		expect(session.busy).toBe(false);

		driver.signInError = authError('auth/operation-not-allowed');
		await session.signIn();

		expect(session.busy).toBe(false);
	});

	// The most likely first failure, and the one whose default message points
	// people at entirely the wrong setting.
	it('explains an unauthorised domain', async () => {
		const { driver, session } = setup();
		driver.signInError = authError('auth/unauthorized-domain');

		await session.signIn();

		expect(session.error).toContain('Authorized domains');
	});

	it('explains a disabled Google provider', async () => {
		const { driver, session } = setup();
		driver.signInError = authError('auth/operation-not-allowed');

		await session.signIn();

		expect(session.error).toContain('Sign-in method');
	});

	it('clears a previous error before trying again', async () => {
		const { driver, session } = setup();
		driver.signInError = authError('auth/operation-not-allowed');
		await session.signIn();

		driver.signInError = null;
		await session.signIn();

		expect(session.error).toBeNull();
	});
});

describe('AdminSession.signOut', () => {
	it('delegates to the driver', async () => {
		const { driver, session } = setup();

		await session.signOut();

		expect(driver.signOutCalls).toBe(1);
	});

	it('reports a failure rather than silently doing nothing', async () => {
		const { driver, session } = setup();
		driver.signOutError = authError('auth/network-request-failed');

		await session.signOut();

		expect(session.error).not.toBeNull();
		expect(session.busy).toBe(false);
	});
});

describe('AdminSession.refresh', () => {
	// The reason this exists. A custom claim granted by set-admin.mjs does not
	// reach an already-issued token, so without a forced refresh the rules keep
	// refusing somebody the couple has just made an admin, forever.
	it('forces the token to be re-minted', async () => {
		const { driver, session } = setup();

		await session.refresh();
		await session.refresh();

		expect(driver.refreshCalls).toBe(2);
	});

	it('reports a failure', async () => {
		const { driver, session } = setup();
		driver.refreshError = authError('auth/network-request-failed');

		await session.refresh();

		expect(session.error).not.toBeNull();
	});
});

describe('AdminSession.resume', () => {
	it('settles a redirect without complaint when nothing is pending', async () => {
		const { session } = setup();

		await session.resume();

		expect(session.error).toBeNull();
	});

	it('surfaces a redirect the user abandoned', async () => {
		const { driver, session } = setup();
		driver.resumeError = authError('auth/network-request-failed');

		await session.resume();

		expect(session.error).not.toBeNull();
	});
});

describe('describeAuthError', () => {
	it('names the setting to open for an unauthorised domain', () => {
		expect(describeAuthError(authError('auth/unauthorized-domain'))).toMatch(/Authorized domains/);
	});

	it('says something for an unrecognised code rather than leaking it', () => {
		const message = describeAuthError(authError('auth/some-future-code'));

		expect(message).toBeTruthy();
		expect(message).not.toContain('auth/some-future-code');
	});

	it('copes with something that is not an error at all', () => {
		expect(describeAuthError(undefined)).toBeTruthy();
		expect(describeAuthError(null)).toBeTruthy();
		expect(describeAuthError('a string')).toBeTruthy();
	});

	// Backing out of the Google window is not an error, and saying it is accuses
	// the user of something they did not do.
	it('treats a dismissal as no message at all', () => {
		for (const code of [
			'auth/cancelled-popup-request',
			'auth/user-cancelled',
			'auth/popup-closed-by-user'
		]) {
			expect(describeAuthError(authError(code)), code).toBe('');
		}
	});
});