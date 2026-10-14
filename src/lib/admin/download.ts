import type { AdminRow } from './row';
import { csvFileName, toCsv } from './csv';

/**
 * How long the object URL outlives the click.
 *
 * Not a debounce and not a timeout in the usual sense — it is the gap WebKit
 * needs between being handed a blob URL and actually opening the blob. Revoking
 * synchronously after `click()` aborts the download on iOS Safari and macOS
 * WebKit: the click starts the download, the download has not yet read the
 * blob, and the URL it was about to read is gone. Chromium and Firefox do not
 * care, which is exactly why this survives to a phone.
 *
 * Long enough to cover a slow read on a phone, short enough that a couple who
 * export the list a dozen times in a session does not accumulate a dozen
 * retained blobs.
 */
const REVOKE_AFTER_MS = 1000;

/**
 * Saves the guest list as a CSV the couple can send to the caterer.
 *
 * The format, the column order and the filename all come from `csv.ts`, which
 * has the tests — this is the browser plumbing around them and adds no policy
 * of its own. Archived households are included, carrying `active` as `no`, so
 * the file stays a complete record that a reader can filter.
 *
 * `document` is reached only inside the function, never at module scope, so
 * importing this does not break the prerender.
 *
 * `now` is injectable so the filename is assertable; nothing else reads the
 * clock here.
 */
export function downloadCsv(rows: AdminRow[], now: Date = new Date()): void {
	const csv = toCsv(rows);
	const name = csvFileName(now);

	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');

	// Both attributes are needed. `download` is what makes it a save rather than a
	// navigation; `href` has to be set after `download` so some browsers pick up
	// the name they were given rather than one derived from the blob.
	link.href = url;
	link.download = name;
	link.rel = 'noopener';

	// The click below is dispatched rather than the element being appended:
	// Firefox on some platforms ignores an `a` that was never in the document.
	link.click();

	// Deferred, and deliberately not in a `finally`. See `REVOKE_AFTER_MS` — a
	// synchronous revoke is the WebKit bug this delay exists for.
	setTimeout(() => {
		URL.revokeObjectURL(url);
		link.remove();
	}, REVOKE_AFTER_MS);
}