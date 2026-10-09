<script lang="ts">
	import '$lib/fonts.css';
	import Ornament from '$lib/components/Ornament.svelte';
	import { scriptFonts, systemFonts } from '$lib/lib/fonts';
	import { wedding } from '$lib/lib/wedding';

	const [first, second] = wedding.names.split(' & ');
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';
	const isCurrent = (usage?: string) => usage === 'hero names';
</script>

<svelte:head>
	<title>Typefaces · {wedding.names}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="mx-auto max-w-5xl px-6 py-20">
	<header class="text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Specimen sheet
		</p>
		<h1 class="font-display mt-5 text-4xl font-light text-ink sm:text-5xl">Typefaces</h1>
		<Ornament class="my-7" />
		<p class="mx-auto max-w-xl text-sm leading-relaxed text-ink/60">
			Every face the invitation ships with, plus the script candidates being weighed for the hero
			names. Pinned to what is actually bundled, so what you see here is what ships.
		</p>
	</header>

	<section class="mt-16">
		<h2 class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			In the system
		</h2>

		<div class="mt-6 grid gap-5 lg:grid-cols-3">
			{#each systemFonts as font (font.family)}
				<article
					class="rounded-sm border border-champagne-deep/40 bg-champagne/25 p-6"
					data-font={font.family}
				>
					<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<h3 class="font-body text-[13px] font-medium tracking-[0.14em] text-ink uppercase">
							{font.label}
						</h3>
						{#if font.usage}
							<span
								class="font-body text-[9px] tracking-[0.22em] text-gold-deep uppercase"
							>
								{font.usage}
							</span>
						{/if}
					</header>

					<p class="mt-4 text-sm leading-relaxed text-ink/60" style:font-family={font.family}>
						{alphabet}
					</p>
					<p class="mt-3 text-lg leading-snug text-ink" style:font-family={font.family}>
						{font.note}
					</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="mt-16">
		<h2 class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Script candidates
		</h2>
		<p class="mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
			Each one set with the hero, at the same size, so the only variable is the letterforms.
		</p>

		<div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each scriptFonts as font (font.family)}
				<article
					class="flex flex-col rounded-sm border border-champagne-deep/40 bg-champagne/25 p-6"
					data-font={font.family}
				>
					<header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<h3 class="font-body text-[13px] font-medium tracking-[0.16em] text-ink uppercase">
							{font.label}
						</h3>
						{#if isCurrent(font.usage)}
							<span
								class="font-body rounded-full bg-gold/15 px-2 py-0.5 text-[9px] tracking-[0.2em] text-gold-deep uppercase"
							>
								in use
							</span>
						{/if}
					</header>

					<div
						class="mt-5 flex flex-1 flex-col items-center justify-center py-6 text-center"
						style:font-family={font.family}
					>
						<p class="font-body text-[8px] font-medium tracking-[0.34em] text-gold-deep uppercase">
							Save the date
						</p>
						<p class="mt-3 text-[34px] leading-[1.08] tracking-[-0.005em] text-ink">
							{first}
							<span class="my-2 block text-[20px] text-gold">&amp;</span>
							{second}
						</p>
						<p class="font-display mt-4 text-base tracking-[0.06em] text-forest-800">
							{wedding.dateLabel}
						</p>
					</div>

					<p class="mt-4 text-xs leading-relaxed text-ink/55">{font.note}</p>
				</article>
			{/each}
		</div>
	</section>

	<footer class="mt-16 border-t border-champagne-deep/40 pt-8 text-center">
		<p class="font-body text-[10px] tracking-[0.28em] text-ink/40 uppercase">
			Internal tool · not linked from the invitation
		</p>
	</footer>
</section>
