<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			Our Story
		</p>
		<Ornament class="my-6" />
		<p class="font-display text-xl leading-relaxed text-ink/80 sm:text-2xl">
			{wedding.story}
		</p>
	</div>
</section>
