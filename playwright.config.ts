import { defineConfig } from '@playwright/test';

// Blank the Firebase config for the test server. Vite gives `process.env`
// precedence over `.env`, and the RSVP flow treats an empty value as
// unconfigured — so the suite exercises the same graceful "not open yet" path a
// fresh clone gets.
//
// Without this the tests would inherit whatever is in a developer's `.env` and
// send real network requests to a real Firestore project, which is both
// non-deterministic and a bad thing for a test suite to do to a database.
const UNCONFIGURED = {
	PUBLIC_FIREBASE_API_KEY: '',
	PUBLIC_FIREBASE_AUTH_DOMAIN: '',
	PUBLIC_FIREBASE_PROJECT_ID: '',
	PUBLIC_FIREBASE_STORAGE_BUCKET: '',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
	PUBLIC_FIREBASE_APP_ID: '',
	PUBLIC_FIREBASE_MEASUREMENT_ID: '',
	PUBLIC_FIRESTORE_DATABASE_ID: ''
};

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	use: {
		baseURL: 'http://localhost:4173'
	},
	webServer: {
		command: 'pnpm build && pnpm preview',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: { ...process.env, ...UNCONFIGURED }
	}
});