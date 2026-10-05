<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Registry
		</p>
		<Ornament class="my-6" />
		<p class="font-display text-lg text-ink/70">
			Your presence is the only gift we ask for. For those who insist:
		</p>
		<div class="mt-8 flex flex-col gap-3">
			{#each wedding.registry as item}
				<a
					href={item.url}
					target="_blank"
					rel="noopener noreferrer"
					class="font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase underline-offset-4 hover:underline"
				>
					{item.name}
				</a>
			{/each}
		</div>
	</div>
</section>
