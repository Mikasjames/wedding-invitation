import type { RsvpBackend } from './backend';
import { describeFailure, describeSaveFailure } from './backend';
import { extractCode } from './codes';
import type { Intent, ResponseFields, Rsvp } from './types';

/**
 * Where the flow is, and the only thing the component needs to decide what to
 * render.
 *
 * `not-found` is a phase rather than an error message because a guest who mistypes
 * a code needs somewhere to go back to, and an error banner alone does not give
 * them that.
 */
export type Phase =
	| 'idle'
	| 'loading'
	| 'not-found'
	| 'found'
	| 'submitting'
	| 'confirmed';

export const CODE_STORAGE_KEY = 'rsvp:code';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface RsvpFlowOptions {
	/** Resolves to `null` when Firebase is not configured for this build. */
	getBackend: () => Promise<RsvpBackend | null>;

	/** Where a remembered code is kept. Pass `null` to disable remembering. */
	storage?: StorageLike | null;
}

/**
 * The RSVP flow, as state rather than as a component.
 *
 * The backend arrives as a factory so this file never imports the Firebase SDK —
 * which keeps it runnable under vitest, where `$app/environment` does not resolve,
 * and keeps the SDK out of the module graph of anything that only wants to render.
 */
export class RsvpFlow {
	phase = $state<Phase>('idle');

	/** The code this household is being looked up by, once there is one. */
	code = $state<string | null>(null);

	household = $state<Rsvp | null>(null);

	intent = $state<Intent>('attending');
	partySize = $state(1);
	attendeeNames = $state<string[]>([]);
	message = $state('');

	/** Set when a lookup or save fails, and cleared by the next attempt. */
	error = $state<string | null>(null);

	/** True when this build has no Firebase config, so no code can be looked up. */
	unavailable = $state(false);

	/** A code remembered from an earlier visit, offered before they retype it. */
	remembered = $state<string | null>(null);

	readonly #getBackend: () => Promise<RsvpBackend | null>;
	readonly #storage: StorageLike | null;

	constructor({ getBackend, storage }: RsvpFlowOptions) {
		this.#getBackend = getBackend;
		this.#storage = storage ?? null;
		this.remembered = this.#readRemembered();
	}

	get seatsAllocated(): number {
		return this.household?.seatsAllocated ?? 0;
	}

	/**
	 * Whether this household could accept at all. A household allotted zero seats
	 * — a "+1 later" placeholder, say — cannot be confirmed as attending, because
	 * the rules require at least one seat for an attending guest and refuse
	 * anything above the allotment. Offering the choice would only produce an
	 * error the guest cannot act on.
	 */
	get canAttend(): boolean {
		return this.seatsAllocated > 0;
	}

	get isAnswered(): boolean {
		return this.household?.status !== undefined && this.household.status !== 'pending';
	}

	get canSubmit(): boolean {
		if (this.phase !== 'found') return false;
		return this.intent === 'declined' || (this.canAttend && this.partySize >= 1);
	}

	#readRemembered(): string | null {
		if (!this.#storage) return null;

		try {
			return extractCode(this.#storage.getItem(CODE_STORAGE_KEY));
		} catch {
			// Private browsing and blocked third-party storage both throw here.
			// Remembering the code is a convenience, never a requirement.
			return null;
		}
	}

	#remember(code: string): void {
		this.remembered = code;

		try {
			this.#storage?.setItem(CODE_STORAGE_KEY, code);
		} catch {
			// See #readRemembered.
		}
	}

	forget(): void {
		this.remembered = null;
		this.reset();

		try {
			this.#storage?.removeItem(CODE_STORAGE_KEY);
		} catch {
			// See #readRemembered.
		}
	}

	reset(): void {
		this.phase = 'idle';
		this.code = null;
		this.household = null;
		this.intent = 'attending';
		this.partySize = 1;
		this.attendeeNames = [];
		this.message = '';
		this.error = null;
	}

	/**
	 * Looks a household up by code.
	 *
	 * Takes the code to use rather than falling back to the remembered one, because
	 * auto-loading a remembered household would hand a previous guest's answer to
	 * whoever opens the site next on a shared phone. The component offers the
	 * remembered code in the input instead, so saving the typing never costs
	 * anything.
	 */
	async lookup(raw: string | null | undefined): Promise<void> {
		const code = extractCode(raw);

		if (!code) {
			this.phase = 'not-found';
			this.error = 'That does not look like a code from your invitation.';
			return;
		}

		this.code = code;
		this.error = null;
		this.phase = 'loading';

		try {
			const backend = await this.#getBackend();

			if (!backend) {
				this.unavailable = true;
				this.phase = 'idle';
				return;
			}

			const household = await backend.fetch(code);

			if (!household) {
				this.phase = 'not-found';
				this.error = 'We could not find that code. Please check it against your invitation.';
				return;
			}

			this.#adopt(household);
			this.#remember(code);
			// Someone who has already answered should land on their receipt, not be
			// asked again. This is also what makes revisiting a link show the
			// current answer rather than silently inviting a second one.
			this.phase = household.status === 'pending' ? 'found' : 'confirmed';
		} catch (error) {
			this.phase = 'not-found';
			this.error = describeFailure(error);
		}
	}

	#adopt(household: Rsvp): void {
		this.household = household;

		const attending = household.status === 'attending';

		this.intent = household.status === 'declined' ? 'declined' : 'attending';
		// Default to the whole allotment. Most households are all-in, and it is the
		// number the couple actually wants — but never below one, or a declining
		// household reopening the form would sit on an invalid zero.
		this.partySize = attending
			? Math.max(1, Math.min(household.partySize, household.seatsAllocated))
			: Math.max(1, household.seatsAllocated);
		this.attendeeNames = [...household.attendeeNames];

		// Names follow the party here as well as in `setPartySize`. Without this, a
		// household that has not answered yet keeps the empty `attendeeNames` the
		// seed wrote, so the names list renders nothing at all — it only appears once
		// the guest touches the stepper, which is the one interaction that was
		// supposed to be optional. An attending household reopening the form is
		// handled by the same call: `slice` keeps what they typed, and only the
		// shortfall is padded.
		this.#resizeNames(this.partySize);

		this.message = household.message;
	}

	setIntent(intent: Intent): void {
		this.intent = intent;

		if (intent === 'declined') {
			// Declining is not "one guest who happens not to come" — it is nobody. The
			// rules enforce the same thing, so the stepper should not offer a number
			// that would be refused.
			this.partySize = 0;

			return;
		}

		// Back from declining, which set the party to nobody.
		if (this.partySize === 0) this.partySize = 1;

		// Otherwise accepting straight after declining leaves a list of name lines
		// longer than the party it belongs to — four empty inputs against one seat.
		// The rules do not check the name count against `partySize`, so that would be
		// stored as four names for a single head and shown as such on the dashboard.
		this.#resizeNames(this.partySize);
	}

	/** Clamped, because a stepper is only a courtesy and the rules are the guard. */
	setPartySize(size: number): void {
		if (!this.canAttend) return;

		const clamped = Math.min(Math.max(Math.round(size) || 0, 1), this.seatsAllocated);

		this.partySize = clamped;
		this.#resizeNames(clamped);
	}

	setAllAttending(): void {
		this.setPartySize(this.seatsAllocated);
	}

	/** Keeps the names list the same length as the party, so it never asks for more. */
	#resizeNames(size: number): void {
		const names = this.attendeeNames.slice(0, size);

		while (names.length < size) names.push('');

		this.attendeeNames = names;
	}

	/** Back to the form, prefilled with what they last said. */
	edit(): void {
		if (!this.household) return;

		this.error = null;
		this.phase = 'found';
	}

	/**
	 * Sends the answer.
	 *
	 * Only reaches `confirmed` once the backend has resolved, so the receipt is a
	 * statement about what the server holds rather than an intention.
	 */
	async submit(): Promise<void> {
		if (!this.canSubmit || !this.code) return;

		this.phase = 'submitting';
		this.error = null;

		// Read before the write: the rules' cutoff check cannot refuse a household
		// that has never answered, so a refusal on a first answer means something
		// other than a closed RSVP and must not be described as one. See
		// `describeSaveFailure`.
		const firstAnswer = this.household?.status === 'pending';

		const response: ResponseFields = {
			status: this.intent,
			partySize: this.intent === 'declined' ? 0 : this.partySize,
			// A declining household is nobody, so it has no names — the same claim
			// `partySize: 0` makes two lines above. Names typed before switching to
			// "can't make it" would otherwise be stored and rendered by the dashboard
			// under "Attending", and carried into the export.
			//
			// Blank name lines are not an answer either, so on the attending path
			// they are dropped rather than stored as empty strings the couple would
			// have to clean up.
			// A declining household is nobody, so it has no names — the same claim
			// `partySize: 0` makes two lines above. Names typed before switching to
			// "can't make it" would otherwise be stored and rendered by the dashboard
			// under "Attending", and carried into the export.
			//
			// Blank name lines are not an answer either, so on the attending path
			// they are dropped rather than stored as empty strings the couple would
			// have to clean up.
			attendeeNames:
				this.intent === 'declined'
					? []
					: this.attendeeNames.map((name) => name.trim()).filter(Boolean),
			message: this.message.trim(),
			respondedAt: null
		};

		try {
			const backend = await this.#getBackend();

			if (!backend) {
				this.unavailable = true;
				this.phase = 'idle';
				return;
			}

			await backend.save(this.code, response);

			if (this.household) this.household = { ...this.household, ...response };

			this.phase = 'confirmed';
		} catch (error) {
			// Back to the form rather than to the receipt: the answer did not land,
			// and throwing away everything they typed to show an error would be the
			// worst possible response to a dropped connection.
			this.phase = 'found';
			this.error = describeSaveFailure(error, firstAnswer);
		}
	}
}

/** How many heads the couple should expect from this household. */
export function confirmedSeats(household: Rsvp): number {
	return household.status === 'attending' ? household.partySize : 0;
}

/** "4 seats", "1 seat" — a guest-facing count should not read as a spreadsheet. */
export function seatLabel(count: number): string {
	return `${count} ${count === 1 ? 'seat' : 'seats'}`;
}