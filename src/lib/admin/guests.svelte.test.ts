import { describe, expect, it, vi } from 'vitest';
import {
	ACCESS_DENIED,
	AdminCodeTakenError,
	AdminDatabaseMissingError,
	AdminDeniedError,
	AdminFailedError,
	AdminOfflineError,
	classifyGuestError,
	describeGuestError,
	type GuestListBackend
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
		create: async (household) => ({
			code: household.code ?? 'NEW0000001',
			householdName: household.householdName,
			seatsAllocated: household.seatsAllocated
		})
	};
}

function setup(resolved: GuestListBackend | null = backend()) {
	const loadAll = vi.fn((resolved?.loadAll ?? (async () => [])) as GuestListBackend['loadAll']);
	const create = vi.fn(
		(resolved?.create ?? (async () => {
			throw new Error('unused');
		})) as GuestListBackend['create']
	);

	return {
		loadAll,
		create,
		list: new GuestList(async () => (resolved ? { loadAll, create } : null))
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
			}
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
			}
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

	it('keeps what was created so it can be sent', async () => {
		const { list } = setup();
		await list.sync('user-1');

		const created = await list.create(NEW_HOUSEHOLD);

		expect(created).toEqual({
			code: 'NEW0000001',
			householdName: 'Reyes - Tiong & Chika',
			seatsAllocated: 6
		});
		expect(list.lastCreated).toEqual(created);
	});

	// A refused create says nothing about whether the list still loads. Flipping
	// the dashboard to "not on the admin list" because one write was refused would
	// be alarming and wrong.
	it('reports a failure without demoting a working list', async () => {
		const denied = new GuestList(async () => ({
			loadAll: async () => ROWS,
			create: async () => {
				throw new AdminDeniedError();
			}
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
			}
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
			}
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
			}
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