import type { ResponseFields, Rsvp } from './types';

/**
 * Everything the RSVP flow needs from storage.
 *
 * The flow talks to this interface rather than to Firestore directly so its
 * transitions can be tested without a network, a project, or an emulator. The
 * Firestore implementation is loaded lazily — see `firebase.client.ts`.
 */
export interface RsvpBackend {
	/** The household for this code, or `null` if there is none or it is archived. */
	fetch(code: string): Promise<Rsvp | null>;

	/**
	 * Records a response. Must send *only* `ResponseFields`: `updateDoc` derives
	 * its field mask from the keys passed, so anything extra would be a write the
	 * rules refuse.
	 *
	 * Resolves only once the server has accepted the write, so that the flow can
	 * show a receipt that is true rather than optimistic.
	 */
	save(code: string, response: ResponseFields): Promise<void>;
}

/** How storage refused a request, mapped to something a guest can be told. */
export function describeFailure(error: unknown): string {
	if (error instanceof RsvpNotFoundError) {
		return 'We could not find that code. Please check it against your invitation.';
	}

	if (error instanceof RsvpClosedError) {
		return 'RSVPs for this invitation have closed. Please contact the couple directly.';
	}

	if (error instanceof RsvpRefusedError) {
		return 'We could not save that answer. Please try again, or contact the couple.';
	}

	if (error instanceof RsvpOfflineError) {
		return 'You appear to be offline. Check your connection and try again.';
	}

	if (error instanceof NetworkTimeoutError) {
		return 'That is taking longer than expected. Please try again — nothing you typed has been lost.';
	}

	return 'Something went wrong. Please try again, or contact the couple.';
}

/**
 * How a refused *write* should be described, given whether the household had
 * already answered.
 *
 * A refusal means the rules declined the write, and the deployed rules decline for
 * several unrelated reasons. One of them is the RSVP cutoff — but the cutoff
 * check cannot refuse a household that has never answered:
 * `isBeforeCutoff()` returns true outright when the stored status is `pending`.
 * So for a first answer, "RSVPs have closed" is not a cautious guess, it is
 * guaranteed to be the wrong thing to say, and it is what the guest sees.
 *
 * A refusal on a first answer is a field set the rules do not recognise, or a
 * ruleset that is not the one this build was written against. Both are the
 * couple's problem to fix, not the guest's, so the wording points at retrying and
 * at the couple rather than declaring the RSVP over.
 *
 * An *answered* household genuinely can be refused by the cutoff, so it keeps the
 * original wording.
 */
export function describeSaveFailure(error: unknown, firstAnswer: boolean): string {
	if (firstAnswer && error instanceof RsvpClosedError) {
		// Deliberately never mentions a closed RSVP — not even to deny one. A guest
		// who was never refused by the cutoff would be told about a deadline that
		// does not apply to them, and would have to reason about whether it did.
		return 'We could not save that answer. Your answers are still here, so please try again — or contact the couple.';
	}

	return describeFailure(error);
}

export class RsvpNotFoundError extends Error {}
export class RsvpClosedError extends Error {}
export class RsvpRefusedError extends Error {}
export class RsvpOfflineError extends Error {}
export class NetworkTimeoutError extends Error {}

/** How long a single Firestore call may hang before the guest gets an answer. */
export const CALL_TIMEOUT_MS = 10_000;

/**
 * Gives up on a call that has not settled in time.
 *
 * `Promise.race` rather than `AbortController`: the Web SDK's `getDoc` and
 * `updateDoc` accept no signal, so a hung request cannot actually be cancelled —
 * only stopped being waited on. That distinction matters for writes: a timed-out
 * `save` may still land on the server afterwards. It is safe here because `save`
 * sets an absolute field set rather than incrementing anything, so a retry
 * overwrites the same values instead of compounding them. Anything that counted
 * or accumulated would need a different answer here.
 *
 * The timer is cleared in `finally` so a fast call does not leave one pending,
 * and a rejection arriving after the race has already settled is absorbed by the
 * race's own handler rather than surfacing as an unhandled rejection.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number = CALL_TIMEOUT_MS): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const expiry = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new NetworkTimeoutError(`no response in ${ms}ms`)), ms);
	});

	try {
		return await Promise.race([work, expiry]);
	} finally {
		clearTimeout(timer);
	}
}
