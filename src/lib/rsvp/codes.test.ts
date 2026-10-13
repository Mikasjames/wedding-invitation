import { describe, expect, it } from 'vitest';
import {
	ALPHABET,
	CODE_LENGTH,
	extractCode,
	generateCode,
	isValidCode,
	normalizeCode
} from './codes';

/** Deterministic bytes, so a failing generation test points at an index. */
function fixedFill(sequence: number[]) {
	return (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
		for (let i = 0; i < bytes.length; i++) bytes[i] = sequence[i % sequence.length];
		return bytes;
	};
}

describe('generateCode', () => {
	it('is the requested length', () => {
		expect(generateCode()).toHaveLength(CODE_LENGTH);
	});

	// The whole no-auth model assumes codes are unguessable, and that rests on
	// this alphabet being 32 symbols. An accidental edit that adds I or drops a
	// digit would shrink the search space without any visible symptom.
	it('only ever emits symbols from a 32-character alphabet', () => {
		expect(ALPHABET).toHaveLength(32);
		expect(new Set(ALPHABET).size).toBe(32);

		for (let i = 0; i < 500; i++) {
			for (const symbol of generateCode()) {
				expect(ALPHABET).toContain(symbol);
			}
		}
	});

	// A guest reading a code off a printed card has to be able to tell these four
	// apart from the digits they resemble. This is the reason for Crockford base32
	// rather than a bigger alphabet, so it needs a test or it will get "simplified"
	// back to A-Z0-9 eventually.
	it('never emits the glyphs that are easy to misread', () => {
		for (let i = 0; i < 500; i++) {
			expect(generateCode()).not.toMatch(/[ILOU]/);
		}
	});

	it('spreads its symbols across the alphabet rather than favouring a prefix', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) {
			for (const symbol of generateCode()) seen.add(symbol);
		}
		expect(seen.size).toBe(ALPHABET.length);
	});

	// Pins the byte → symbol mapping, and with it the absence of modulo bias.
	// The expectation is derived rather than typed so a change to the alphabet
	// shows up as a diff here instead of a silent retune of the search space.
	it('maps byte values onto the alphabet by index', () => {
		const bytes = [0, 1, 31, 33, 17, 100, 129, 200, 255, 7];
		const expected = bytes.map((b) => ALPHABET[b % ALPHABET.length]).join('');

		expect(generateCode(fixedFill(bytes))).toBe(expected);
		expect(expected).toBe('01Z1H418Z7');
	});

	it('does not repeat itself across many draws', () => {
		const codes = new Set(Array.from({ length: 1000 }, () => generateCode()));
		expect(codes.size).toBe(1000);
	});
});

describe('normalizeCode', () => {
	it('accepts a well-formed code unchanged', () => {
		expect(normalizeCode('W8K9JPTR4M')).toBe('W8K9JPTR4M');
	});

	it('upper-cases, trims and drops separators', () => {
		expect(normalizeCode('  w8k9 jp-tr4m ')).toBe('W8K9JPTR4M');
	});

	// The field says "enter your code", but a guest holding the invitation on
	// the same phone will paste the whole link into it. Stripping the domain
	// would otherwise produce 40-odd characters and a "your invitation is
	// invalid" message for a perfectly good code.
	it('survives a whole pasted URL', () => {
		expect(extractCode('https://draft-rsvp.mikasjames.com/?code=w8k9jptr4m')).toBe(
			'W8K9JPTR4M'
		);
		expect(extractCode('https://draft-rsvp.mikasjames.com/rsvp/?code=W8K9JPTR4M')).toBe(
			'W8K9JPTR4M'
		);
		expect(extractCode('https://x.example/?a=1&code=W8K9JPTR4M&b=2')).toBe('W8K9JPTR4M');
	});

	it('still prefers the bare code when given one', () => {
		expect(extractCode('W8K9JPTR4M')).toBe('W8K9JPTR4M');
		expect(extractCode('the code is W8K9JPTR4M thanks')).toBe('W8K9JPTR4M');
	});

	it('finds nothing when there is no code to find', () => {
		expect(extractCode('https://draft-rsvp.mikasjames.com/')).toBeNull();
		expect(extractCode('')).toBeNull();
		expect(extractCode(null)).toBeNull();
	});

	it('folds the glyphs a card invites a guest to misread', () => {
		expect(normalizeCode('W8K9JPTR4I')).toBe('W8K9JPTR41');
		expect(normalizeCode('W8K9JPTR4L')).toBe('W8K9JPTR41');
		expect(normalizeCode('W8K9J0TR4M')).toBe('W8K9J0TR4M');
		expect(normalizeCode('W8K9JPTRUV')).toBe('W8K9JPTRVV');
	});

	it('rejects anything that cannot be a code', () => {
		expect(normalizeCode('')).toBeNull();
		expect(normalizeCode('   ')).toBeNull();
		expect(normalizeCode('TOOSHORT')).toBeNull();
		expect(normalizeCode('W8K9JPTR4MX')).toBeNull();
		expect(normalizeCode(null)).toBeNull();
		expect(normalizeCode(undefined)).toBeNull();
	});

	// Folding is only safe because it never rewrites a symbol that appears in a
	// real code. Assert the property rather than trusting the reasoning: if
	// someone adds a mapping whose left-hand side is a legal symbol, two distinct
	// households could be folded onto one code and one family would silently
	// overwrite another's RSVP.
	it('never rewrites a symbol that a real code can contain', () => {
		const legal = [...ALPHABET];
		for (const symbol of legal) {
			expect(normalizeCode(symbol.repeat(CODE_LENGTH))).toBe(symbol.repeat(CODE_LENGTH));
		}
	});

	it('keeps distinct real codes distinct', () => {
		const seen = new Map<string, string>();

		for (let i = 0; i < 2000; i++) {
			const code = generateCode();
			const folded = normalizeCode(code)!;

			expect(folded).toBe(code);

			const clash = seen.get(folded);
			expect(clash, `${code} folded onto ${clash}`).toBeUndefined();
			seen.set(folded, code);
		}
	});
});

describe('isValidCode', () => {
	it('accepts generated codes', () => {
		expect(isValidCode('W8K9JPTR4M')).toBe(true);
	});

	// `isValidCode` gates the Firestore `allow get` path via the rules file's
	// regex, so the two must agree on what a code looks like.
	it('rejects the symbols the alphabet omits', () => {
		expect(isValidCode('W8K9JPTR4I')).toBe(false);
		expect(isValidCode('W8K9JPTR4L')).toBe(false);
		expect(isValidCode('W8K9JPTR4O')).toBe(false);
		expect(isValidCode('W8K9JPTR4U')).toBe(false);
	});
});