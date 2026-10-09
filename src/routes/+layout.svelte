<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';
	import { resetReveal } from '$lib/state/reveal.svelte';

	let { children } = $props();

	// Reveal state is a module-level singleton, so it would otherwise stay
	// `opened` across client-side navigations and skip the next route's animation.
	onNavigate(() => {
		resetReveal();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
