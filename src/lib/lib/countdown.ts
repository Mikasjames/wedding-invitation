/** The Hero's countdown, split out from the component so the arithmetic and
 *  the wording can be tested without rendering anything. */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface CountdownUnit {
	/** The number to print. */
	value: number;

	/** The unit noun, pluralised to match. The Hero prints these in small caps
	 *  under the number, so "1 MINUTES" is a real thing a guest would read. */
	label: string;
}

/** Milliseconds left until `start`, or 0 once it has passed. Clamping here
 *  rather than at the call site keeps every consumer from having to remember. */
export function remainingMs(start: Date, now: Date): number {
	return Math.max(0, start.getTime() - now.getTime());
}

export function hasStarted(start: Date, now: Date): boolean {
	return start.getTime() <= now.getTime();
}

export function countdown(start: Date, now: Date): CountdownUnit[] {
	const diff = remainingMs(start, now);

	return [
		unit(Math.floor(diff / DAY), 'day'),
		unit(Math.floor((diff % DAY) / HOUR), 'hour'),
		unit(Math.floor((diff % HOUR) / MINUTE), 'minute')
	];
}

/** One sentence for assistive tech, where the three-column layout carries none
 *  of the meaning it carries visually. */
export function countdownSentence(units: CountdownUnit[]): string {
	if (units.length === 0) return '';

	const phrases = units.map((u) => `${u.value} ${u.label}`);
	if (phrases.length === 1) return phrases[0];

	return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
}

function unit(value: number, noun: string): CountdownUnit {
	return { value, label: value === 1 ? noun : `${noun}s` };
}
