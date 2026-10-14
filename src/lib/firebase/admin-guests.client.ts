import { browser } from '$app/environment';
import { databaseId, getApp, isConfigured } from './app';
import {
	AdminCodeTakenError,
	classifyGuestError,
	type CreatedHousehold,
	type GuestListBackend
} from '../admin/guests.driver';
import { newHousehold } from '../rsvp/guests';
import { generateCode } from '../rsvp/codes';
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
		},

		async create(household) {
			const [app, firestore] = await Promise.all([getApp(), import('firebase/firestore')]);

			const db = firestore.getFirestore(app, databaseId);
			const code = household.code ?? generateCode();
			const ref = firestore.doc(db, 'rsvps', code);

			try {
				// A transaction rather than a bare `setDoc`. With a generated code the
				// chance of collision is negligible against 32^10, but the couple can
				// supply a code — "I have already printed these cards" — and a mistyped
				// one that happens to land on a real household would replace a guest's
				// answer with an empty one, silently. Reading first makes that an error
				// instead, which is the only version of this worth shipping.
				await firestore.runTransaction(db, async (tx) => {
					const snapshot = await tx.get(ref);

					if (snapshot.exists()) throw new AdminCodeTakenError(code);

					tx.set(ref, {
						// The same shape `pnpm seed` writes, so a household added here
						// behaves like every other one. `newHousehold` in particular
						// carries `status: 'pending'`, which the deployed rules branch on.
						...newHousehold({ ...household, active: true, customMessage: household.customMessage ?? '' }),
						createdAt: firestore.serverTimestamp(),
						updatedAt: firestore.serverTimestamp()
					});
				});

				return { code, householdName: household.householdName, seatsAllocated: household.seatsAllocated };
			} catch (error) {
				// Raised by the transaction itself, so it must not be reclassified into
				// a generic permission failure.
				if (error instanceof AdminCodeTakenError) throw error;

				throw classifyGuestError(error);
			}
		}
	};
}