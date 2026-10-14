import { describe, expect, it, vi } from 'vitest';
import {
	ACCESS_DENIED,
	AdminCodeTakenError,
	AdminDatabaseMissingError,
	AdminDeniedError,
	AdminFailedError,
	AdminOfflineError,
	AdminSeatsBelowConfirmedError,
	AdminWriteRefusedError,
	classifyGuestError,
	describeGuestError,
	type GuestListBackend,
	type HouseholdEdit
} from './guests.driver';
import { GuestList } from './guests.svelte';
import { readAdminRow, type AdminRow } from './row';

function row(overrides: Partial<AdminRow> & { code?: string } = {}): AdminRow {
	return readAdminRow(overrides.code ?? 'W8K9JPTR4M', {
		householdName: 'Dela Cruz Family',
		side: 'bride',
		seatsAllocated: 4,
		active: true,
		status: 'attending',
		partySize: 3,
		...overrides
	})!;
}

const ROWS = [
	row({ code: 'BBBB00000001', householdName: 'Santos', seatsAllocated: 2, partySize: 2 }),
	row({ code: 'AAAA00000002', householdName: 'Aguinaldo', seatsAllocated: 3, status: 'declined', partySize: 0 })
];

function backend(options: { rows?: AdminRow[]; throws?: Error } = {}): GuestListBackend {
	return {
		loadAll: async () => {
			if (options.throws) throw options.throws;
			return options.rows ?? ROWS;
		},
		// Echoes `customMessage` as `admin-guests.client.ts` does. Without it here
		// the fake answers a question the tests below are not actually asking.
		create: async (household) => ({
			code: household.code ?? 'NEW0000001',
			householdName: household.householdName,
			seatsAllocated: household.seatsAllocated,
			customMessage: household.customMessage ?? ''
		}),
		setMessage: async () => {},
		update: async () => {},
	};
}

function setup(resolved: GuestListBackend | null = backend()) {
	const loadAll = vi.fn((resolved?.loadAll ?? (async () => [])) as GuestListBackend['loadAll']);
	const create = vi.fn(
		(resolved?.create ?? (async () => {
			throw new Error('unused');
		})) as GuestListBackend['create']
	);

	const setMessage = vi.fn(
		(resolved?.setMessage ?? (async () => {})) as GuestListBackend['setMessage']
	);

	const update = vi.fn((resolved?.update ?? (async () => {})) as GuestListBackend['update']);

	return {
		loadAll,
		create,
		setMessage,
		update,
		list: new GuestList(async () =>
			resolved ? { loadAll, create, setMessage, update } : null
		)
	};
}

function firestoreError(code: string): Error {
	return Object.assign(new Error(code), { code });
}

describe('classifyGuestError', () => {
	it('reads a rules refusal as a denial', () => {
		expect(classifyGuestError(firestoreError('permission-denied'))).toBeInstanceOf(AdminDeniedError);
	});

	// The project id pointing at a project with no database, and the SDK finding
	// the project but no database in it, are the same mistake from two directions.
	it('reads both flavours of missing database the same way', () => {
		for (const code of ['not-found', 'failed-precondition']) {
			expect(classifyGuestError(firestoreError(code)), code).toBeInstanceOf(
				AdminDatabaseMissingError
			);
		}
	});

	it('reads connection failures as offline', () => {
		for (const code of ['unavailable', 'deadline-exceeded', 'network-request-failed']) {
			expect(classifyGuestError(firestoreError(code)), code).toBeInstanceOf(AdminOfflineError);
		}
	});

	it('falls back rather than throwing on an unrecognised code', () => {
		expect(classifyGuestError(firestoreError('auth/some-future-code'))).toBeInstanceOf(
			AdminFailedError
		);
		expect(classifyGuestError(undefined)).toBeInstanceOf(AdminFailedError);
	});
});

describe('describeGuestError', () => {
	// A rules file that never mentions `rsvps` denies by default and looks exactly
	// like a real refusal. Without this in the message, that costs an afternoon.
	it('blames the ruleset as well as the account when access is denied', () => {
		expect(ACCESS_DENIED).toContain('not on the admin list');
		expect(ACCESS_DENIED).toContain('match /rsvps');
	});

	it('names the env var when the database is missing', () => {
		expect(describeGuestError(new AdminDatabaseMissingError())).toContain(
			'PUBLIC_FIREBASE_PROJECT_ID'
		);
	});

	it('distinguishes an outage from a misconfiguration', () => {
		expect(describeGuestError(new AdminOfflineError())).toMatch(/connection/i);
		expect(describeGuestError(new AdminFailedError())).not.toBe(
			describeGuestError(new AdminOfflineError())
		);
	});

	it('has a message for the denial case too', () => {
		expect(describeGuestError(new AdminDeniedError())).toBe(ACCESS_DENIED);
	});
});

describe('GuestList.sync', () => {
	it('starts idle with nothing loaded', () => {
		const { list } = setup();

		expect(list.phase).toBe('idle');
		expect(list.rows).toEqual([]);
	});

	it('loads for a signed-in account', async () => {
		const { list, loadAll } = setup();

		await list.sync('user-1');

		expect(loadAll).toHaveBeenCalledTimes(1);
		expect(list.phase).toBe('ready');
		expect(list.rows).toHaveLength(2);
		expect(list.loadedFor).toBe('user-1');
	});

	// Called from an `$effect`, so it re-runs constantly. Reloading on every
	// render would loop, because the fetch sets state that re-triggers the effect.
	it('does not refetch for the same account', async () => {
		const { list, loadAll } = setup();
		await list.sync('user-1');

		await list.sync('user-1');
		await list.sync('user-1');

		expect(loadAll).toHaveBeenCalledTimes(1);
	});

	it('refetches when the account changes', async () => {
		const { list, loadAll } = setup();
		await list.sync('user-1');

		await list.sync('user-2');

		expect(loadAll).toHaveBeenCalledTimes(2);
		expect(list.loadedFor).toBe('user-2');
	});

	it('refetches when the same account signs out and back in', async () => {
		const { list, loadAll } = setup();
		await list.sync('user-1');

		await list.sync(null);
		await list.sync('user-1');

		expect(loadAll).toHaveBeenCalledTimes(2);
	});

	it('does nothing for a null account when already clear', async () => {
		const { list, loadAll } = setup();

		await list.sync(null);
		await list.sync(null);

		expect(loadAll).not.toHaveBeenCalled();
	});

	// Rows belonging to whoever was signed in last are not the next person's to
	// see, and on a shared laptop they carry names and messages.
	it('drops every row on sign-out', async () => {
		const { list } = setup();
		await list.sync('user-1');

		await list.sync(null);

		expect(list.rows).toEqual([]);
		expect(list.phase).toBe('idle');
		expect(list.loadedFor).toBeNull();
	});

	it('keeps a refused account from ever becoming the loaded one', async () => {
		const { list, loadAll } = setup(backend({ throws: new AdminDeniedError('permission-denied') }));

		await list.sync('user-1');

		expect(list.phase).toBe('denied');
		expect(list.loadedFor).toBe('user-1');
		expect(list.isDenied).toBe(true);
		// The retry path, not the loop path.
		expect(loadAll).toHaveBeenCalledTimes(1);

		await list.sync('user-1');
		expect(loadAll).toHaveBeenCalledTimes(1);
	});
});

describe('GuestList failures', () => {
	it('reports an unconfigured build rather than throwing', async () => {
		const { list } = setup(null);

		await list.sync('user-1');

		expect(list.phase).toBe('unconfigured');
		expect(list.rows).toEqual([]);
	});

	// Two different problems that both look like a refusal to a rules file that
	// does not cover `rsvps`. They must not be conflated.
	it('separates a denial from a missing database', async () => {
		const { list } = setup(backend({ throws: new AdminDatabaseMissingError() }));

		await list.sync('user-1');

		expect(list.phase).toBe('failed');
		expect(list.isDenied).toBe(false);
		expect(list.error).toContain('PUBLIC_FIREBASE_PROJECT_ID');
	});

	it('reports an outage with its own message', async () => {
		const { list } = setup(backend({ throws: new AdminOfflineError() }));

		await list.sync('user-1');

		expect(list.phase).toBe('failed');
		expect(list.error).toMatch(/connection/i);
	});

	// The rows were authorised for the previous account. Leaving them up after a
	// failure would show them to somebody who has just been refused.
	it('clears rows it is no longer entitled to show', async () => {
		const { list } = setup();
		await list.sync('user-1');
		expect(list.rows).toHaveLength(2);

		const denied = new GuestList(async () => ({
			loadAll: async () => {
				throw new AdminDeniedError();
			},
			create: async () => {
				throw new AdminDeniedError();
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await denied.sync('user-2');

		expect(denied.rows).toEqual([]);
	});

	it('leaves the error empty on a denial for the page to word', async () => {
		const { list } = setup(backend({ throws: new AdminDeniedError() }));

		await list.sync('user-1');

		// The page composes "Signed in as <label>, but …" and needs the account to
		// do it, so a canned message here would be half a sentence.
		expect(list.error).toBeNull();
	});
});

describe('GuestList.reload', () => {
	// What "Check again" calls after a forced token refresh. It has to refetch
	// even when nothing about the account changed.
	it('refetches regardless of the account', async () => {
		const { list, loadAll } = setup();
		await list.sync('user-1');

		await list.load();

		expect(loadAll).toHaveBeenCalledTimes(2);
	});

	it('clears a stale error before retrying', async () => {
		let fail = true;
		const failing = new GuestList(async () => ({
			loadAll: async () => {
				if (fail) throw new AdminOfflineError();
				return ROWS;
			},
			create: async () => {
				throw new AdminOfflineError();
			},
			setMessage: async () => {},
			update: async () => {},
		}));

		await failing.sync('user-1');
		expect(failing.error).not.toBeNull();

		fail = false;
		await failing.load();

		expect(failing.phase).toBe('ready');
		expect(failing.error).toBeNull();
		expect(failing.rows).toHaveLength(2);
	});

	it('does nothing when nobody is signed in', async () => {
		const { list, loadAll } = setup();

		await list.load();

		expect(loadAll).not.toHaveBeenCalled();
	});
});

const NEW_HOUSEHOLD = {
	householdName: 'Reyes - Tiong & Chika',
	side: 'both' as const,
	seatsAllocated: 6,
	contactEmail: null,
	notes: ''
};

describe('GuestList.create', () => {
	it('passes the household straight through', async () => {
		const { list, create } = setup();
		await list.sync('user-1');

		await list.create(NEW_HOUSEHOLD);

		expect(create).toHaveBeenCalledWith(NEW_HOUSEHOLD);
	});

	// Totals is `$derived` from the rows, so pushing the new household on by hand
	// is another place the dashboard can quietly disagree with the server. One
	// re-read is cheaper than being wrong.
	it('re-reads the list rather than appending', async () => {
		const { list, loadAll, create } = setup();
		await list.sync('user-1');
		loadAll.mockClear();

		await list.create(NEW_HOUSEHOLD);

		expect(create).toHaveBeenCalledTimes(1);
		expect(loadAll).toHaveBeenCalled();
	});

	/**
	 * The reason `#refresh` exists. A failed refresh used to go through `load()`,
	 * which sets `phase = 'failed'` — and the page branches on `phase`, so the whole
	 * branch holding the receipt was replaced by "Could not load". The household
	 * existed in Firestore with its code nowhere on screen and no way to get it
	 * back.
	 */
	it('keeps the receipt when the refresh after a create fails', async () => {
		// The first load has to succeed, or `phase` is already `failed` before the
		// create and the test would pass for the wrong reason.
		let fail = false;

		const flaky = new GuestList(async () => ({
			loadAll: async () => {
				if (fail) throw new AdminOfflineError();
				return ROWS;
			},
			create: async () => ({
				code: 'NEW0000001',
				householdName: 'Reyes',
				seatsAllocated: 6
			}),
			setMessage: async () => {},
			update: async () => {},
		}));
		await flaky.sync('user-1');
		expect(flaky.phase).toBe('ready');

		fail = true;
		const created = await flaky.create(NEW_HOUSEHOLD);

		expect(created).not.toBeNull();
		expect(flaky.lastCreated).toEqual(created);
		// The page must keep rendering the ready branch, or the receipt is unreachable.
		expect(flaky.phase).toBe('ready');
		// Short by one household, which is visible and recoverable — not cleared.
		expect(flaky.rows).toEqual(ROWS);
		expect(flaky.refreshError).not.toBeNull();
		expect(flaky.createError).toBeNull();
	});

	it('clears the refresh warning once a later refresh succeeds', async () => {
		let fail = true;
		const flaky = new GuestList(async () => ({
			loadAll: async () => {
				if (fail) throw new AdminOfflineError();
				return ROWS;
			},
			create: async () => ({
				code: 'NEW0000001',
				householdName: 'Reyes',
				seatsAllocated: 6
			}),
			setMessage: async () => {},
			update: async () => {},
		}));
		await flaky.sync('user-1');

		await flaky.create(NEW_HOUSEHOLD);
		expect(flaky.refreshError).not.toBeNull();

		fail = false;
		await flaky.create(NEW_HOUSEHOLD);

		expect(flaky.refreshError).toBeNull();
		expect(flaky.rows).toEqual(ROWS);
	});

	// The other half of the split: `#refresh` exists because `load()` demotes, and
	// it must keep doing so on the paths where a whole-list failure is the truth.
	it('still demotes when a full load fails', async () => {
		const failing = new GuestList(async () => ({
			loadAll: async () => {
				throw new AdminOfflineError();
			},
			create: async () => {
				throw new AdminOfflineError();
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await failing.sync('user-1');

		expect(failing.phase).toBe('failed');
		expect(failing.rows).toEqual([]);
		expect(failing.refreshError).toBeNull();
	});

	it('keeps what was created so it can be sent', async () => {
		const { list } = setup();
		await list.sync('user-1');

		const created = await list.create(NEW_HOUSEHOLD);

		expect(created).toEqual({
			code: 'NEW0000001',
			householdName: 'Reyes - Tiong & Chika',
			seatsAllocated: 6,
			customMessage: ''
		});
		expect(list.lastCreated).toEqual(created);
	});

	// The receipt is the only place a household added from the dashboard ever has
	// its wording shown — the seed's `out/links.csv` does not cover one. It used to
	// be built from `{code, householdName, seatsAllocated}` alone, so a household the
	// couple had just written bespoke wording for was sent the shared template from
	// the one screen that says "send them this".
	it('hands back the wording it was given, so the receipt is not the template', async () => {
		const { list } = setup();
		await list.sync('user-1');

		const created = await list.create({
			...NEW_HOUSEHOLD,
			customMessage: 'Hi {household}! It has been years.'
		});

		expect(created?.customMessage).toBe('Hi {household}! It has been years.');
		expect(list.lastCreated?.customMessage).toBe('Hi {household}! It has been years.');
	});

	// A refused create says nothing about whether the list still loads. Flipping
	// the dashboard to "not on the admin list" because one write was refused would
	// be alarming and wrong.
	it('reports a failure without demoting a working list', async () => {
		const denied = new GuestList(async () => ({
			loadAll: async () => ROWS,
			create: async () => {
				throw new AdminDeniedError();
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await denied.sync('user-1');

		const created = await denied.create(NEW_HOUSEHOLD);

		expect(created).toBeNull();
		expect(denied.createError).toBe(ACCESS_DENIED);
		expect(denied.phase).toBe('ready');
		expect(denied.rows).toHaveLength(2);
	});

	it('explains a code that is already taken', async () => {
		const taken = new GuestList(async () => ({
			loadAll: async () => ROWS,
			create: async () => {
				throw new AdminCodeTakenError('W8K9JPTR4M');
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await taken.sync('user-1');

		await taken.create({ ...NEW_HOUSEHOLD, code: 'W8K9JPTR4M' });

		expect(taken.createError).toMatch(/already in use/i);
		expect(taken.lastCreated).toBeNull();
	});

	it('clears a stale failure before trying again', async () => {
		let fail = true;
		const flaky = new GuestList(async () => ({
			loadAll: async () => ROWS,
			create: async () => {
				if (fail) throw new AdminOfflineError();
				return { code: 'NEW0000001', householdName: 'A', seatsAllocated: 2 };
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await flaky.sync('user-1');

		await flaky.create(NEW_HOUSEHOLD);
		expect(flaky.createError).not.toBeNull();

		fail = false;
		await flaky.create(NEW_HOUSEHOLD);

		expect(flaky.createError).toBeNull();
	});

	it('does not send two creates at once', async () => {
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});

		const slow = new GuestList(async () => ({
			loadAll: async () => ROWS,
			create: async () => {
				await held;
				return { code: 'NEW0000001', householdName: 'A', seatsAllocated: 2 };
			},
			setMessage: async () => {},
			update: async () => {},
		}));
		await slow.sync('user-1');

		const first = slow.create(NEW_HOUSEHOLD);
		const second = await slow.create(NEW_HOUSEHOLD);

		expect(second).toBeNull();

		release();
		await first;
	});

	it('reports an unconfigured build rather than throwing', async () => {
		const { list } = setup(null);

		const created = await list.create(NEW_HOUSEHOLD);

		expect(created).toBeNull();
		expect(list.createError).toMatch(/not configured/i);
	});

	it('forgets the last household on sign-out', async () => {
		const { list } = setup();
		await list.sync('user-1');
		await list.create(NEW_HOUSEHOLD);
		expect(list.lastCreated).not.toBeNull();

		await list.sync(null);

		expect(list.lastCreated).toBeNull();
	});
});

describe('GuestList totals', () => {
	it('derives from the loaded rows', async () => {
		const { list } = setup();
		await list.sync('user-1');

		expect(list.totals).toMatchObject({
			households: 2,
			invited: 5,
			confirmed: 2,
			declined: 1,
			declinedSeats: 3,
			pending: 0
		});
	});

	it('returns to zero once the rows go', async () => {
		const { list } = setup();
		await list.sync('user-1');

		await list.sync(null);

		expect(list.totals.invited).toBe(0);
		expect(list.totals.confirmed).toBe(0);
	});
});
describe('GuestList.setMessage', () => {
	// The property the whole method rests on: only the wording moves. A backend
	// that could also write `seatsAllocated` could produce the over-committed
	// document that locks a household out of its own RSVP, which is why the
	// interface takes one field rather than a patch object.
	it('writes the code and the wording, and nothing else', async () => {
		const { list, setMessage } = setup();

		await list.sync('user-1');
		await list.setMessage('BBBB00000001', 'It has been years.');

		expect(setMessage).toHaveBeenCalledWith('BBBB00000001', 'It has been years.');
	});

	// An emptied editor is how a household goes back to the shared template.
	it('stores an empty string as the way back to the template', async () => {
		const { list, setMessage } = setup();

		await list.sync('user-1');
		await list.setMessage('BBBB00000001', '');

		expect(setMessage).toHaveBeenCalledWith('BBBB00000001', '');
	});

	// Re-read rather than patch the row, because the write set `updatedAt` and a
	// local edit would leave the detail panel showing the old "Last change".
	it('re-reads the list so the timestamps are not stale', async () => {
		const { list, loadAll } = setup();

		await list.sync('user-1');
		expect(loadAll).toHaveBeenCalledTimes(1);

		await list.setMessage('BBBB00000001', 'Do come.');

		expect(loadAll).toHaveBeenCalledTimes(2);
	});

	it('reports success', async () => {
		const { list } = setup();

		await list.sync('user-1');

		expect(await list.setMessage('BBBB00000001', 'Do come.')).toBe(true);
		expect(list.messageError).toBeNull();
	});

	// Reachable rather than theoretical: the admin arm of the deployed `allow
	// update` is a `hasOnly` over exactly two keys, so "reads fine, writes
	// refused" arrives from an account that can plainly read the list.
	it('explains a refused write without demoting the list', async () => {
		const { list } = setup({
			...backend(),
			setMessage: async () => {
				throw new AdminWriteRefusedError();
			}
		});

		await list.sync('user-1');
		const before = list.rows;

		expect(await list.setMessage('BBBB00000001', 'Do come.')).toBe(false);
		// Names both keys, because the near-miss is a `hasOnly` listing one of
		// them, and it must not claim the account is off the admin list — it has
		// just read the list.
		expect(list.messageError).toContain('customMessage');
		expect(list.messageError).toContain('updatedAt');
		expect(list.messageError).not.toContain('not on the admin list');
		// The rows and the phase are untouched: a refused write says nothing about
		// whether the guest list still loads.
		expect(list.phase).toBe('ready');
		expect(list.rows).toBe(before);
	});

	// Checked before the first await, or two rapid saves both pass the guard.
	it('refuses a second save while one is in flight', async () => {
		const { list, setMessage } = setup();

		await list.sync('user-1');

		const first = list.setMessage('BBBB00000001', 'Do come.');
		const second = await list.setMessage('BBBB00000001', 'Do come again.');

		expect(second).toBe(false);
		expect(setMessage).toHaveBeenCalledTimes(1);

		await first;
	});

	it('says so when there is no backend at all', async () => {
		const { list } = setup(null);
		await list.sync('user-1');

		expect(await list.setMessage('BBBB00000001', 'Do come.')).toBe(false);
		expect(list.messageError).toContain('not configured');
	});
});

describe('GuestList.refresh', () => {
	it('re-reads the rows', async () => {
		const { list, loadAll } = setup();

		await list.sync('user-1');
		expect(loadAll).toHaveBeenCalledTimes(1);

		await list.refresh();

		expect(loadAll).toHaveBeenCalledTimes(2);
	});

	// The reason this is not `load()`. `load()` opens by setting
	// `phase = 'loading'`, and the page branches on `phase` — so the whole branch
	// unmounts, taking an open invitation editor and everything typed into it with
	// it. A couple refreshing to pull in a new answer should not lose their
	// half-written message to find out it arrived.
	it('leaves the dashboard up, so nothing on it is destroyed', async () => {
		const { list } = setup();

		await list.sync('user-1');
		await list.refresh();

		expect(list.phase).toBe('ready');
		expect(list.rows).toHaveLength(2);
	});

	it('reports a failure without demoting the list', async () => {
		// Breaks only after the first load, so the refresh is what fails. A backend
		// that throws on every read would fail the initial load too and prove nothing
		// about what refresh does to the page.
		let broken = false;

		const flaky = {
			...backend(),
			loadAll: async () => {
				if (broken) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
				return ROWS;
			}
		};

		const { list } = setup(flaky);

		await list.sync('user-1');
		const before = list.rows;

		broken = true;
		await list.refresh();

		expect(list.refreshError).toBeTruthy();
		expect(list.phase).toBe('ready');
		expect(list.rows).toBe(before);
	});

	// Checked before the first await, or two clicks both pass the guard.
	it('refuses a second refresh while one is in flight', async () => {
		const { list, loadAll } = setup();

		await list.sync('user-1');

		const first = list.refresh();
		await list.refresh();

		expect(loadAll).toHaveBeenCalledTimes(2);

		await first;
	});

	// The guard belongs to the button. While it also covered the write path, a
	// click on "Refresh" mid-create set `refreshing`, so the create's own re-read
	// returned immediately — and the refresh already running had been issued
	// *before* the write, so the household the couple had just added stayed off
	// screen with nothing to say so.
	it('does not let an in-flight refresh stand in for a write', async () => {
		let seen = 0;

		const counting = new GuestList(async () => ({
			loadAll: async () => (seen++ === 0 ? ROWS : [...ROWS, ROWS[0]]),
			create: async () => ({
				code: 'NEW0000001',
				householdName: 'Reyes',
				seatsAllocated: 6
			}),
			setMessage: async () => {},
			update: async () => {},
		}));

		await counting.sync('user-1');

		// Both in flight at once: the button's refresh, and a create underneath it.
		const refreshing = counting.refresh();
		const creating = await counting.create({
			householdName: 'Reyes',
			side: 'both',
			seatsAllocated: 6,
			contactEmail: null,
			notes: ''
		});

		expect(creating).not.toBeNull();
		await refreshing;

		// Three reads: the initial load, and one after each. Two would mean the
		// create's re-read was dropped.
		expect(seen).toBe(3);
	});

	// Nothing on screen changes during a refresh, so this flag exists only to
	// disable the button — but a flag left stuck on would disable it forever.
	it('clears the busy flag however it finishes', async () => {
		let broken = false;

		const flaky = {
			...backend(),
			loadAll: async () => {
				if (broken) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
				return ROWS;
			}
		};

		const { list } = setup(flaky);

		await list.sync('user-1');

		broken = true;
		await list.refresh();

		expect(list.refreshing).toBe(false);
	});

	it('drops the flag on sign-out', async () => {
		const { list } = setup();

		await list.sync('user-1');
		await list.refresh();
		await list.sync(null);

		expect(list.refreshing).toBe(false);
	});
});

const EDIT: HouseholdEdit = {
	householdName: 'Dela Cruz Family',
	side: 'bride',
	seatsAllocated: 4,
	contactEmail: 'dc@example.com',
	notes: 'Seat by the window',
	active: true
};

describe('GuestList.update', () => {
	// The property the whole method rests on. `HouseholdEdit` carries every owner
	// field and none of `ResponseFields`, so the write cannot reach `partySize` or
	// `status` — and it cannot reach `partySize` in particular, because that is the
	// number the deployed `seatCountStaysValid()` checks. `setMessage` could assert
	// the same for one field; this is the claim for six.
	it('writes the code and the six owner fields, and nothing else', async () => {
		const { list, update } = setup();

		await list.sync('user-1');
		await list.update('BBBB00000001', EDIT);

		expect(update).toHaveBeenCalledWith('BBBB00000001', EDIT);

		const written = update.mock.calls[0][1];
		for (const key of Object.keys(EDIT)) expect(written).toHaveProperty(key);
		for (const key of ['partySize', 'status', 'attendeeNames', 'message', 'respondedAt']) {
			expect(written).not.toHaveProperty(key);
		}
	});

	it('reports success', async () => {
		const { list } = setup();
		await list.sync('user-1');

		expect(await list.update('BBBB00000001', EDIT)).toBe(true);
		expect(list.editError).toBeNull();
	});

	// Re-read rather than patch the row, for the same reason `create` does: `totals`
	// is `$derived` from the rows, so a hand-applied edit is another place the
	// dashboard can disagree with the server, and `updatedAt` would stay stale.
	it('re-reads the list so the timestamps are not stale', async () => {
		const { list, loadAll } = setup();

		await list.sync('user-1');
		expect(loadAll).toHaveBeenCalledTimes(1);

		await list.update('BBBB00000001', EDIT);

		expect(loadAll).toHaveBeenCalledTimes(2);
	});

	it('says so when there is no backend at all', async () => {
		const { list } = setup(null);

		expect(await list.update('BBBB00000001', EDIT)).toBe(false);
		expect(list.editError).toContain('not configured');
	});

	// Checked before the first await, or two rapid saves both pass the guard.
	it('refuses a second save while one is in flight', async () => {
		const { list, update } = setup();

		await list.sync('user-1');

		const first = list.update('BBBB00000001', EDIT);
		const second = await list.update('BBBB00000001', EDIT);

		expect(second).toBe(false);
		expect(update).toHaveBeenCalledTimes(1);

		await first;
	});

	// A refused save says nothing about whether the guest list still loads. Flipping
	// the dashboard to "not on the admin list" because one household edit was refused
	// would be alarming and wrong — and this is the reachable case now that the admin
	// arm names six fields: a `hasOnly` that lists five of them refuses every save.
	it('explains a refused write without demoting the list', async () => {
		const { list } = setup({
			...backend(),
			update: async () => {
				throw new AdminWriteRefusedError();
			}
		});

		await list.sync('user-1');
		const before = list.rows;

		expect(await list.update('BBBB00000001', EDIT)).toBe(false);
		expect(list.editError).toContain('seatsAllocated');
		expect(list.editError).not.toContain('not on the admin list');
		expect(list.phase).toBe('ready');
		expect(list.rows).toBe(before);
	});

	// The rules refuse a seat edit that would strand a household, and say so as a
	// plain permission error. Naming it lets the couple be told what the number is
	// rather than being sent to look at their ruleset.
	it('names the confirmed count when a save would strand a household', async () => {
		const { list } = setup({
			...backend(),
			update: async () => {
				throw new AdminSeatsBelowConfirmedError(2, 3);
			}
		});

		await list.sync('user-1');

		expect(await list.update('BBBB00000001', { ...EDIT, seatsAllocated: 2 })).toBe(false);
		expect(list.editError).toContain('3');
		expect(list.editError).toContain('cannot go below');
	});

	// The editor's guard should mean this never reaches Firestore, but the rules are
	// the guard rather than the client — so a stale tab, or a client other than this
	// one, must be told what happened rather than seeing a generic permission error.
	it('does not claim the account is off the admin list for a seat refusal', async () => {
		const { list } = setup({
			...backend(),
			update: async () => {
				throw new AdminSeatsBelowConfirmedError(4, 6);
			}
		});

		await list.sync('user-1');
		await list.update('BBBB00000001', EDIT);

		expect(list.editError).not.toContain('admin list');
	});

	it('forgets the last failure when the account signs out', async () => {
		const { list } = setup({
			...backend(),
			update: async () => {
				throw new AdminWriteRefusedError();
			}
		});

		await list.sync('user-1');
		await list.update('BBBB00000001', EDIT);
		expect(list.editError).not.toBeNull();

		await list.sync(null);

		expect(list.editError).toBeNull();
	});
});
