<script lang="ts">
	import CurtainReveal from '$lib/components/CurtainReveal.svelte';
	import Hero from '$lib/sections/Hero.svelte';
	import { wedding } from '$lib/lib/wedding';

	// Story / Events / Attire / Rsvp / Registry arrive in Step 2.
</script>

<svelte:head>
	<title>{wedding.names} · {wedding.dateLabel}</title>
	<meta name="description" content={wedding.description} />

	<!-- WhatsApp / iMessage / Facebook link preview -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content="{wedding.names} — {wedding.dateLabel}" />
	<meta property="og:description" content={wedding.description} />
	<meta property="og:image" content="/images/og.jpg" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<CurtainReveal
	monogram={wedding.monogram}
	eyebrow="Together with their families"
	names={wedding.names}
	hint="Tap the seal to open"
>
	<Hero />
</CurtainReveal>
