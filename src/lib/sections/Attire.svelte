<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="bg-powder/30 px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Dress Code
		</p>
		<Ornament class="my-6" />
		<h3 class="font-display text-2xl text-ink">{wedding.dressCode.title}</h3>
		<p class="mt-4 font-display text-lg leading-relaxed text-ink/70">
			{wedding.dressCode.description}
		</p>

		<ul
			class="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-6"
			aria-label="Dress code colors"
			data-palette
		>
			{#each wedding.dressCode.palette as colour}
				<li class="flex w-[4.5rem] flex-col items-center gap-2" data-palette-swatch>
					<span
						class="h-14 w-14 rounded-full ring-1 ring-ink/20"
						style:background-color={colour.hex}
						aria-hidden="true"
					></span>
					<span class="font-body text-[10px] font-medium tracking-[0.16em] text-bronze uppercase">
						{colour.name}
					</span>
				</li>
			{/each}
		</ul>
	</div>
</section>
