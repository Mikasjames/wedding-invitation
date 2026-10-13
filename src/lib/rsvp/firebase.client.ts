import { browser } from '$app/environment';
import type { Firestore } from 'firebase/firestore';
import { getApp, isConfigured } from '../firebase/app';
import type { ResponseFields, Rsvp } from './types';
import { readRsvp } from './types';
import {
	type RsvpBackend,
	RsvpClosedError,
	RsvpNotFoundError,
	RsvpOfflineError,
	RsvpRefusedError
} from './backend';

/** The Firestore instance and the SDK namespace it came from, loaded together. */
type Runtime = { db: Firestore; firestore: typeof import('firebase/firestore') };

let runtime: Promise<Runtime> | null = null;

/**
 * Deliberately *not* using Firestore's offline persistence.
 *
 * With a local cache, `setDoc` resolves once the write is durable on the device
 * rather than once the server has accepted it, which is what would let the flow
 * survive a weak connection. It also means security rules are not evaluated
 * against the local write: anything running on the origin could patch the
 * IndexedDB and claim more seats than the household was allotted. The server
 * still refuses it on sync, but the guest would have seen a receipt the rules
 * had already contradicted.
 *
 * The seat cap is the one guarantee this system makes, so it stays server-side
 * and the receipt waits for the server to agree. A dropped connection costs a
 * retry, not a lie.
 */
async function getRuntime(): Promise<Runtime> {
	if (!browser || !isConfigured()) {
		throw new RsvpNotFoundError('Firestore is not configured');
	}

	runtime ??= (async () => {
		const [app, firestore] = await Promise.all([getApp(), import('firebase/firestore')]);

		return { db: firestore.getFirestore(app), firestore };
	})();

	return runtime;
}

/** Translates a Firestore error into the one thing the guest is told. */
function mapError(error: unknown): never {
	const code = (error as { code?: string } | null)?.code ?? '';

	if (code === 'permission-denied') {
		// The rules deny `get` on an archived household and deny every write past
		// the cutoff, so a refusal covers both "not yours" and "too late".
		throw new RsvpClosedError('permission denied');
	}

	if (code === 'unavailable' || code === 'deadline-exceeded') {
		throw new RsvpOfflineError(code);
	}

	throw new RsvpRefusedError(code || 'unknown');
}

/**
 * The real backend, loaded lazily so the Firebase SDK is not in the bundle of a
 * guest who never reaches the RSVP section — it is roughly 100 KB gzipped,
 * against an invitation whose entire point is arriving fast on a phone. Hence
 * dynamic imports throughout, with no static import of `firebase/*` anywhere in
 * this file: one static import would defeat the whole thing.
 *
 * Returns `null` when Firestore is unconfigured, which is also how a fresh
 * checkout and the Playwright web server run.
 */
export async function getBackend(): Promise<RsvpBackend | null> {
	if (!browser || !isConfigured()) return null;

	return {
		async fetch(code): Promise<Rsvp | null> {
			const { db, firestore } = await getRuntime();

			try {
				// `doc()`, never `where(documentId(), '==', ...)`: the second is a
				// `list` operation and `firestore.rules` denies those.
				const snapshot = await firestore.getDoc(firestore.doc(db, 'rsvps', code));

				return snapshot.exists() ? readRsvp(snapshot.data()) : null;
			} catch (error) {
				mapError(error);
			}
		},

		async save(code, response: ResponseFields): Promise<void> {
			const { db, firestore } = await getRuntime();

			try {
				await firestore.updateDoc(firestore.doc(db, 'rsvps', code), {
					status: response.status,
					partySize: response.partySize,
					attendeeNames: response.attendeeNames,
					dietaryNotes: response.dietaryNotes,
					message: response.message,
					// A server timestamp rather than the device clock, so a guest with
					// the wrong timezone does not file their answer under the wrong day.
					respondedAt: firestore.serverTimestamp()
				});
			} catch (error) {
				mapError(error);
			}
		}
	};
}