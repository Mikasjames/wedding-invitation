<script lang="ts">
	import CurtainReveal from '$lib/components/CurtainReveal.svelte';
	import Hero from '$lib/sections/Hero.svelte';
	import { wedding } from '$lib/lib/wedding';

</script>

<svelte:head>
	<title>{wedding.names} · {wedding.dateLabel}</title>
	<meta name="description" content={wedding.description} />

	<meta property="og:type" content="website" />
	<meta property="og:title" content="{wedding.names} — {wedding.dateLabel}" />
	<meta property="og:description" content={wedding.description} />

	<meta name="twitter:card" content="summary" />
</svelte:head>

<CurtainReveal monogram={wedding.monogram} hint="Tap the seal to open">
	<Hero />
</CurtainReveal>
