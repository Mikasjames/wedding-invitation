import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	NetworkTimeoutError,
	RsvpClosedError,
	RsvpOfflineError,
	RsvpRefusedError,
	describeFailure,
	describeSaveFailure,
	withTimeout
} from './backend';

describe('withTimeout', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns the value when the call settles in time', async () => {
		await expect(withTimeout(Promise.resolve('household'), 50)).resolves.toBe('household');
	});

	// The failure this exists for: without it a hung listener leaves the guest on
	// a spinner at phase 'loading' with no retry and no way back.
	it('gives up on a call that never settles', async () => {
		vi.useFakeTimers();

		const never = new Promise<string>(() => {});
		const raced = withTimeout(never, 10_000);

		// The assertion is attached *before* the clock moves. Advancing first lets
		// the promise reject with nothing listening, which is an unhandled rejection
		// rather than a failed test.
		const assertion = expect(raced).rejects.toBeInstanceOf(NetworkTimeoutError);

		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
	});

	it('does not fire once the call has already won', async () => {
		vi.useFakeTimers();

		const raced = withTimeout(Promise.resolve('household'), 10_000);

		await expect(raced).resolves.toBe('household');

		// No timer left pending: a cleared one would keep a test process alive and,
		// in the browser, fire into a finished request.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('lets a rejection pass through untouched', async () => {
		await expect(withTimeout(Promise.reject(new RsvpOfflineError('down')), 50)).rejects.toBeInstanceOf(
			RsvpOfflineError
		);
	});
});

describe('describeFailure', () => {
	it('tells the guest about a slow call without implying their input is gone', () => {
		const message = describeFailure(new NetworkTimeoutError('no response'));

		expect(message).toMatch(/longer than expected/i);
		expect(message).toMatch(/try again/i);
	});

	// Guards the regression that made the timeout class worth adding: an error with
	// no Firestore `code` used to fall through to the generic bucket, so a slow
	// call read to the guest as a failed save.
	it('does not describe a timeout as a closed RSVP', () => {
		expect(describeFailure(new NetworkTimeoutError())).not.toMatch(/closed/i);
	});

	it('still describes a genuine refusal', () => {
		expect(describeFailure(new RsvpRefusedError('x'))).toMatch(/could not save/i);
	});
});

// The refusal that motivated this split. `isBeforeCutoff()` in the deployed rules
// returns true outright when the stored status is `pending`, so a first answer can
// never be refused by the cutoff.
describe('describeSaveFailure', () => {
	it('does not blame a closed RSVP for a refusal on a first answer', () => {
		const message = describeSaveFailure(new RsvpClosedError('permission denied'), true);

		expect(message).toMatch(/could not save/i);
		expect(message).not.toMatch(/have closed/i);
	});

	it('reassures the guest that their typing survived', () => {
		expect(describeSaveFailure(new RsvpClosedError('x'), true)).toMatch(/still here/i);
	});

	// An answered household can genuinely be refused by the cutoff, so it keeps the
	// original wording rather than being softened into a retry loop.
	it('still says closed when the household had already answered', () => {
		expect(describeSaveFailure(new RsvpClosedError('permission denied'), false)).toMatch(
			/have closed/i
		);
	});

	it('leaves every other failure alone', () => {
		const offline = new RsvpOfflineError('down');

		expect(describeSaveFailure(offline, true)).toBe(describeFailure(offline));
		expect(describeSaveFailure(offline, false)).toBe(describeFailure(offline));
	});
});