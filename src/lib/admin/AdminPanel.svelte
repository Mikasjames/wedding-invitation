<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children?: Snippet;
	}

	let { title, children }: Props = $props();
</script>

<section
	class="flex flex-col items-center rounded-2xl border border-gold/20 bg-champagne/20 px-6 py-14 text-center"
>
	<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
		{title}
	</p>
	<div class="mt-4 flex w-full max-w-lg flex-col items-center">
		{@render children?.()}
	</div>
</section>