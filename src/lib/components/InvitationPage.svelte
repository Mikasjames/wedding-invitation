<script lang="ts">
	import Reveal from './Reveal.svelte';
	import Hero from '$lib/sections/Hero.svelte';
	import Story from '$lib/sections/Story.svelte';
	import Events from '$lib/sections/Events.svelte';
	import Attire from '$lib/sections/Attire.svelte';
	import Rsvp from '$lib/sections/Rsvp.svelte';
	import Registry from '$lib/sections/Registry.svelte';
	import { wedding } from '$lib/lib/wedding';

	interface Props {
		kind?: 'curtain' | 'envelope';
	}

	let { kind = 'envelope' }: Props = $props();
</script>

<svelte:head>
	<title>{wedding.names} · {wedding.dateLabel}</title>
	<meta name="description" content={wedding.description} />

	<meta property="og:type" content="website" />
	<meta property="og:title" content="{wedding.names} — {wedding.dateLabel}" />
	<meta property="og:description" content={wedding.description} />
	<meta property="og:image" content="/images/og.png" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content="/images/og.png" />
</svelte:head>

<Reveal {kind} monogram={wedding.monogram} hint="Tap the seal to open">
	<Hero />
	<Story />
	<Events />
	<Attire />
	<Rsvp />
	<Registry />
</Reveal>
