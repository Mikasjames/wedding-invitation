<script lang="ts">
	import type { Snippet } from 'svelte';
	import CurtainReveal from './CurtainReveal.svelte';
	import EnvelopeReveal from './EnvelopeReveal.svelte';

	interface Props {
		kind?: 'curtain' | 'envelope';
		children?: Snippet;
		monogram?: string;
		hint?: string;
		withMusic?: boolean;
		withConfetti?: boolean;
	}

	let {
		kind = 'envelope',
		children,
		monogram,
		hint,
		withMusic,
		withConfetti
	}: Props = $props();
</script>

{#if kind === 'curtain'}
	<CurtainReveal {monogram} {hint} {withMusic} {withConfetti}>
		{@render children?.()}
	</CurtainReveal>
{:else}
	<EnvelopeReveal {monogram} {hint} {withMusic} {withConfetti}>
		{@render children?.()}
	</EnvelopeReveal>
{/if}
