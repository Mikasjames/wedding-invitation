<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="bg-powder/40 px-6 py-24">
	<div class="mx-auto flex max-w-xl flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			The Day
		</p>
		<Ornament class="my-6" />
		<div class="flex flex-col gap-10">
			{#each wedding.events as event}
				<div>
					<h3 class="font-display text-2xl text-ink">{event.name}</h3>
					<p class="mt-1 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase">
						{event.time} · {event.venue}
					</p>
					<p class="mt-3 font-display text-lg text-ink/70">{event.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
