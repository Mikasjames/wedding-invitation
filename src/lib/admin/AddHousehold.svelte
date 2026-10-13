<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import type { GuestList } from './guests.svelte';
	import type { NewHousehold } from './guests.driver';
	import type { Side } from '$lib/rsvp/types';
	import { invitationMessage } from '$lib/rsvp/message';
	import { isValidEmail, isValidSeatCount } from '$lib/rsvp/guests';

	interface Props {
		list: GuestList;
		onclose: () => void;
	}

	let { list, onclose }: Props = $props();

	const SITE = $derived(page.url.origin);

	const SIDES: Array<{ value: Side; label: string }> = [
		{ value: 'bride', label: 'Bride' },
		{ value: 'groom', label: 'Groom' },
		{ value: 'both', label: 'Both' }
	];

	let householdName = $state('');
	let seats = $state('');
	let side = $state<Side>('both');
	let email = $state('');
	let notes = $state('');
	let code = $state('');

	/** Per-field messages, so the guest-facing copy stays with the input. */
	let problems = $state<Record<string, string>>({});

	let copied = $state(false);
	let copiedError = $state(false);

	/**
	 * Validated with the same predicates `pnpm seed` uses.
	 *
	 * Not for tidiness: a household this form accepted but the seed would have
	 * rejected is a household whose document shape the rest of the system has
	 * never seen.
	 */
	function validate(): NewHousehold | null {
		const found: Record<string, string> = {};

		const name = householdName.trim();
		if (!name) found.householdName = 'Give the household a name.';

		const seatsNumber = Number(seats);
		if (seats.trim() === '') found.seats = 'How many seats are reserved for them?';
		else if (!isValidSeatCount(seatsNumber)) found.seats = 'A household needs at least one seat.';

		const mail = email.trim();
		if (mail && !isValidEmail(mail)) found.email = 'That does not look like an email address.';

		problems = found;
		if (Object.keys(found).length) return null;

		return {
			householdName: name,
			side,
			seatsAllocated: seatsNumber,
			contactEmail: mail || null,
			notes: notes.trim(),
			// Blank means "generate one", which is almost always what is wanted.
			...(code.trim() ? { code: code.trim().toUpperCase() } : {})
		};
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		const household = validate();
		if (!household) return;

		const created = await list.create(household);

		if (created) {
			copied = false;
			copiedError = false;
		}
	}

	function startAnother() {
		list.lastCreated = null;
		list.createError = null;
		householdName = '';
		seats = '';
		side = 'both';
		email = '';
		notes = '';
		code = '';
		problems = {};
	}

	async function copyMessage() {
		const created = list.lastCreated;
		if (!created) return;

		copied = false;
		copiedError = false;

		try {
			await navigator.clipboard.writeText(
				invitationMessage({
					household: created.householdName,
					seats: created.seatsAllocated,
					code: created.code,
					site: SITE
				})
			);
			copied = true;
		} catch {
			// Refused outside a secure context and on older Android WebViews. Showing
			// the text is the fallback, which is what a paste into Messenger needs
			// anyway.
			copiedError = true;
		}
	}

	const messageText = $derived(
		list.lastCreated
			? invitationMessage({
					household: list.lastCreated.householdName,
					seats: list.lastCreated.seatsAllocated,
					code: list.lastCreated.code,
					site: SITE
				})
			: ''
	);

	const link = $derived(list.lastCreated ? `${SITE}${base}/?code=${list.lastCreated.code}` : '');

	const FIELD =
		'w-full rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40';
	const LABEL =
		'font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase';
</script>

<!--
	Deliberately built for a phone first. The dashboard table beside it is not, and
	this is the control the couple will reach for first — "we forgot Auntie" is
	typed from a phone, not a laptop, and it is the only way to add a household
	without a service-account key and a terminal.
-->
<section class="rounded-2xl border border-gold/20 bg-champagne/20 px-5 py-6">
	<h2 class="font-display text-xl text-ink">Add a household</h2>

	{#if list.lastCreated}
		<!--
			Not a confirmation for its own sake. Creating the document is half the job:
			the other half is getting a message to the guest, and the seed script's
			out/links.csv does not exist for a household added here.
		-->
		<p class="mt-3 font-body text-[11px] leading-relaxed text-ink/70">
			<span class="text-ink">{list.lastCreated.householdName}</span> is on the list with
			{list.lastCreated.seatsAllocated}
			{list.lastCreated.seatsAllocated === 1 ? 'seat' : 'seats'}. Send them this:
		</p>

		<p class="mt-4 rounded-2xl border border-gold/20 bg-ivory px-4 py-3 font-body text-[11px] leading-relaxed whitespace-pre-wrap text-ink/70">
			{messageText}
		</p>

		<div class="mt-4 flex flex-col gap-3">
			<button
				type="button"
				onclick={copyMessage}
				class="rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90"
			>
				{copied ? 'Copied' : 'Copy the message'}
			</button>

			{#if copiedError}
				<p class="font-body text-[11px] break-all text-ink/50">
					Your browser would not let us copy it. Select the text above instead.
				</p>
			{/if}

			<button
				type="button"
				onclick={startAnother}
				class="rounded-full border border-gold/30 px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
			>
				Add another
			</button>
		</div>

		<p class="mt-4 font-body text-[11px] text-ink/50">
			Their link is <span class="break-all text-ink/70">{link}</span>
		</p>
	{:else}
		{#if list.createError}
			<p role="alert" class="mt-4 rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] text-ink/70">
				{list.createError}
			</p>
		{/if}

		<form class="mt-5 flex flex-col gap-5" onsubmit={submit}>
			<label class="flex flex-col gap-2">
				<span class={LABEL}>Household</span>
				<input
					type="text"
					bind:value={householdName}
					placeholder="Dela Cruz Family"
					class={FIELD}
					aria-invalid={problems.householdName ? 'true' : undefined}
				/>
				{#if problems.householdName}
					<span class="font-body text-[11px] text-oxblood">{problems.householdName}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-2">
				<span class={LABEL}>Seats reserved</span>
				<input
					type="number"
					inputmode="numeric"
					min="1"
					step="1"
					bind:value={seats}
					placeholder="2"
					class={FIELD}
					aria-invalid={problems.seats ? 'true' : undefined}
				/>
				{#if problems.seats}
					<span class="font-body text-[11px] text-oxblood">{problems.seats}</span>
				{/if}
			</label>

			<fieldset class="flex flex-col gap-2">
				<legend class={LABEL}>Side</legend>
				<div class="grid grid-cols-3 gap-2">
					{#each SIDES as option (option.value)}
						<button
							type="button"
							onclick={() => (side = option.value)}
							aria-pressed={side === option.value}
							class="rounded-full border px-3 py-3 font-body text-[11px] transition
								{side === option.value
								? 'border-plum bg-plum text-champagne'
								: 'border-gold/30 text-ink/60 hover:opacity-80'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</fieldset>

			<label class="flex flex-col gap-2">
				<span class={LABEL}>Email (optional)</span>
				<input
					type="email"
					bind:value={email}
					placeholder="For your own reminders"
					class={FIELD}
					aria-invalid={problems.email ? 'true' : undefined}
				/>
				{#if problems.email}
					<span class="font-body text-[11px] text-oxblood">{problems.email}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-2">
				<span class={LABEL}>Notes (optional)</span>
				<textarea
					rows="2"
					bind:value={notes}
					placeholder="Anything you want to remember"
					class="{FIELD} rounded-2xl"
				></textarea>
			</label>

			<label class="flex flex-col gap-2">
				<span class={LABEL}>Code (optional)</span>
				<input
					type="text"
					bind:value={code}
					placeholder="Leave blank and we will generate one"
					autocapitalize="characters"
					spellcheck="false"
					class="{FIELD} uppercase tracking-[0.2em]"
				/>
				<span class="font-body text-[11px] text-ink/50">
					Only if a card is already printed with it. A code already in use is
					refused rather than overwritten.
				</span>
			</label>

			<div class="flex flex-col gap-3">
				<button
					type="submit"
					disabled={list.creating}
					class="w-full rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90 disabled:opacity-40"
				>
					{list.creating ? 'Adding…' : 'Add them'}
				</button>

				<button
					type="button"
					onclick={onclose}
					class="rounded-full border border-gold/30 px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}
</section>