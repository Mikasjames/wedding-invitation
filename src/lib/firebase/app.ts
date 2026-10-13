import { browser } from '$app/environment';
import type { FirebaseApp } from 'firebase/app';

/**
 * The one Firebase app, and the only place `initializeApp` is called.
 *
 * Shared by the RSVP flow and the admin dashboard so both bind to the same
 * instance. Firebase keys apps by name and `initializeApp` on a name that
 * already exists re-reads the existing app rather than making a second one, but
 * going through a single cached promise here means neither consumer can race the
 * other into a duplicate initialisation.
 */
const env = import.meta.env as Record<string, string | undefined>;

/**
 * These are not secrets. The Firebase web config is designed to ship inside
 * client bundles and is protected by security rules, not by being hidden.
 *
 * They come through `import.meta.env` rather than `$env/static/public` because
 * that module's exports are generated only from a real `.env`, which would break
 * the build on a fresh clone and in the Playwright web server. A missing key
 * yields `undefined` rather than a build error, which is what lets both flows
 * degrade to "not available" instead of failing to compile.
 */
const config = {
	apiKey: env.PUBLIC_FIREBASE_API_KEY,
	authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: env.PUBLIC_FIREBASE_APP_ID,

	/**
	 * Carried because the deploy workflow passes it through. Unused — analytics
	 * was not part of the ask — but having it here makes turning it on a one-line
	 * change rather than a workflow edit.
	 */
	measurementId: env.PUBLIC_FIREBASE_MEASUREMENT_ID
};

/**
 * Whether there is enough configuration to talk to Firebase at all.
 *
 * Requires what Firestore needs (`apiKey`, `projectId`, `appId`). Auth additionally
 * needs `authDomain`, which is part of the same console block, so a config that
 * passes this check is one Auth will accept.
 */
export function isConfigured(): boolean {
	return Boolean(config.apiKey && config.projectId && config.appId);
}

export class FirebaseNotConfiguredError extends Error {
	constructor() {
		super('Firebase is not configured');
		this.name = 'FirebaseNotConfiguredError';
	}
}

let app: Promise<FirebaseApp> | null = null;

/**
 * The Firebase app, loaded on demand.
 *
 * Dynamic because a guest who never scrolls to the RSVP section, and never visits
 * `/admin`, should not download the SDK. `firebase/app` is a static import here
 * in type position only — the value import below is what actually defers.
 */
export function getApp(): Promise<FirebaseApp> {
	if (!browser || !isConfigured()) {
		return Promise.reject(new FirebaseNotConfiguredError());
	}

	app ??= import('firebase/app').then(
		({ getApps, initializeApp }) => getApps()[0] ?? initializeApp(config)
	);

	return app;
}