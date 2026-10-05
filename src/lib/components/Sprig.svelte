<script lang="ts">
	interface Props {
		src: string;
		ratio: number;
		alt?: string;
		class?: string;
		from?: 'bottom-left' | 'top-right' | null;
	}

	let { src, ratio, alt = '', class: className = '', from = null }: Props = $props();
</script>

<img
	{src}
	{alt}
	aria-hidden={alt ? undefined : 'true'}
	width={1000}
	height={Math.round(1000 / ratio)}
	loading="lazy"
	decoding="async"
	data-sprig={from ?? undefined}
	class="pointer-events-none h-auto w-full select-none {className}"
/>

<style>

	img[data-sprig] {
		opacity: 0;
		transform: scale(0.94);
		transition:
			opacity 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) 1150ms,
			transform 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) 1150ms;
	}

	img[data-sprig='bottom-left'] {
		transform-origin: 0% 100%;
	}

	img[data-sprig='top-right'] {
		transform-origin: 100% 0%;
		transition-delay: 1290ms;
	}

	:global(.is-revealed) img[data-sprig] {
		opacity: 1;
		transform: scale(1);
	}

	@media (prefers-reduced-motion: reduce) {
		img[data-sprig],
		:global(.is-revealed) img[data-sprig] {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
