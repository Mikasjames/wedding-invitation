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
	<!--
		NO og:image, deliberately. It used to be
		`<meta property="og:image" content="/images/og.jpg">`, pointing at a file
		that does not exist in this repo. Two separate problems with it:

		1 · The prerenderer crawls same-origin URLs found in the rendered HTML and
		    hard-fails the build on a 404 ("implement handleHttpError to suppress").
		    A broken social card is not worth blocking every deploy over, and
		    silencing it via handleHttpError would have hidden the real breakage.

		2 · WhatsApp and Facebook reject a *relative* og:image outright, so even
		    once the file exists it must be fully qualified — which means the
		    custom domain has to be live first.

		Until both are true, previews fall back to the og:title and og:description
		above: the couple's names and the date. Degraded, not broken.

		To restore the card: put a 1200x630 image at static/images/og.jpg and add
			<meta property="og:image" content="https://YOUR-DOMAIN/images/og.jpg" />
		Absolute URLs are not crawled by the prerenderer, so that will not fail
		the build. Restore `summary_large_image` on twitter:card at the same time.
	-->
	<meta name="twitter:card" content="summary" />
</svelte:head>

<CurtainReveal monogram={wedding.monogram} hint="Tap the seal to open">
	<Hero />
</CurtainReveal>
