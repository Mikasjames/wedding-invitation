import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

function stubClipboard(value: unknown) {
	Object.defineProperty(globalThis.navigator, 'clipboard', {
		value,
		configurable: true,
		writable: true
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('copyText', () => {
	it('reports success', async () => {
		const writeText = vi.fn(async () => {});
		stubClipboard({ writeText });

		expect(await copyText('W8K9JPTR4M')).toBe(true);
		expect(writeText).toHaveBeenCalledWith('W8K9JPTR4M');
	});

	it('reports a refusal rather than throwing', async () => {
		// The caller owes the couple one sentence saying so, and nothing else.
		// A rejected promise escaping into a click handler would leave the button
		// stuck on "Copied" forever.
		stubClipboard({
			writeText: vi.fn(async () => {
				throw new Error('Write permission denied');
			})
		});

		expect(await copyText('W8K9JPTR4M')).toBe(false);
	});

	it('reports refusal when there is no clipboard at all', async () => {
		// Outside a secure context and on older Android WebViews `navigator.clipboard`
		// is absent rather than refusing, so this throws a TypeError on the way in —
		// the same outcome for the caller, which is why it is one code path.
		stubClipboard(undefined);

		expect(await copyText('W8K9JPTR4M')).toBe(false);
	});
});