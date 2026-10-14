import { wedding } from '../lib/wedding.ts';

/**
 * The dashboard's date formatting.
 *
 * Pinned to Philippine time for the same reason the invitation's is
 * (`wedding.ts:4`): the answer to "when did Maria reply" has to be the same
 * whoever asks, and the answer for the couple is the clock in Tanza, not the one
 * on the device the dashboard happens to be open on. A reply filed at 9am in
 * London is 5pm in Cavite, and reading the first number would be a fabrication.
 *
 * The Philippines has no DST, so a fixed zone is exact — no offset arithmetic,
 * no half-hour hour, nothing that moves.
 *
 * `en-GB` is pinned for the same reason as the invitation's dates: so the order
 * stays "15 Jan 2027" rather than becoming "Jan 15, 2027" on a device whose
 * locale would otherwise reorder it.
 */
const TIME_ZONE = 'Asia/Manila';

const TIMESTAMP = new Intl.DateTimeFormat('en-GB', {
	dateStyle: 'medium',
	timeStyle: 'short',
	timeZone: TIME_ZONE
});

/**
 * `15 Jan 2027, 21:32 PHT`, or `''` for a date that is not there.
 *
 * The zone is spelled out rather than left to the reader. A dashboard open on a
 * laptop abroad is exactly the case where an unqualified time is ambiguous, and
 * adding the label costs three characters.
 *
 * Returns `''` rather than a placeholder so the caller can drop the whole line —
 * a household that has never replied has no `respondedAt`, and "Replied —" is a
 * row of furniture that says nothing.
 *
 * The `NaN` guard is not paranoia about Firestore: `readAdminRow`'s `toDate`
 * already refuses an invalid `Date`. It is here because this function is
 * exported and tested on its own, and `Intl.DateTimeFormat.format` throws a
 * `RangeError` on a bad date — which, called from a template, would blank the
 * dashboard rather than miss a row.
 */
export function formatTimestamp(date: Date | null): string {
	if (!date || Number.isNaN(date.getTime())) return '';

	return `${TIMESTAMP.format(date)} ${wedding.timeZoneLabel}`;
}