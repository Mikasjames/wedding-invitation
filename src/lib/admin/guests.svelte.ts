import {
	ACCESS_DENIED,
	AdminDeniedError,
	describeGuestError,
	type CreatedHousehold,
	type GuestListBackend,
	type NewHousehold
} from './guests.driver';
import {
	booksBalance as booksAddUp,
	outstanding as countOutstanding,
	totals as totalRows
} from './totals';
import type { AdminRow } from './row';

export type GuestListPhase =
	| 'idle'
	| 'loading'
	| 'ready'
	| 'denied'
	| 'failed'
		| 'unconfigured';

/**
 * The guest list, as state.
 *
 * Takes a uid rather than an `AdminSession`, so it has no opinion about who is
 * signed in and no way to check permissions itself — `denied` arrives as an
 * error the backend threw, decided entirely by the rules.
 */
export class GuestList {
	phase = $state<GuestListPhase>('idle');

	rows = $state<AdminRow[]>([]);

	/** A message for the `failed` banner. `null` for `denied`, which the page words itself. */
	error = $state<string | null>(null);

	/** A household is being created. */
	creating = $state(false);

	/**
	 * Why the last create failed.
	 *
	 * Deliberately separate from `error`, and deliberately not allowed to move
	 * `phase`. A refused create says nothing about whether the guest list still
	 * loads, and replacing a working list with "not on the admin list" because one
	 * write was refused would be both alarming and wrong.
	 */
	createError = $state<string | null>(null);

	/**
	 * A household's invitation wording is being saved.
	 *
	 * One flag for the whole list rather than one per household, because only one
	 * household can be open at a time — see `expandedCode` on the page.
	 */
	savingMessage = $state(false);

	/** Why the last message save failed. Separate from `createError` for the same reason. */
	messageError = $state<string | null>(null);

	/**
	 * The household just created, kept so the page can show something sendable.
	 *
	 * A code nobody can deliver is worse than no code at all, so creating one is
	 * only half the job.
	 */
	lastCreated = $state<CreatedHousehold | null>(null);

	/**
	 * The rows on screen may be out of date, by one household.
	 *
	 * Set only by the background refresh that follows a create. It exists because
	 * that refresh must not demote the page — see `#refresh`.
	 */
	refreshError = $state<string | null>(null);

	/** Derived rather than recomputed on read; `totals` walks every row. */
	readonly totals = $derived(totalRows(this.rows));

	/**
	 * Heads still owed an answer, and the seats riding on them.
	 *
	 * Excludes archived and declined rows inside `outstanding` itself — a household
	 * that said no has given its answer, and counting it again would suggest there
	 * is still something to be done about it.
	 */
	readonly outstanding = $derived(countOutstanding(this.rows));

	/**
	 * Whether the figures in the totals strip add up.
	 *
	 * Always true for any input, so a `false` here means the arithmetic in
	 * `totals.ts` was edited wrongly rather than that the data is bad. The page
	 * says so rather than hiding it, because the strip is the thing the couple
	 * plans the catering around.
	 */
	readonly balanced = $derived(booksAddUp(this.totals));

	readonly #getBackend: () => Promise<GuestListBackend | null>;
	#uid: string | null = null;

	constructor(getBackend: () => Promise<GuestListBackend | null>) {
		this.#getBackend = getBackend;
	}

	/** Which account the rows currently on screen belong to. */
	get loadedFor(): string | null {
		return this.#uid;
	}

	get isDenied(): boolean {
		return this.phase === 'denied';
	}

	/**
	 * Loads when the signed-in account changes, and does nothing when it has not.
	 *
	 * Called from an `$effect`, so it re-runs on every render. Without this guard
	 * each state write would re-trigger the effect that caused it, and the guest
	 * list would reload in a loop. Identity is the only thing worth reacting to —
	 * the same person signing in twice does not need a second fetch.
	 */
	async sync(uid: string | null): Promise<void> {
		if (uid === this.#uid) return;

		this.#uid = uid;

		if (!uid) {
			this.clear();
			return;
		}

		await this.load();
	}

	/**
	 * Fetches, unconditionally.
	 *
	 * The retry path. Separate from `sync` because a denied load must not become
	 * a retry loop, while an explicit "Check again" after a token refresh is
	 * exactly the case where re-fetching is the whole point.
	 */
	async load(): Promise<void> {
		if (!this.#uid) return;

		this.phase = 'loading';
		this.error = null;

		try {
			const backend = await this.#getBackend();

			if (!backend) {
				this.rows = [];
				this.phase = 'unconfigured';
				return;
			}

			this.rows = await backend.loadAll();
			this.phase = 'ready';
		} catch (error) {
			// Clear rather than leave stale rows: this account is not entitled to
			// them, and on a shared laptop the next person would see another
			// household's names and messages.
			this.rows = [];

			if (error instanceof AdminDeniedError) {
				this.phase = 'denied';
				this.error = null;
			} else {
				this.phase = 'failed';
				this.error = describeGuestError(error);
			}
		}
	}

	/**
	 * Re-reads the rows after a write, without touching `phase`.
	 *
	 * `load()` is the wrong tool here. It opens by setting `phase = 'loading'`,
	 * which unmounts the form mid-create, and on failure it sets `'failed'` and
	 * clears the rows — and the page branches on `phase`, so a failed refresh
	 * replaces a working dashboard with "Could not load" and takes the receipt with
	 * it. The household would exist in Firestore while the couple is told the list
	 * could not be loaded, with no code on screen and no way to retrieve one.
	 *
	 * A refresh that fails one second after a successful *write* is a network blip,
	 * not an authorisation failure. So it leaves `rows` and `phase` alone and
	 * records `refreshError` instead: the list is then short by one household,
	 * which is visibly wrong and recoverable, rather than demoted and alarming.
	 *
	 * `load()` keeps the demoting behaviour for the paths that *are* whole-list
	 * failures — `sync`, "Try again", "Check again" — where clearing the rows is
	 * also the right security call.
	 */
	async #refresh(): Promise<void> {
		try {
			const backend = await this.#getBackend();

			if (!backend) return;

			this.rows = await backend.loadAll();
			this.refreshError = null;
		} catch (error) {
			this.refreshError = describeGuestError(error);
		}
	}

	/** Called when the account signs out. Drops every row on screen. */
	clear(): void {
		this.rows = [];
		this.phase = 'idle';
		this.error = null;
		this.lastCreated = null;
		this.refreshError = null;
		this.messageError = null;
	}

	/**
	 * Creates one household, then re-reads the list.
	 *
	 * Re-read rather than pushing the new row onto `rows`: `totals` is `$derived`
	 * from the rows, so appending by hand is another place the dashboard can
	 * disagree with the server. A few hundred rows costs one query and makes the
	 * totals strip impossible to get wrong.
	 *
	 * Returns what was created so the page can offer it to send, or `null` if it
	 * failed — the reason is on `createError` either way.
	 */
	async create(household: NewHousehold): Promise<CreatedHousehold | null> {
		// Set before the first await, deliberately. Checking and then setting either
		// side of an `await` lets two calls both pass the guard, and the couple gets
		// two households for one form.
		if (this.creating) return null;

		this.creating = true;
		this.createError = null;
		this.refreshError = null;

		try {
			const backend = await this.#getBackend();

			if (!backend) {
				this.createError = 'Firestore is not configured for this build.';
				return null;
			}

			const created = await backend.create(household);

			// Before the refresh, not after. `#refresh` swallows its own failures, but
			// the receipt is the one thing a create must never lose, and the order
			// costs nothing.
			this.lastCreated = created;

			await this.#refresh();

			return created;
		} catch (error) {
			this.createError = describeGuestError(error);

			return null;
		} finally {
			this.creating = false;
		}
	}

	/** For the page's "not on the admin list" wording. */
	static readonly accessDenied = ACCESS_DENIED;

	/**
	 * Saves one household's invitation wording, then re-reads the list.
	 *
	 * Only `customMessage` is written, so a failure here leaves every number on
	 * screen exactly as it was — which is why this reports through its own error
	 * and leaves `phase` alone, the same reasoning as `createError`.
	 *
	 * Re-reads rather than patching the row in place, for the same reason `create`
	 * does: `totals` is `$derived` from the rows, so a hand-applied edit is another
	 * place the dashboard can disagree with the server. The `updatedAt` the write
	 * set is the other reason — a local row would still be showing the old one.
	 */
	async setMessage(code: string, customMessage: string): Promise<boolean> {
		if (this.savingMessage) return false;

		this.savingMessage = true;
		this.messageError = null;

		try {
			const backend = await this.#getBackend();

			if (!backend) {
				this.messageError = 'Firestore is not configured for this build.';
				return false;
			}

			await backend.setMessage(code, customMessage);

			await this.#refresh();

			return true;
		} catch (error) {
			// `describeGuestError` already carries a message specific to a write the
			// rules refused, which is the failure this can hit: the admin arm of
			// `allow update` is a `hasOnly` over exactly two keys.
			this.messageError = describeGuestError(error);

			return false;
		} finally {
			this.savingMessage = false;
		}
	}
}