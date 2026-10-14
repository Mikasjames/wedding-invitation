import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RsvpBackend } from './backend';
import { RsvpOfflineError } from './backend';
import { CODE_STORAGE_KEY, RsvpFlow, confirmedSeats, seatLabel } from './rsvp.svelte';
import type { ResponseFields, Rsvp } from './types';

const CODE = 'W8K9JPTR4M';

function household(overrides: Partial<Rsvp> = {}): Rsvp {
	return {
		schemaVersion: 1,
		householdName: 'Dela Cruz Family',
		side: 'bride',
		seatsAllocated: 4,
		active: true,
		contactEmail: null,
		notes: '',
		customMessage: '',
		createdAt: null as never,
		updatedAt: null as never,
		status: 'pending',
		partySize: 0,
		attendeeNames: [],
		message: '',
		respondedAt: null,
		...overrides
	};
}

interface Harness {
	flow: RsvpFlow;
	fetch: ReturnType<typeof vi.fn>;
	save: ReturnType<typeof vi.fn>;
	storage: Map<string, string>;
}

function setup(options: {
	document?: Rsvp | null;
	backend?: RsvpBackend | null;
	saveFails?: Error;
	/** Seeds the storage the flow reads its "previous visit" code from. */
	remembered?: string;
} = {}): Harness {
	const { document = household(), backend = null, saveFails, remembered } = options;

	const fetch = vi.fn<(code: string) => Promise<Rsvp | null>>(async () => document);

	const save = vi.fn<(code: string, response: ResponseFields) => Promise<void>>(async () => {
		if (saveFails) throw saveFails;
	});

	const storage = new Map<string, string>();
	if (remembered) storage.set(CODE_STORAGE_KEY, remembered);

	const resolved: RsvpBackend =
		backend ??
		({
			fetch: async (code: string) => fetch(code),
			save: async (code: string, response: ResponseFields) => save(code, response)
		} satisfies RsvpBackend);

	return {
		flow: new RsvpFlow({
			getBackend: async () => resolved,
			storage: {
				getItem: (key) => storage.get(key) ?? null,
				setItem: (key, value) => void storage.set(key, value),
				removeItem: (key) => void storage.delete(key)
			}
		}),
		fetch,
		save,
		storage
	};
}

describe('RsvpFlow.lookup', () => {
	let h: Harness;

	beforeEach(() => {
		h = setup();
	});

	it('starts idle', () => {
		expect(h.flow.phase).toBe('idle');
	});

	it('goes straight to the form when the code resolves', async () => {
		await h.flow.lookup(CODE);

		expect(h.flow.phase).toBe('found');
		expect(h.flow.household?.householdName).toBe('Dela Cruz Family');
	});

	it('rejects a malformed code without calling Firestore', async () => {
		await h.flow.lookup('nope');

		expect(h.flow.phase).toBe('not-found');
		expect(h.fetch).not.toHaveBeenCalled();
	});

	// The whole reason the stepper can say "all 4 of you" without asking: most
	// households accept the full allotment, and that is the number the couple
	// wants counted.
	it('offers the whole allotment by default', async () => {
		await h.flow.lookup(CODE);

		expect(h.flow.intent).toBe('attending');
		expect(h.flow.partySize).toBe(4);
	});

	it('treats an unknown code as not-found', async () => {
		h = setup({ document: null });
		await h.flow.lookup(CODE);

		expect(h.flow.phase).toBe('not-found');
	});

	it('remembers a code that resolved', async () => {
		await h.flow.lookup(CODE);

		expect(h.storage.get(CODE_STORAGE_KEY)).toBe(CODE);
		expect(h.flow.remembered).toBe(CODE);
	});

	// A guest who already answered should see what they said, not a second blank
	// form that invites them to contradict themselves.
	it('lands on the receipt when the household has already answered', async () => {
		h = setup({
			document: household({ status: 'attending', partySize: 3, attendeeNames: ['Juan'] })
		});

		await h.flow.lookup(CODE);

		expect(h.flow.phase).toBe('confirmed');
		expect(confirmedSeats(h.flow.household!)).toBe(3);
	});

	it('carries an existing answer into the edit form', async () => {
		h = setup({ document: household({ status: 'attending', partySize: 2 }) });

		await h.flow.lookup(CODE);
		h.flow.edit();

		expect(h.flow.phase).toBe('found');
		expect(h.flow.partySize).toBe(2);
	});

	it('recovers from a declined household without a zero-seat form', async () => {
		h = setup({ document: household({ status: 'declined' }) });

		await h.flow.lookup(CODE);
		h.flow.edit();

		expect(h.flow.intent).toBe('declined');
		expect(h.flow.canSubmit).toBe(true);
	});

	// A remembered code must never load by itself. On a shared phone that would
	// hand one guest's answer to whoever opens the site next; the code belongs in
	// the input, where they can see whose it is before using it.
	it('never auto-loads a remembered code', async () => {
		const revisiting = setup({ remembered: CODE });

		await revisiting.flow.lookup(null);

		expect(revisiting.fetch).not.toHaveBeenCalled();
		expect(revisiting.flow.phase).toBe('not-found');
		expect(revisiting.flow.remembered).toBe(CODE);
	});

	it('reports a storage failure as not-found rather than crashing', async () => {
		const flow = new RsvpFlow({
			getBackend: async () => null,
			storage: {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {
					throw new Error('blocked');
				},
				removeItem: () => {
					throw new Error('blocked');
				}
			}
		});

		expect(flow.remembered).toBeNull();
		expect(flow.forget()).toBeUndefined();
	});

	// A build with no Firebase config has to say so rather than rejecting every
	// code — that is also how a fresh clone and the Playwright web server run.
	it('marks itself unavailable when there is no backend', async () => {
		const flow = new RsvpFlow({ getBackend: async () => null });

		await flow.lookup(CODE);

		expect(flow.unavailable).toBe(true);
		expect(flow.phase).toBe('idle');
	});
});

describe('RsvpFlow party size', () => {
	it('clamps to the allotment', async () => {
		const h = setup();
		await h.flow.lookup(CODE);

		h.flow.setPartySize(99);
		expect(h.flow.partySize).toBe(4);

		h.flow.setPartySize(-3);
		expect(h.flow.partySize).toBe(1);
	});

	it('jumps to every seat in one tap', async () => {
		const h = setup();
		await h.flow.lookup(CODE);

		h.flow.setPartySize(1);
		h.flow.setAllAttending();

		expect(h.flow.partySize).toBe(4);
	});

	it('resizes the names list to match', async () => {
		const h = setup();
		await h.flow.lookup(CODE);

		h.flow.setPartySize(2);
		expect(h.flow.attendeeNames).toHaveLength(2);

		h.flow.setAllAttending();
		expect(h.flow.attendeeNames).toHaveLength(4);
	});

	// The regression. The names list rendered nothing on arrival and only filled
	// in once the stepper was touched, because `#adopt` set `partySize` without
	// calling `#resizeNames` — so a household that had not answered yet kept the
	// empty `attendeeNames` the seed wrote. The stepper became a required
	// interaction rather than an optional one.
	//
	// The test above could not have caught it: it calls `setPartySize` first, which
	// was the only path that already worked.
	it('has a name line for every seat the moment the household is found', async () => {
		const h = setup();
		await h.flow.lookup(CODE);

		expect(h.flow.attendeeNames).toHaveLength(h.flow.partySize);
		expect(h.flow.attendeeNames).toHaveLength(4);
	});

	// Padded rather than replaced, so reopening the form keeps what they typed.
	it('keeps the names it already has and pads the rest', async () => {
		const h = setup({
			document: household({
				status: 'attending',
				partySize: 4,
				attendeeNames: ['Juan', 'Maria Cristina']
			})
		});

		await h.flow.lookup(CODE);

		expect(h.flow.attendeeNames).toEqual(['Juan', 'Maria Cristina', '', '']);
	});

	// The other direction. More names than seats is the invariant too, and it is
	// how a guest ends up storing four names for one head.
	it('drops names beyond the party rather than asking for them', async () => {
		const h = setup({
			document: household({
				status: 'attending',
				partySize: 2,
				attendeeNames: ['Juan', 'Maria Cristina', 'Ana']
			})
		});

		await h.flow.lookup(CODE);

		expect(h.flow.attendeeNames).toEqual(['Juan', 'Maria Cristina']);
	});

	// Declining sets the party to nobody; accepting puts it back to one. Without
	// the resize the list stayed at its old length, and the rules never check the
	// name count against `partySize` — so four names would be stored against one
	// seat and appear that way on the dashboard.
	it('does not leave more name lines than seats after declining then accepting', async () => {
		const h = setup();
		await h.flow.lookup(CODE);

		h.flow.setIntent('declined');
		h.flow.setIntent('attending');

		expect(h.flow.partySize).toBe(1);
		expect(h.flow.attendeeNames).toHaveLength(1);
	});

	// A household allotted zero seats cannot be confirmed as attending: the rules
	// require at least one seat to attend and refuse anything above the allotment,
	// so offering the choice would only produce an error the guest cannot fix.
	it('offers no attendance for a zero-seat household', async () => {
		const h = setup({ document: household({ seatsAllocated: 0 }) });
		await h.flow.lookup(CODE);

		expect(h.flow.canAttend).toBe(false);

		h.flow.setPartySize(3);
		expect(h.flow.partySize).toBe(1);

		h.flow.setIntent('attending');
		expect(h.flow.canSubmit).toBe(false);
	});

	it('still lets a zero-seat household decline', async () => {
		const h = setup({ document: household({ seatsAllocated: 0 }) });
		await h.flow.lookup(CODE);

		h.flow.setIntent('declined');

		expect(h.flow.canSubmit).toBe(true);
	});
});

describe('RsvpFlow.submit', () => {
	let h: Harness;

	beforeEach(async () => {
		h = setup();
		await h.flow.lookup(CODE);
	});

	it('sends only the response fields', async () => {
		h.flow.setPartySize(3);
		h.flow.attendeeNames = ['Juan', '', '', ''];
		h.flow.message = ' congratulations ';

		await h.flow.submit();

		expect(h.save).toHaveBeenCalledTimes(1);

		const [code, response] = h.save.mock.calls[0];
		expect(code).toBe(CODE);
		expect(response).toEqual({
			status: 'attending',
			partySize: 3,
			attendeeNames: ['Juan'],
			message: 'congratulations',
			respondedAt: null
		});
	});

	// Blank name lines are not an answer. Storing them would hand the couple a
	// list of empty rows to clean up before seating anyone.
	it('drops blank attendee names and surrounding whitespace', async () => {
		h.flow.setPartySize(2);
		h.flow.attendeeNames = ['  ', ' Maria '];

		await h.flow.submit();

		expect(h.save.mock.calls[0][1].attendeeNames).toEqual(['Maria']);
	});

	it('confirms only after the server has accepted the write', async () => {
		const order: string[] = [];
		h.save.mockImplementation(async () => {
			order.push('saved');
		});

		await h.flow.submit();
		order.push('confirmed:' + h.flow.phase);

		expect(order).toEqual(['saved', 'confirmed:confirmed']);
	});

	it('records a decline as zero seats', async () => {
		h.flow.setIntent('declined');

		await h.flow.submit();

		expect(h.save.mock.calls[0][1]).toMatchObject({ status: 'declined', partySize: 0 });
		expect(h.flow.phase).toBe('confirmed');
		expect(confirmedSeats(h.flow.household!)).toBe(0);
	});

	it('shows a receipt reflecting what was actually saved', async () => {
		h.flow.setPartySize(2);
		await h.flow.submit();

		expect(h.flow.household?.status).toBe('attending');
		expect(confirmedSeats(h.flow.household!)).toBe(2);
	});

	// The guest's whole evening of typing is still on screen. Losing it to an
	// error banner would be the worst possible response to a dropped connection.
	it('keeps the guest on the form and preserves their input when saving fails', async () => {
		const failing = setup({ saveFails: new RsvpOfflineError() });
		await failing.flow.lookup(CODE);

		failing.flow.setPartySize(2);
		failing.flow.message = 'we would not miss it';

		await failing.flow.submit();

		expect(failing.flow.phase).toBe('found');
		expect(failing.flow.message).toBe('we would not miss it');
		expect(failing.flow.partySize).toBe(2);
		expect(failing.flow.error).toMatch(/offline/i);
		expect(failing.flow.household?.status).toBe('pending');
	});

	it('lets a guest change their answer afterwards', async () => {
		await h.flow.submit();
		expect(h.flow.phase).toBe('confirmed');

		h.flow.edit();
		expect(h.flow.phase).toBe('found');

		h.flow.setPartySize(1);
		await h.flow.submit();

		expect(h.save).toHaveBeenCalledTimes(2);
		expect(h.flow.household?.partySize).toBe(1);
	});

	it('refuses to submit before a household is found', async () => {
		const fresh = setup();
		await fresh.flow.submit();

		expect(fresh.save).not.toHaveBeenCalled();
	});
});

describe('seatLabel', () => {
	it('agrees with itself about plurals', () => {
		expect(seatLabel(1)).toBe('1 seat');
		expect(seatLabel(4)).toBe('4 seats');
		expect(seatLabel(0)).toBe('0 seats');
	});
});