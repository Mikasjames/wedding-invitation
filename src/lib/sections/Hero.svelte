<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import Sprig from '$lib/components/Sprig.svelte';
	import { countdown, countdownSentence, hasStarted } from '$lib/lib/countdown';
	import { wedding } from '$lib/lib/wedding';
	import { reveal } from '$lib/state/reveal.svelte';
	import { onMount } from 'svelte';

	// The page is prerendered, so a `Date.now()` read during render would bake
	// the gap into the static HTML and freeze it there for every guest who
	// never runs the client bundle. Read the clock on mount instead and show
	// the digits only once they mean something.
	let now = $state(0);

	onMount(() => {
		now = Date.now();

		const id = setInterval(() => {
			now = Date.now();
			if (hasStarted(wedding.start, new Date(now))) clearInterval(id);
		}, 60_000);

		return () => clearInterval(id);
	});

	const started = $derived(now > 0 && hasStarted(wedding.start, new Date(now)));
	const units = $derived(countdown(wedding.start, new Date(now)));
</script>

<section class="relative grid min-h-[100svh] place-items-center overflow-hidden px-6 py-24">
	<div
		class="pointer-events-none absolute inset-0 -z-10"
		style="background:
			radial-gradient(80% 55% at 50% 0%, rgb(212 175 55 / 0.09), transparent 70%),
			radial-gradient(60% 50% at 50% 100%, rgb(234 211 203 / 0.35), transparent 70%)"
		aria-hidden="true"
	></div>

	<!--
		Full-bleed watermarks, deliberately. Both plants span the whole hero and sit
		behind the type, which is the look: the botanical work reads as a wash under
		the words rather than a decoration competing with them at the corners.

		THE `w-*` CLASSES ARE NOT INERT, and the boundary between them and `w-full`
		is the whole subtlety here. `w-[60%]` and `w-[46%]` are *base* utilities, in
		the same Tailwind layer as the `w-full` inside Sprig, so `w-full` wins and the
		plants are full-bleed below `sm:`. The `sm:` and `lg:` ones are variants,
		which Tailwind emits in later media blocks, and they *do* apply. So the
		realised width is: full-bleed under 640px, 52%/40% from `sm`, 46%/36% at `lg`.

		That leaves a gap. Between roughly 520px and the `sm:` breakpoint the plants
		are still full-bleed, so their heights scale with the viewport while the
		hero's height does not — and they grow into each other. With these two ratios
		they meet once the viewport is wider than about 0.555 of its height, which
		is nothing at 375 × 812 and plenty at 600 × 900.

		`min-[520px]:max-w-*` closes it. `max-w-*` is a different property, so it
		always applies, and at the `sm:` and `lg:` values it changes nothing:
		`max-w-[52%]` permits the 52% that `sm:` sets and the 46% that `lg:` sets.
		So this caps exactly the band it names and leaves every other width pixel
		for pixel as it was.
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
			class="absolute -top-[10%] -right-[11%] w-[60%] min-[520px]:max-w-[52%] [--sprig-opacity:0.55] sm:-top-[9%] sm:-right-[10%] sm:w-[52%] sm:[--sprig-opacity:1] lg:-right-[8%] lg:w-[46%]"
		/>
		<Sprig
			src="/plants/plant_1.svg"
			ratio={640 / 725}
			from="bottom-left"
			class="absolute -bottom-[7%] -left-[9%] w-[46%] min-[520px]:max-w-[40%] [--sprig-opacity:0.55] sm:-bottom-[7%] sm:-left-[8%] sm:w-[40%] sm:[--sprig-opacity:1] lg:w-[36%]"
		/>
	</div>

	<div class="relative z-10 flex max-w-md flex-col items-center text-center" data-hero-type>
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Save the date
		</p>

		<h1 class="sr-only">{wedding.names}</h1>
		<img
			src="/names.svg"
			alt=""
			aria-hidden="true"
			width={1372}
			height={1387}
			decoding="async"
			class="mt-6 block h-auto w-[min(70vw,18rem)] max-w-full select-none"
		/>

		<Ornament class="my-8" />

		<p class="font-display text-xl tracking-[0.06em] text-bronze sm:text-2xl">
			{wedding.dateLabel}
		</p>
		<p class="mt-3 font-body text-[11px] font-medium tracking-[0.28em] text-bronze uppercase">
			{wedding.city}
		</p>
		{#if now > 0}
			{#if started}
				<p class="mt-10 font-display text-lg text-ink sm:text-xl">
					We did it — thank you for celebrating with us.
				</p>
			{:else}
				<!--
					Both countdowns carry `role="timer"`. Exactly one is in the
					accessibility tree at any width — the other is `display: none` —
					so a test or a screen reader never has to pick a breakpoint.
				-->
				<p
					class="mt-8 hidden font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase lg:block"
					role="timer"
				>
					{#each units as unit, i (unit.label)}
						<span class="mx-2">{unit.value} {unit.label}</span>
						{#if i < units.length - 1}
							<span aria-hidden="true">·</span>
						{/if}
					{/each}
				</p>

				<div class="mt-10 flex items-center lg:hidden" role="timer">
					<span class="sr-only">{countdownSentence(units)} until we say I do.</span>

					{#each units as unit, i (unit.label)}
						<div class="flex w-[4.5rem] flex-col items-center" aria-hidden="true">
							<!--
								Lining figures, not the old-style ones the face defaults to.
								Those render 1 as a capital I, so a countdown of "119 days"
								reads as "II9 days" — a number nobody can trust at a glance.
							-->
							<span
								class="font-display text-3xl leading-none text-ink lining-nums tabular-nums sm:text-4xl"
							>
								{unit.value}
							</span>
							<span class="mt-2.5 font-body text-[9px] font-medium tracking-[0.28em] text-bronze uppercase">
								{unit.label}
							</span>
						</div>

						{#if i < units.length - 1}
							<span
								class="h-8 w-px shrink-0 bg-gradient-to-b from-transparent via-gold/35 to-transparent sm:h-10"
								aria-hidden="true"
							></span>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</section>
