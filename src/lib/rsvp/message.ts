import { wedding } from '../lib/wedding.ts';

/** What a household needs before an invitation can be written for it. */
export interface InvitationInput {
	/** Shown to the guest as "Hi ___". The household name as the couple typed it. */
	household: string;

	seats: number;
	code: string;

	/**
	 * Where the link points, with no trailing slash.
	 *
	 * Passed in rather than read here because the two callers legitimately know
	 * different answers: the seed script reads `static/CNAME`, and the dashboard
	 * knows the origin it is being served on. Those differ in preview, and the
	 * link has to be the one that actually works.
	 */
	site: string;
}

/**
 * The message a household is sent.
 *
 * Shared by the seed script and the dashboard so the two cannot drift. This is
 * text that gets pasted into Messenger and read by a guest, so a version that
 * disagrees about the names, the deadline or the seat count is worse than a wrong
 * number anywhere else — there is no second place to notice it.
 *
 * The names and deadline come from `wedding.ts` rather than being repeated, which
 * is the same reason the seed stopped carrying its own copy.
 */
export function invitationMessage({ household, seats, code, site }: InvitationInput): string {
	return (
		`Hi ${household}!\n\n` +
		`${wedding.names} are getting married and would be honoured by your presence.\n` +
		`Kindly reply by ${wedding.rsvp.deadline}.\n\n` +
		`Your invitation: ${invitationLink(site, code)}\n` +
		`Your code: ${code} — ${seats} ${seats === 1 ? 'seat' : 'seats'} reserved for you.`
	);
}

/** The link a household is sent, matching what `RsvpFlow` reads back. */
export function invitationLink(site: string, code: string): string {
	return `${site.replace(/\/$/, '')}/?code=${code}`;
}