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

	return 'Something went wrong. Please try again, or contact the couple.';
}

export class RsvpNotFoundError extends Error {}
export class RsvpClosedError extends Error {}
export class RsvpRefusedError extends Error {}
export class RsvpOfflineError extends Error {}