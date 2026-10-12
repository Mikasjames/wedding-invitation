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
	class="pointer-events-none h-auto select-none {className}"
/>

<!--
	Callers must set a width. There is deliberately no default here: a `w-full`
	of its own used to sit in this attribute, and since both it and a caller's
	`w-*` are width utilities in the same Tailwind layer, whichever came later in
	the stylesheet won — not the order the two classes appear in the attribute.
	A caller asking for `w-[46%]` got the full container anyway and never knew
	why. Leaving the width to the caller makes the number they wrote the number
	they get.

	Opacity is the other half of this. The revealed rule below is specific
	enough to beat a plain `opacity-*` utility, so callers pass
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
