import { browser } from '$app/environment';
import { databaseId, getApp, isConfigured } from './app';
import {
	AdminCodeTakenError,
	AdminDeniedError,
	AdminWriteRefusedError,
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
		},

		async setMessage(code, customMessage) {
			const [app, firestore] = await Promise.all([getApp(), import('firebase/firestore')]);

			const db = firestore.getFirestore(app, databaseId);

			try {
				// `updateDoc`, never `setDoc`, and only these two fields.
				//
				// `setDoc` without a merge replaces the whole document — it would erase
				// the guest's answer and every owner field with whatever this call site
				// happened to know. Naming the fields is the whole safety property: this
				// call cannot alter `seatsAllocated`, so it cannot produce the
				// over-committed document that locks a household out of its own RSVP.
				await firestore.updateDoc(firestore.doc(db, 'rsvps', code), {
					customMessage,
					updatedAt: firestore.serverTimestamp()
				});
			} catch (error) {
				const classified = classifyGuestError(error);

				// A read-only ruleset refuses an `update` as `permission-denied`, exactly
				// as it refuses a `list` for an account that is not an admin. Those two
				// mean opposite things here — one is "you are not an admin", the other is
				// "there is no rule allowing admins to write" — and the dashboard can
				// tell them apart because it has just read the collection successfully.
				throw classified instanceof AdminDeniedError
					? new AdminWriteRefusedError(classified.message)
					: classified;
			}
		}
	};
}