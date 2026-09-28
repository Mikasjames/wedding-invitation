<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<!--
	Hero. The live countdown lands in Step 2 — the vertical rhythm here is
	final so it doesn't shift when the timer is added beneath the city line.
-->
<section class="relative grid min-h-[100svh] place-items-center overflow-hidden px-6 py-24">
	<!-- Soft champagne wash, keeps the ivory from reading as flat paper. -->
	<div
		class="pointer-events-none absolute inset-0 -z-10"
		style="background:
			radial-gradient(80% 55% at 50% 0%, rgb(212 175 55 / 0.09), transparent 70%),
			radial-gradient(60% 50% at 50% 100%, rgb(234 211 203 / 0.35), transparent 70%)"
		aria-hidden="true"
	></div>

	<div class="flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Save the date
		</p>

		<h1
			class="mt-6 font-display text-[clamp(3rem,15vw,4.5rem)] leading-[1.04] font-light
			       tracking-[0.01em] text-ink"
		>
			<span class="block italic">{wedding.names.split(' & ')[0]}</span>
			<span
				class="my-5 block font-display font-normal text-gold italic"
				style="font-size: clamp(1.5rem, 6vw, 2.25rem)"
				aria-hidden="true"
			>
				&amp;
			</span>
			<span class="block italic">{wedding.names.split(' & ')[1]}</span>
		</h1>

		<Ornament class="my-8" />

		<p class="font-display text-xl tracking-[0.06em] text-forest-800 sm:text-2xl">
			{wedding.dateLabel}
		</p>
		<p class="mt-3 font-body text-[11px] font-medium tracking-[0.28em] text-ink/50 uppercase">
			{wedding.city}
		</p>
	</div>
</section>
