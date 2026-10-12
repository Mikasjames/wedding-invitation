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
	class="pointer-events-none w-full h-auto select-none {className}"
/>

<!--
	The image fills its container, so callers cap it with `max-w-*`, not `w-*`:
	a `w-*` utility of their own cannot beat the `w-full` above, because both
	live in the same Tailwind layer and the later rule in the stylesheet wins —
	not the order the two classes appear in the attribute. `max-w-*` is a
	different property, so a cap always applies no matter which order the two
	rules are emitted in. A caller reaching for `w-*` here gets a plant that
	silently spans the whole container and lays itself across the text.

	Opacity is the other half of this. The revealed rule below is specific
	enough to outrank a plain `opacity-*` utility, so callers pass
	`--sprig-opacity` instead.
-->
<style>
	img[data-sprig] {
		opacity: 0;
		transform: scale(0.94);
		transition:
			opacity 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) var(--sprig-delay, 1150ms),
			transform 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) var(--sprig-delay, 1150ms);
	}

	img[data-sprig='bottom-left'] {
		transform-origin: 0% 100%;
	}

	img[data-sprig='top-right'] {
		transform-origin: 100% 0%;
		transition-delay: calc(var(--sprig-delay, 1150ms) + 140ms);
	}

	:global(.is-revealed) img[data-sprig] {
		opacity: var(--sprig-opacity, 1);
		transform: scale(1);
	}

	@media (prefers-reduced-motion: reduce) {
		img[data-sprig],
		:global(.is-revealed) img[data-sprig] {
			opacity: var(--sprig-opacity, 1);
			transform: none;
			transition: none;
		}
	}
</style>
