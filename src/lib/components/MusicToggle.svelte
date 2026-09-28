<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { ambience } from '$lib/audio/ambience.svelte';
</script>

<button
	type="button"
	onclick={() => ambience.toggle()}
	aria-pressed={ambience.playing}
	aria-label={ambience.playing ? 'Mute background music' : 'Play background music'}
	class="fixed right-4 z-40 grid h-11 w-11 place-items-center rounded-full border
	       border-gold/30 bg-ivory/80 text-forest-900 shadow-luxe backdrop-blur-md
	       transition-[transform,background-color] duration-500 ease-luxury
	       hover:scale-105 active:scale-95
	       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
	style="top: max(0.875rem, env(safe-area-inset-top))"
	in:fly={{ y: -14, duration: 700, easing: quintOut, delay: 900 }}
>
	{#if ambience.playing}
		<svg
			viewBox="0 0 24 24"
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" stroke-linejoin="round" />
			<path d="M15.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round" />
			<path d="M18.5 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round" opacity=".55" />
		</svg>
	{:else}
		<svg
			viewBox="0 0 24 24"
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" stroke-linejoin="round" />
			<path d="m16 9.5 5 5m0-5-5 5" stroke-linecap="round" />
		</svg>
	{/if}
</button>
