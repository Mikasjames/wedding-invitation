<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import Sprig from '$lib/components/Sprig.svelte';
	import { wedding } from '$lib/lib/wedding';
	import { reveal } from '$lib/state/reveal.svelte';
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

	<!--
		Botanical accents, opposite corners, clipped by the section's own
		overflow-hidden so they bleed off the edges rather than sitting inside
		them. Asymmetric on purpose: mirrored sprays read as clip art, and the
		two illustrations are different species anyway, so mirroring would only
		highlight the mismatch.

		The two counter-rotate: plant_2 descends from the top right, its leaves
		and blossom clusters trailing down and in, while plant_1 rises from the
		bottom left, its grass-like leaves sweeping up. Opposed diagonals, so
		the pair frames the names instead of both leaning the same way, and the
		eye travels top-right to bottom-left along them.

		Both are held off the text column, and both needed it. Each illustration
		occupies only part of its own box — the empty margins are lopsided, not
		symmetric — so the offset that looks correct against the bounding box
		is not the one that clears the type. plant_2 at 58% reached under the
		date line and crossed its descenders; plant_1 at 30% was pushed so far
		out it stopped reading as a sprig at all. The sizes below are the ones
		that clear the column, found by rendering the page rather than by
		reading the numbers.

		Sizes taper on small screens, where the column is nearly the full width
		and the edge bleed does the work instead. `opacity-[0.55]` rather than a
		bare `opacity-55`, which is not in Tailwind 4's scale.

		Both sit behind the content column at z-0 while the content is z-10, so
		the type is never behind a leaf.

		They settle in when the curtain opens — see the transitions in Sprig,
		which carry the timing and the reasoning. The motion is keyed off
		`reveal.opened` rather than any curtain-internal state, because that is
		the one signal the Hero can read without the curtain having to expose
		its timeline. It also means the plants do not care how the curtain was
		opened, only that it was.
	-->
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
