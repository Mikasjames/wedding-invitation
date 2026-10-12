import { describe, expect, it } from 'vitest';
import { countdown, countdownSentence, hasStarted, remainingMs } from './countdown';

const start = new Date('2027-02-09T16:00:00+08:00');
const at = (iso: string) => new Date(iso);

describe('countdown', () => {
	it('splits the gap into days, hours and minutes', () => {
		const units = countdown(start, at('2027-02-06T21:58:00+08:00'));

		expect(units).toEqual([
			{ value: 2, label: 'days' },
			{ value: 18, label: 'hours' },
			{ value: 2, label: 'minutes' }
		]);
	});

	// The Hero prints the label in small caps straight under the number, so a
	// naive `${n} ${noun}s` puts "1 MINUTES" on the screen the one minute an
	// hour when the number is genuinely one.
	it('keeps the unit noun singular when the value is one', () => {
		const units = countdown(start, at('2027-02-09T15:00:00+08:00'));

		expect(units).toEqual([
			{ value: 0, label: 'days' },
			{ value: 1, label: 'hour' },
			{ value: 0, label: 'minutes' }
		]);
	});

	it('rounds every unit down, never up', () => {
		// 30s short of two full days: days is 1, not 2.
		const units = countdown(start, at('2027-02-07T16:00:30+08:00'));

		expect(units.map((u) => u.value)).toEqual([1, 23, 59]);
	});

	// Past the date the old inline `Math.max(0, ...)` froze at 0 · 0 · 0 in the
	// corner of the page forever. The gap is clamped, and `hasStarted` is what
	// lets the Hero swap in different copy instead.
	it('clamps to zero once the ceremony has started', () => {
		expect(remainingMs(start, at('2027-02-10T09:00:00+08:00'))).toBe(0);
		expect(hasStarted(start, at('2027-02-10T09:00:00+08:00'))).toBe(true);
		expect(hasStarted(start, at('2027-02-09T15:59:59+08:00'))).toBe(false);
	});

	it('reads the gap the same from any host clock', () => {
		const original = process.env.TZ;

		try {
			// 16:00 in Manila is 08:00 UTC, so this instant is 2 days, 10 hours
			// and 2 minutes out wherever the guest happens to be sitting.
			for (const hostZone of ['Pacific/Kiritimati', 'UTC', 'Pacific/Niue', 'America/Chicago']) {
				process.env.TZ = hostZone;

				const units = countdown(start, at('2027-02-06T21:58:00Z'));

				expect(units, `countdown under ${hostZone}`).toEqual([
					{ value: 2, label: 'days' },
					{ value: 10, label: 'hours' },
					{ value: 2, label: 'minutes' }
				]);
			}
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});
});

describe('countdownSentence', () => {
	it('reads as one sentence for screen readers', () => {
		const units = countdown(start, at('2027-02-06T21:58:00+08:00'));

		expect(countdownSentence(units)).toBe('2 days, 18 hours and 2 minutes');
	});

	it('does not leave a dangling "and" when only one unit is left', () => {
		expect(countdownSentence([{ value: 1, label: 'day' }])).toBe('1 day');
	});
});
