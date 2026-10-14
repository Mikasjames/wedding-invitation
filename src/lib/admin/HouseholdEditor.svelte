<script lang="ts">
	import { untrack } from 'svelte';
	import type { GuestList } from './guests.svelte';
	import { type HouseholdEditProblems, validateHouseholdEdit } from './household-form';
	import type { AdminRow } from './row';
	import type { Side } from '$lib/rsvp/types';

	interface Props {
		household: AdminRow;
		list: GuestList;

		onclose: () => void;
	}

	let { household, list, onclose }: Props = $props();

	const SIDES: Array<{ value: Side; label: string }> = [
		{ value: 'bride', label: 'Bride' },
		{ value: 'groom', label: 'Groom' },
		{ value: 'both', label: 'Both' }
	];

	/**
	 * Seeded from the row rather than refetched.
	 *
	 * `untrack` because the row is replaced after every write — `#reRead` swaps in new
	 * objects — and tracked, a save would reset the fields under the cursor while they
	 * were still typing in them. Same reasoning as `MessageEditor`, for the same
	 * reason.
	 */
	let name = $state(untrack(() => household.householdName));
	let seats = $state<number | null>(untrack(() => household.seatsAllocated));
	let side = $state<Side>(untrack(() => household.side));
	let email = $state(untrack(() => household.contactEmail ?? ''));
	let notes = $state(untrack(() => household.notes));
	let active = $state(untrack(() => household.active));

	let problems = $state<HouseholdEditProblems>({});

	/**
	 * What the household has already confirmed, re-read rather than captured.
	 *
	 * The row is replaced after every write, so a count captured once would leave the
	 * guard checking a number that is no longer stored — and this is the number the
	 * whole seat rule is about.
	 */
	const confirmed = $derived(household.partySize);

	/**
	 * Whether the allocation has gone below what has already been confirmed.
	 *
	 * A separate condition from `problems` because it is not a mistake to be corrected —
	 * it is a fact about the household. Raising the number resolves it, and typing a
	 * different smaller one does not, so it gets its own wording.
	 */
	const belowConfirmed = $derived(
		seats !== null && Number.isFinite(seats) && seats >= 1 && seats < confirmed
	);

	const changed = $derived(
		name.trim() !== household.householdName ||
			seats !== household.seatsAllocated ||
			side !== household.side ||
			(email.trim() || null) !== household.contactEmail ||
			notes.trim() !== household.notes ||
			active !== household.active
	);

	async function save() {
		const result = validateHouseholdEdit(
			{ householdName: name, seatsAllocated: seats, side, contactEmail: email, notes, active },
			confirmed
		);

		if (!result.ok) {
			problems = result.problems;
			return;
		}

		problems = {};

		// Closes only on success, so a refused save leaves the draft and the problems
		// on screen rather than discarding what the couple typed.
		if (await list.update(household.code, result.edit)) onclose();
	}

	// The one edit whose consequences are not visible on this screen: afterwards the
	// household's link stops working for them, and all the dashboard says is a badge.
	const archiving = $derived(household.active && !active);

	const FIELD =
		'w-full rounded-2xl border border-gold/30 bg-ivory px-4 py-3 font-body text-sm text-ink placeholder:text-ink/40';
	const LABEL = 'font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase';
</script>

<!--
	The couple's own fields on one household.

	`MessageEditor` owns the invitation wording, with its own preview and its own save.
	Keeping this to the remaining owner fields means neither is a form that mostly
	duplicates the other, and a save here is the six keys the deployed admin arm of
	`allow update` names — never the guest's answer, and never `partySize`.

	Who this is and what they have already answered stays above the form rather than
	being replaced by it: the seat rule below is the one thing the couple has to read
	carefully, and it is unreadable without knowing the confirmed count.

	Nothing here decides whether a save is permitted beyond the seat rule. The rules
	are the guard; this repeats them so the couple is told before the round trip.
-->
<div class="flex flex-col gap-5">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<p class="font-body text-sm text-ink">{household.householdName}</p>
		<p class="font-body text-[11px] tracking-[0.16em] text-ink/50 uppercase">
			{household.code}
		</p>
		<p class="font-body text-[11px] text-ink/50 capitalize">{household.status}</p>
		{#if confirmed > 0}
			<p class="font-body text-[11px] text-ink/50">
				{confirmed} of {household.seatsAllocated}
				{household.seatsAllocated === 1 ? 'seat' : 'seats'} confirmed
			</p>
		{/if}
	</div>

	<label class="flex flex-col gap-2">
		<span class={LABEL}>Household</span>
		<input
			type="text"
			bind:value={name}
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
			class={FIELD}
			aria-invalid={problems.seatsAllocated || belowConfirmed ? 'true' : undefined}
		/>
		{#if problems.seatsAllocated}
			<span class="font-body text-[11px] text-oxblood">{problems.seatsAllocated}</span>
		{:else if belowConfirmed}
			<!--
				Not phrased as a mistake. Nothing is wrong with the number they typed, it
				just cannot be true — and "this field is invalid" would be the wrong
				instruction for the one case where the answer is to raise it to what the
				household has already confirmed.
			-->
			<span class="font-body text-[11px] leading-relaxed text-oxblood">
				{confirmed} seats are already confirmed for this household, so their
				allocation cannot go below that. Raise it to {confirmed} or more, or ask them
				to change their answer.
			</span>
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
		<span class={LABEL}>Email</span>
		<input
			type="email"
			bind:value={email}
			placeholder="For your own reminders"
			class={FIELD}
			aria-invalid={problems.contactEmail ? 'true' : undefined}
		/>
		{#if problems.contactEmail}
			<span class="font-body text-[11px] text-oxblood">{problems.contactEmail}</span>
		{:else}
			<span class="font-body text-[11px] text-ink/50">Never shown to a guest.</span>
		{/if}
	</label>

	<label class="flex flex-col gap-2">
		<span class={LABEL}>Your notes</span>
		<textarea
			rows="3"
			bind:value={notes}
			placeholder="Anything you want to remember"
			class={FIELD}
		></textarea>
		<span class="font-body text-[11px] text-ink/50">Couple-internal. Never shown to a guest.</span>
	</label>

	<!--
		A checkbox rather than a button labelled Archive, because it is a field on the
		household and saves as one like the rest. Reversible, and shown here as the
		current value rather than as an action to confirm.
	-->
	<label class="flex items-start gap-3">
		<input type="checkbox" bind:checked={active} class="mt-0.5" />
		<span class="flex flex-col gap-1">
			<span class="font-body text-[11px] text-ink">Still invited</span>
			<span class="font-body text-[11px] leading-relaxed text-ink/50">
				{#if active}
					Their link works and they can answer.
				{:else}
					Their link stops working, and it lands on a page saying the household is no
					longer active rather than a failure. The code may already be printed, so
					this archives rather than deletes — tick it again to put them back.
				{/if}
			</span>
		</span>
	</label>

	{#if archiving}
		<p
			role="status"
			class="rounded-full border border-oxblood/30 bg-ivory px-4 py-3 font-body text-[11px] leading-relaxed text-ink/70"
		>
			Saving takes {household.householdName} off the list. Their invitation link will stop
			working, and no message will be written for them again.
		</p>
	{/if}

	{#if list.editError}
		<p
			role="alert"
			class="rounded-full border border-oxblood/30 bg-ivory px-4 py-3 font-body text-[11px] leading-relaxed text-ink/70"
		>
			{list.editError}
		</p>
	{/if}

	<div class="flex flex-wrap gap-3">
		<button
			type="button"
			onclick={save}
			disabled={!changed || list.savingEdit}
			class="rounded-full border border-gold/30 bg-plum px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90 disabled:opacity-40"
		>
			{list.savingEdit ? 'Saving…' : 'Save changes'}
		</button>

		<button
			type="button"
			onclick={onclose}
			class="rounded-full border border-gold/30 px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
		>
			Cancel
		</button>
	</div>
</div>