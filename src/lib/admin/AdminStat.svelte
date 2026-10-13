<script lang="ts">
	interface Props {
		label: string;
		value: number;

		/** The one number on screen that matters most. */
		accent?: boolean;
	}

	let { label, value, accent = false }: Props = $props();
</script>

<div>
	<dt class="font-body text-[9px] font-medium tracking-[0.28em] text-gold-deep uppercase">
		{label}
	</dt>
	<!--
		A negative figure is never rounded away. `unfilledSeats` goes below zero
		when a household confirmed more seats than it was allotted, which is a
		document that needs fixing, not a number to tidy up.
	-->
	<dd
		class="font-display mt-1 text-3xl
			{value < 0 ? 'text-oxblood' : accent ? 'text-forest-700' : 'text-ink'}"
	>
		{value}
	</dd>
</div>