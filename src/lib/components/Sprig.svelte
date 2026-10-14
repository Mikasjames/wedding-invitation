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
	The image fills its container. That is the intended default, not an oversight:
	the hero uses these as full-bleed botanical watermarks behind the typography,
	offset from a corner by the caller and allowed to bleed past the section's box,
	which `overflow-hidden` clips.

	A caller wanting a smaller plant has to know which kind of `w-*` they are
	writing, because the two behave differently and only one of them wins:

	  - A *base* `w-*` — `w-[60%]` — is in the same Tailwind layer as the
	    `w-full` above, so `w-full` wins regardless of the order the classes
	    appear in the attribute. The plant stays full-bleed and nothing says so.

	  - A *variant* `w-*` — `sm:w-[52%]`, `lg:w-[46%]` — lives in the media
	    block Tailwind emits for that breakpoint, which comes after the base
	    layer. It wins. So a caller who sets only variants gets a plant that is
	    full-bleed below the first breakpoint and sized above it, with a visible
	    step at the boundary.

	`max-w-*` avoids both, being a different property rather than a competing
	declaration, so a cap applies at every width it is set.

	Opacity is the other half of this. The revealed rule below is specific enough
	to outrank a plain `opacity-*` utility, so callers pass `--sprig-opacity`
	instead.
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
