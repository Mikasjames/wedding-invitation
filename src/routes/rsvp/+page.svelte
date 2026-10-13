<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import RsvpFlow from '$lib/rsvp/RsvpFlow.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { wedding } from '$lib/lib/wedding';
</script>

<svelte:head>
	<title>RSVP · {wedding.names}</title>
	<meta name="description" content="Kindly respond to the wedding of {wedding.names}." />

	<link rel="icon" href={favicon} />
	<meta name="robots" content="noindex" />
</svelte:head>

<!--
	Deliberately not wrapped in `Reveal`. That wrapper exists to turn the
	invitation itself into an object on a table — a seal to break, a curtain to
	draw back. A guest following a link to answer a question does not want a
	ceremony before the form, and the lock on `body` scroll would fight anyone
	scrolling back up to read the copy.

	`noindex` because this is a working page with a code box in it, not something
	to land on from a search result. The invitation at `/` stays indexable.
-->

<main class="bg-ivory px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-display text-lg text-ink/70">{wedding.names}</p>
		<p class="mt-1 font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			{wedding.dateShort}
		</p>
		<Ornament class="my-8" />

		<RsvpFlow />

		<p class="mt-12 font-body text-[11px] text-ink/50">
			<a href="/" class="underline underline-offset-4">Back to the invitation</a>
		</p>
	</div>
</main>