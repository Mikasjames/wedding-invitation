/**
 * Invite codes.
 *
 * The code *is* the capability. A guest who holds one can read their household
 * and change their answer, and nobody else can address the document at all —
 * Firestore rules deny `list`, so there is no query to scrape. That whole model
 * rests on the code being unguessable, so the length here is a security
 * parameter, not a UX one. Do not shorten it to "6, it fits on a business card".
 *
 * 32 symbols at 10 characters is 32^10 ~ 1.13e15 combinations. Firestore rules
 * cannot rate-limit, so at a sustained 10k guesses/second that is still
 * thousands of years. At 6 characters it is 32^6 ~ 1.07e9 — about twelve days of
 * unbroken work, which is *not* a margin.
 */

/** Crockford base32: 0-9 then the alphabet minus I, L, O and U. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CODE_LENGTH = 10;

/**
 * Exactly the characters `ALPHABET` contains, written out as a character class
 * so the rules file and this module can be eyeballed against each other.
 * 0-9, A-H, J-K, M-N, P-T, V-Z.
 */
export const CODE_PATTERN = /^[0-9A-HJ-KM-NP-TV-Z]{10}$/;

/**
 * Reads that guests make off a printed card, folded onto the symbol they meant.
 *
 * The critical property: every character on the left is absent from `ALPHABET`,
 * so no valid code is ever rewritten. Folding is the identity on valid codes,
 * which makes it injective — two *different* real codes can never fold onto the
 * same string. A wrong reading is only ever turned into the right code, never
 * one real code into another. `codes.test.ts` asserts that property directly
 * rather than trusting the argument.
 */
const MISREADINGS: ReadonlyArray<readonly [RegExp, string]> = [
	[/[IL]/g, '1'],
	[/O/g, '0'],
	// U has no standard Crockford alias, but it is the one glyph a V is likely to
	// be misread as. Harmless for the reason above.
	[/U/g, 'V']
];

export function generateCode(fill?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>): string {
	const bytes = (fill ?? fillRandomBytes)(new Uint8Array(CODE_LENGTH));

	let code = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		// `ALPHABET.length` is 32 and a byte is 0-255, so the modulo is exact and
		// needs no rejection sampling — the two powers of two divide evenly.
		code += ALPHABET[bytes[i] % ALPHABET.length];
	}

	return code;
}

function fillRandomBytes(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
	// `crypto.getRandomValues` exists in browsers and in Node 19+, so this module
	// stays importable from both the client bundle and the seed script.
	return crypto.getRandomValues(bytes);
}

/**
 * Accepts whatever the guest's keyboard did to their code and returns a usable
 * one, or `null` if it cannot be one. Tolerant by design: this is the only input
 * a guest types by hand, and the alternative to forgiving them is a support
 * message about a font.
 */
export function normalizeCode(input: string | null | undefined): string | null {
	if (!input) return null;

	let code = input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

	for (const [pattern, replacement] of MISREADINGS) {
		code = code.replace(pattern, replacement);
	}

	return CODE_PATTERN.test(code) ? code : null;
}

/** Whether an already-normalised code is one this system could have issued. */
export function isValidCode(code: string): boolean {
	return CODE_PATTERN.test(code);
}

/** `?code=X`, `#code=X`, or `&code=X` anywhere in a pasted string. */
const CODE_IN_URL = /[?&#]code=([0-9a-z]+)/i;

/**
 * Recovers a code from whatever a guest actually pasted into the box.
 *
 * The field is labelled "enter your code", but a guest holding the invitation
 * message on the same phone will very plausibly paste the whole link into it
 * instead. Strict normalisation turns `https://…/?code=W8K9JPTR4M` into 40-odd
 * characters of domain and rejects it, which reads as "your invitation is
 * invalid" rather than "you pasted more than I needed".
 *
 * Tried in order: the value as typed, then a `code` query parameter anywhere in
 * it, then each whitespace-separated token from the right. Every candidate still
 * goes through `normalizeCode`, so none of this widens what counts as a valid
 * code — it only finds one where a strict check would have given up.
 */
export function extractCode(input: string | null | undefined): string | null {
	if (!input) return null;

	const direct = normalizeCode(input);
	if (direct) return direct;

	const fromQuery = input.match(CODE_IN_URL);
	if (fromQuery) {
		const parsed = normalizeCode(fromQuery[1]);
		if (parsed) return parsed;
	}

	// Right to left, so a trailing code wins over a leading one. The code is
	// nearly always the last thing typed.
	const tokens = input.trim().split(/\s+/);
	for (let i = tokens.length - 1; i >= 0; i--) {
		const parsed = normalizeCode(tokens[i]);
		if (parsed) return parsed;
	}

	return null;
}