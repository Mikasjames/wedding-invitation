import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './download';
import { readAdminRow, type AdminRow } from './row';

function row(overrides: Partial<AdminRow> = {}): AdminRow {
	return readAdminRow('W8K9JPTR4M', {
		householdName: 'Dela Cruz Family',
		side: 'bride',
		seatsAllocated: 4,
		active: true,
		status: 'attending',
		partySize: 3,
		...overrides
	})!;
}

interface FakeAnchor {
	href: string;
	download: string;
	rel: string;
	clicks: number;
	removals: number;
	click(): void;
	remove(): void;
}

let anchor: FakeAnchor;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.useFakeTimers();

	anchor = {
		href: '',
		download: '',
		rel: '',
		clicks: 0,
		removals: 0,
		click() {
			this.clicks += 1;
		},
		remove() {
			this.removals += 1;
		}
	};

	Object.defineProperty(globalThis, 'document', {
		value: { createElement: () => anchor },
		configurable: true
	});

	createObjectURL = vi.fn(() => 'blob:demo');
	revokeObjectURL = vi.fn();

	Object.defineProperty(URL, 'createObjectURL', {
		value: createObjectURL,
		configurable: true
	});
	Object.defineProperty(URL, 'revokeObjectURL', {
		value: revokeObjectURL,
		configurable: true
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete (globalThis as { document?: unknown }).document;
});

describe('downloadCsv', () => {
	it('names the file after the date it was asked for', () => {
		downloadCsv([row()], new Date('2027-01-15T23:59:59Z'));

		expect(anchor.download).toBe('rsvps-2027-01-15.csv');
	});

	it('hands the CSV itself to the browser', async () => {
		downloadCsv([row()], new Date('2027-01-15T00:00:00Z'));

		const blob = createObjectURL.mock.calls[0][0] as Blob;

		expect(blob.type).toContain('text/csv');
		expect(await blob.text()).toContain('Dela Cruz Family');
	});

	it('clicks the anchor', () => {
		downloadCsv([row()]);

		expect(anchor.clicks).toBe(1);
		expect(anchor.href).toBe('blob:demo');
	});

	// The WebKit bug this whole delay exists for. Revoking synchronously after
	// `click()` starts a download the browser has not yet read the blob from, so
	// on iOS Safari and macOS WebKit the URL is gone before it is opened and the
	// file never arrives. Chromium and Firefox do not care, which is exactly why
	// it survives review and reaches a phone.
	it('does not revoke the object URL until the browser has had a moment', () => {
		downloadCsv([row()]);

		expect(revokeObjectURL).not.toHaveBeenCalled();
		expect(anchor.removals).toBe(0);

		vi.advanceTimersByTime(999);

		expect(revokeObjectURL).not.toHaveBeenCalled();
		expect(anchor.removals).toBe(0);

		vi.advanceTimersByTime(1);

		expect(revokeObjectURL).toHaveBeenCalledWith('blob:demo');
		expect(anchor.removals).toBe(1);
	});

	it('exports archived households rather than quietly dropping them', async () => {
		// The file is a record of what happened, and a household archived after the
		// cards went out still is one. `toCsv` carries `active` as `no` so a reader
		// can filter; dropping the row would make the export a different document
		// from the dashboard the couple is looking at.
		downloadCsv([row({ active: false })], new Date('2027-01-15T00:00:00Z'));

		const blob = createObjectURL.mock.calls[0][0] as Blob;

		expect(await blob.text()).toContain('"no"');
	});
});