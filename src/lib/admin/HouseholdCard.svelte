<script lang="ts">
	import type { AdminRow } from './row';
	import type { RsvpStatus } from '$lib/rsvp/types';
	import HouseholdBadges from './HouseholdBadges.svelte';
	import HouseholdDetail from './HouseholdDetail.svelte';
	import type { GuestList } from './guests.svelte';

	interface Props {
		household: AdminRow;

		expanded: boolean;
		ontoggle: () => void;

		/** Passed through to the detail panel, which needs it to save a message. */
		list: GuestList;
	}

	let { household, expanded, ontoggle, list }: Props = $props();

	/**
	 * Status as a pill rather than the table's plain text.
	 *
	 * The table can rely on the column header to say what the word means; a card
	 * has no such crutch, and a status is the one thing on a card that is worth
	 * reading without expanding anything.
	 */
	const STATUS: Record<RsvpStatus, string> = {
		attending: 'border-forest-700/50 text-forest-700',
		declined: 'border-oxblood/40 text-oxblood',
		pending: 'border-gold/30 text-ink/50'
	};
</script>

<!--
	The phone rendering of one household.

	`AddHousehold` is built for a phone and says so — "we forgot Auntie" is typed
	from a phone — while the table beside it was `min-w-[42rem]` of horizontal
	scroll. A couple adding a household from the sofa then having to scroll a
	widening table sideways to read what they just added is the wrong way round,
	so below `sm` each household is a card instead.

	Same fields, same badges, same expand behaviour as the table row. The page
	owns `expandedCode`, so opening a household and rotating the phone keeps it
	open.
-->
<li class="px-4 py-4 {household.active ? '' : 'opacity-50'}">
	<button
		type="button"
		onclick={ontoggle}
		aria-expanded={expanded}
		aria-controls="card-detail-{household.code}"
		class="flex w-full items-baseline justify-between gap-3 text-left"
	>
		<span class="font-body text-sm text-ink">
			{household.householdName}
			<HouseholdBadges {household} />
		</span>

		<span class="shrink-0 text-[9px] tracking-[0.18em] text-ink/40 uppercase">
			{expanded ? 'Close' : 'Details'}
		</span>
	</button>

	<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
		<span class="font-body text-[11px] text-ink/50 capitalize">{household.side}</span>

		<span class="font-body text-[11px] text-ink/50">
			{household.seatsAllocated} {household.seatsAllocated === 1 ? 'seat' : 'seats'}
		</span>

		<span class="font-body text-[11px] text-ink">
			{household.partySize} confirmed
		</span>

		<span
			class="rounded-full border px-2 py-0.5 text-[9px] tracking-[0.18em] uppercase {STATUS[
				household.status
			]}"
		>
			{household.status}
		</span>

		<span class="font-body text-[11px] tracking-[0.16em] text-ink/40">{household.code}</span>
	</div>

	{#if expanded}
		<div id="card-detail-{household.code}" class="mt-4 border-t border-gold/20">
			<HouseholdDetail {household} {list} />
		</div>
	{/if}
</li>