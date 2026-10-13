import type { AdminUser, AuthDriver } from './auth.driver';

/**
 * Who is signed in, and what went wrong when they tried.
 *
 * Knows nothing about Firestore and nothing about permissions. In particular it
 * has **no** `isAdmin` flag, and that is deliberate:
 *
 * The rules grant admin by custom claim *or* by `email_verified` plus a list of
 * addresses. Somebody admitted on the email path has no `admin` claim in their
 * token at all, so a client that checked one would tell the couple they were not
 * an admin while the rules waved them through.
 *
 * The client therefore does not decide. It signs the person in and lets the
 * Firestore rules answer, which stays correct however access is granted — by
 * claim, by email, or by something changed later. See `guests.svelte.ts`, where
 * a `PERMISSION_DENIED` on the collection load becomes the authorisation answer.
 */
export class AdminSession {
	/** False until the backend has reported who is signed in. */
	ready = $state(false);

	/** A sign-in or sign-out is in flight. */
	busy = $state(false);

	user = $state<AdminUser | null>(null);

	error = $state<string | null>(null);

	readonly #driver: AuthDriver;
	#stop: (() => void) | null = null;

	constructor(driver: AuthDriver) {
		this.#driver = driver;
	}

	/**
	 * Whether the dashboard should be on screen.
	 *
	 * Requires `ready`, not just a user, so the signed-out state cannot flash
	 * before Firebase has had a chance to say nobody is signed in.
	 */
	get signedIn(): boolean {
		return this.ready && this.user !== null;
	}

	/** The account, labelled for a human. */
	get label(): string {
		if (!this.user) return '';

		return this.user.displayName || this.user.email || this.user.uid;
	}

	/**
	 * Begins listening. Returns a detach function.
	 *
	 * Safe to call twice: the previous listener is dropped first, so a remount
	 * cannot leave an orphan subscription feeding a discarded session.
	 */
	start(): () => void {
		this.stop();
		this.ready = false;
		this.error = null;

		const detach = this.#driver.subscribe((user) => {
			this.user = user;
			this.ready = true;
		});

		this.#stop = detach;

		return () => {
			if (this.#stop === detach) this.#stop = null;
			detach();
		};
	}

	stop(): void {
		this.#stop?.();
		this.#stop = null;
	}

	/**
	 * Settles a redirect from a previous page load.
	 *
	 * Called once on mount, after `start()`. The listener reports the user; this
	 * only exists so a redirect the user abandoned surfaces as an error instead of
	 * a page that quietly sits there looking signed out.
	 */
	async resume(): Promise<void> {
		try {
			await this.#driver.resume();
		} catch (error) {
			this.error = this.#describe(error);
		}
	}

	async signIn(): Promise<void> {
		if (this.busy) return;

		this.busy = true;
		this.error = null;

		try {
			await this.#driver.signIn();
		} catch (error) {
			this.error = this.#describe(error);
		} finally {
			this.busy = false;
		}
	}

	async signOut(): Promise<void> {
		if (this.busy) return;

		this.busy = true;
		this.error = null;

		try {
			await this.#driver.signOut();
		} catch (error) {
			this.error = this.#describe(error);
		} finally {
			this.busy = false;
		}
	}

	/**
	 * Discards the cached ID token, then lets the caller retry whatever the rules
	 * refused.
	 *
	 * A custom claim granted while somebody was signed in does not reach their
	 * token until it is refreshed, so without this a newly-made admin is refused
	 * indefinitely and has no way to fix it.
	 */
	async refresh(): Promise<void> {
		this.error = null;

		try {
			await this.#driver.refresh();
		} catch (error) {
			this.error = this.#describe(error);
		}
	}

	/**
	 * A dismissal is not a failure.
	 *
	 * Closing the Google window or backing out of the redirect should leave the
	 * page exactly as it was, not wearing an error about something nobody did wrong.
	 * `null` rather than `''`, so `error` stays honestly "nothing to say" instead
	 * of holding a falsy string that later reads as a state nobody set.
	 */
	#describe(error: unknown): string | null {
		return this.#driver.describe(error) || null;
	}
}