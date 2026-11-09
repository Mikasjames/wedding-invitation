<script lang="ts">
	import type { Snippet } from 'svelte';
	import CurtainReveal from './CurtainReveal.svelte';
	import EnvelopeReveal from './EnvelopeReveal.svelte';
	import { DEFAULT_CELEBRATION, type CelebrationKind } from '$lib/lib/celebration';

	interface Props {
		kind?: 'curtain' | 'envelope';
		children?: Snippet;
		monogram?: string;
		hint?: string;
		withMusic?: boolean;
		celebration?: CelebrationKind;
		/** @deprecated Use `celebration` instead. */
		withConfetti?: boolean;
	}

	let {
		kind = 'envelope',
		children,
		monogram,
		hint,
		withMusic,
		celebration = DEFAULT_CELEBRATION,
		withConfetti
	}: Props = $props();
</script>

{#if kind === 'curtain'}
	<CurtainReveal {monogram} {hint} {withMusic} {celebration} {withConfetti}>
		{@render children?.()}
	</CurtainReveal>
{:else}
	<EnvelopeReveal {monogram} {hint} {withMusic} {celebration} {withConfetti}>
		{@render children?.()}
	</EnvelopeReveal>
{/if}
