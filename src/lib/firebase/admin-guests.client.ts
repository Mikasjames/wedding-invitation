import { browser } from '$app/environment';
import { databaseId, getApp, isConfigured } from './app';
import { classifyGuestError, type GuestListBackend } from '../admin/guests.driver';
import { readAdminRow, sortRows } from '../admin/row';

/**
 * Firestore binding for the dashboard.
 *
 * Dynamic imports throughout, for the same reason `firebase.client.ts` has them:
 * the Admin SDK must not reach a guest reading an invitation.
 *
 * Returns `null` when unconfigured, which is also how a fresh clone and the
 * Playwright web server run.
 */
export async function getGuestListBackend(): Promise<GuestListBackend | null> {
	if (!browser || !isConfigured()) return null;

	return {
		async loadAll() {
			const [app, firestore] = await Promise.all([getApp(), import('firebase/firestore')]);

			const db = firestore.getFirestore(app, databaseId);

			try {
				// A collection query, which Firestore evaluates as a `list` operation
				// — and `list` is what the rules grant admins. `getDoc(doc(db, 'rsvps',
				// code))` would be a `get`, gated on a known code and an active
				// household, so fetching one archived household that way is refused
				// even for an admin. Getting this backwards looks exactly like a
				// misconfigured ruleset.
				const snapshot = await firestore.getDocs(firestore.collection(db, 'rsvps'));

				return sortRows(
					snapshot.docs
						.map((doc) => readAdminRow(doc.id, doc.data()))
						.filter((row): row is NonNullable<typeof row> => row !== null)
				);
			} catch (error) {
				throw classifyGuestError(error);
			}
		}
	};
}