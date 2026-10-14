<script lang="ts">
	import type { AdminRow } from './row';

	interface Props {
		household: AdminRow;
	}

	let { household }: Props = $props();
</script>

<!--
	The two flags that mark a household as needing the couple's attention.

	Own component because the dashboard renders a household twice — a table row on
	a desktop and a card on a phone — and "over-committed" is a claim about a
	document's arithmetic that is worse to get wrong in one of them. One
	definition, both renderings.

	Renders nothing at all for the common case, which is why there is no wrapper
	element: a household that is neither archived nor over-committed should leave
	no trace, rather than an empty `<span>` the layout has to account for.
-->
{#if household.overcommitted}
	<span
		class="ml-2 rounded-full border border-oxblood/40 px-2 py-0.5 text-[9px] tracking-[0.18em] text-oxblood uppercase"
		title="Confirmed more seats than they were allocated"
	>
		Over
	</span>
{/if}

{#if !household.active}
	<span class="ml-2 text-[9px] tracking-[0.18em] text-ink/40 uppercase">Archived</span>
{/if}