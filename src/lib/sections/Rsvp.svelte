<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import RsvpFlow from '$lib/rsvp/RsvpFlow.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="bg-champagne/30 px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Kindly respond
		</p>
		<Ornament class="my-6" />
		<p class="font-display text-lg text-ink/70">
			Please let us know by {wedding.rsvp.deadline}. If your invitation included a link,
			open it and your seats will already be waiting for you.
		</p>

		<RsvpFlow class="mt-10" />
	</div>
</section>