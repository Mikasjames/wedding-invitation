/**
 * Copies text, reporting refusal rather than throwing.
 *
 * `navigator.clipboard` is refused outside a secure context and on older Android
 * WebViews, so this is a path the dashboard takes in the field rather than a
 * theoretical one. `AddHousehold` grew its own `try`/`catch` with its own
 * fallback copy, and the detail panel needs the identical behaviour — so the
 * decision lives here once and both callers show the text instead when it comes
 * back `false`.
 *
 * A boolean rather than a thrown error because the failure is never worth
 * interrupting anything for: the fallback is "select the text and paste", and
 * the only thing the caller owes the couple is a sentence saying so.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		// Throws a `TypeError` outright when `navigator.clipboard` is undefined,
		// which is the insecure-context case rather than a permission one — same
		// outcome for the caller either way.
		await navigator.clipboard.writeText(text);

		return true;
	} catch {
		return false;
	}
}