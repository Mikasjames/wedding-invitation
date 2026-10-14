<script lang="ts">
	import { page } from '$app/state';
	import type { GuestList } from './guests.svelte';
	import { type HouseholdProblems, validateHousehold } from './household-form';
	import { copyText } from './clipboard';
	import type { Side } from '$lib/rsvp/types';
	import { invitationLink, invitationMessage } from '$lib/rsvp/message';

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

	/**
	 * A `<input type="number">` binds to a number, or `null` when the field is
	 * empty — never the string `''` this started as. Typing a seat count turned
	 * the value into a number, and the first `.trim()` on it threw.
	 */
	let seats = $state<number | null>(null);

	let side = $state<Side>('both');
	let email = $state('');
	let notes = $state('');
	let customMessage = $state('');
	let code = $state('');

	/** Per-field messages, so the copy stays next to the input it belongs to. */
	let problems = $state<HouseholdProblems>({});

	let copied = $state(false);
	let copiedError = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		// Validation lives in `household-form.ts`, not here. It was inline at first
		// and nothing could test it, which is how a `.trim()` on a number survived
		// review and reached a real submit.
		const result = validateHousehold({
			householdName,
			seats,
			side,
			email,
			notes,
			customMessage,
			code
		});

		if (!result.ok) {
			problems = result.problems;
			return;
		}

		problems = {};

		const created = await list.create(result.household);

		if (created) {
			copied = false;
			copiedError = false;
		}
	}

	function startAnother() {
		list.lastCreated = null;
		list.createError = null;
		householdName = '';
		seats = null;
		side = 'both';
		email = '';
		notes = '';
		customMessage = '';
		code = '';
		problems = {};
	}

	async function copyMessage() {
		const created = list.lastCreated;
		if (!created) return;

		copied = false;
		copiedError = false;

		// Shared with the household detail panel, so the refusal handling exists
		// once rather than being copied into a second copy button later.
		const ok = await copyText(
			invitationMessage({
				household: created.householdName,
				seats: created.seatsAllocated,
				code: created.code,
				site: SITE,
				// What they were given, not the shared template. The receipt is the
				// only place this wording appears outside the detail panel, and the
				// sheet it says to paste into Messenger has to be the one they wrote.
				custom: created.customMessage
			})
		);

		copied = ok;
		copiedError = !ok;
	}

	const messageText = $derived(
		list.lastCreated
			? invitationMessage({
					household: list.lastCreated.householdName,
					seats: list.lastCreated.seatsAllocated,
					code: list.lastCreated.code,
					site: SITE,
					// The same value the copy button uses, so what is read on screen
					// and what lands on the clipboard cannot be two different messages.
					custom: list.lastCreated.customMessage
				})
			: ''
	);

	/**
	 * Built by `invitationLink`, which is also what `invitationMessage` uses
	 * internally.
	 *
	 * It was assembled here as `${SITE}${base}/?code=`, which happens to agree
	 * because this deploys to a root domain and `base` is `''` — and disagrees the
	 * moment it does not. Two builders for one link is how a receipt ends up
	 * showing the couple a URL that the message beside it does not contain.
	 */
	const link = $derived(
		list.lastCreated ? invitationLink(SITE, list.lastCreated.code) : ''
	);

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
				<span class={LABEL}>Their invitation, in your own words (optional)</span>
				<textarea
					rows="3"
					bind:value={customMessage}
					placeholder="Leave blank and everyone gets the standard message"
					class="{FIELD} rounded-2xl"
					aria-invalid={problems.customMessage ? 'true' : undefined}
				></textarea>
				{#if problems.customMessage}
					<span class="font-body text-[11px] text-oxblood">{problems.customMessage}</span>
				{:else}
					<span class="font-body text-[11px] text-ink/50">
						For the one aunt who needs saying properly. Use {'{household}'}, {'{names}'},
						{'{deadline}'}, {'{link}'}, {'{code}'} and {'{seats}'}; the link is added for
						you if you leave it out.
					</span>
				{/if}
			</label>

			<label class="flex flex-col gap-2">
				<span class={LABEL}>Code (optional)</span>
				<input
					type="text"
					bind:value={code}
					placeholder="Leave blank and we will generate one"
					autocapitalize="characters"
					spellcheck="false"
					aria-invalid={problems.code ? 'true' : undefined}
					class="{FIELD} uppercase tracking-[0.2em]"
				/>
				{#if problems.code}
					<span class="font-body text-[11px] text-oxblood">{problems.code}</span>
				{/if}
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