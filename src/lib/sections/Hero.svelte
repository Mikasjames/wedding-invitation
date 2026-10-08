<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import Sprig from '$lib/components/Sprig.svelte';
	import { wedding } from '$lib/lib/wedding';
	import { reveal } from '$lib/state/reveal.svelte';
	import { onMount } from 'svelte';

	let now = $state(Date.now());
	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(id);
	});

	const diff = $derived(Math.max(0, wedding.start.getTime() - now));
	const days = $derived(Math.floor(diff / 86_400_000));
	const hours = $derived(Math.floor((diff % 86_400_000) / 3_600_000));
	const minutes = $derived(Math.floor((diff % 3_600_000) / 60_000));
</script>

<section class="relative grid min-h-[100svh] place-items-center overflow-hidden px-6 py-24">
	<div
		class="pointer-events-none absolute inset-0 -z-10"
		style="background:
			radial-gradient(80% 55% at 50% 0%, rgb(212 175 55 / 0.09), transparent 70%),
			radial-gradient(60% 50% at 50% 100%, rgb(234 211 203 / 0.35), transparent 70%)"
		aria-hidden="true"
	></div>

	<div
		class="pointer-events-none absolute inset-0 z-0"
		class:is-revealed={reveal.opened}
		aria-hidden="true"
	>
		<Sprig
			src="/plants/plant_2.svg"
			ratio={659 / 641}
			from="top-right"
			class="absolute -top-[10%] -right-[11%] w-[46%] opacity-[0.55] sm:-top-[9%] sm:-right-[10%] sm:w-[48%] lg:-right-[8%] lg:w-[46%]"
		/>
		<Sprig
			src="/plants/plant_1.svg"
			ratio={640 / 725}
			from="bottom-left"
			class="absolute -bottom-[7%] -left-[9%] w-[36%] opacity-[0.55] sm:-bottom-[7%] sm:-left-[8%] sm:w-[36%] lg:w-[36%]"
		/>
	</div>

	<div class="relative z-10 flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Save the date
		</p>

		<h1
			class="mt-6 font-names text-[clamp(3rem,15vw,4.5rem)] leading-[1.08] font-light
			       tracking-[0.04em] text-ink"
		>
			<span class="block">{wedding.names.split(' & ')[0]}</span>
			<span
				class="my-5 block font-names font-normal text-gold"
				style="font-size: clamp(1.5rem, 6vw, 2.25rem)"
				aria-hidden="true"
			>
				&amp;
			</span>
			<span class="block">{wedding.names.split(' & ')[1]}</span>
		</h1>

		<Ornament class="my-8" />

		<p class="font-display text-xl tracking-[0.06em] text-forest-800 sm:text-2xl">
			{wedding.dateLabel}
		</p>
		<p class="mt-3 font-body text-[11px] font-medium tracking-[0.28em] text-ink/50 uppercase">
			{wedding.city}
		</p>

		<p class="mt-8 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase">
			{days} days · {hours} hours · {minutes} minutes
		</p>
	</div>
</section>
