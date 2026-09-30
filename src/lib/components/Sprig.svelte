<script lang="ts">
	interface Props {
		src: string;
		/** Intrinsic aspect ratio (w / h) of the source SVG. */
		ratio: number;
		alt?: string;
		class?: string;
		/**
		 * Corner the plant unfurls from when the curtain opens, or null for no
		 * entrance. Only a hook for the Hero's stylesheet — the motion lives there,
		 * because it has to be timed against the curtain's own budget.
		 */
		from?: 'bottom-left' | 'top-right' | null;
	}

	let { src, ratio, alt = '', class: className = '', from = null }: Props = $props();
</script>

<!--
	Botanical accent, loaded from /plants.

	Decorative by default: `alt=""` plus aria-hidden, because the invitation's
	content is the names and date, and a line drawing of a flower is not
	information a screen reader user is missing. Pass a real `alt` only if an
	illustration is ever the subject rather than the ornament.

	The ink is baked into each SVG (see artwork/build-plants.mjs) because an SVG
	loaded through <img> is a separate document and cannot inherit the page's
	colour. So this component cannot re-tint the art from CSS — only size, place
	and opacity. Changing the gold means re-running the pipeline.

	`width`/`height` are set from `ratio` so the box is reserved before the file
	loads. Without them an <img> with only a CSS width collapses to zero height
	until the SVG arrives, then jumps — and this art sits in the corners, where a
	jump is most visible.
-->
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
	/*
		Settle in once the curtain has actually uncovered this corner.

		`from` names the corner the plant sits in, which is also its
		transform-origin, so it grows out of the corner it is tucked into rather
		than sliding across the page. A slide would drag each plant through the
		centre column, straight through the names — the one thing here that must
		not move.

		THE DELAY IS THE WHOLE TRICK, and getting it wrong makes the animation
		invisible. The curtain's panels run from 120ms to 2200ms and the overlay
		is not dismissed until 2600ms, but the plants sit *behind* it that whole
		time. A panel only reveals a plant once its retreating seam-side edge
		has passed, which measured out at ~1080ms for both boxes. An entrance
		starting at 0ms therefore plays out entirely behind closed velvet.

		So this waits until 1150ms, by which point the centre-side of each plant
		is showing, and runs 900ms to finish at 2050ms — clear of the 2600ms
		dismissal, with nothing still moving when the overlay goes.

		`opacity` and `transform` only, no `clip-path`. A directional clip was
		tried first and it fights the curtain: the cloth retreats from the seam
		outward, uncovering each plant's centre-side edge first, so a clip
		sweeping from the corner inward spends its first half revealing the half
		that is still behind cloth. A uniform fade has no directional preference,
		so it composes with the retreat instead of fighting it — and it is the
		cheaper property, on the same constraint the curtain's own sheen and
		seal pulse are built around.

		No `will-change`. These are the largest elements on the page, so
		promoting them for the life of the document would cost GPU memory
		permanently to save a promotion the browser performs anyway once a
		transform or opacity transition is running.
	*/
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
		transition-delay: 1290ms; /* the descending sprig trails the rising one */
	}

	/* Opened: let it settle. The transitions above do the rest. */
	:global(.is-revealed) img[data-sprig] {
		opacity: 1;
		transform: scale(1);
	}

	/*
		Reduced motion: the plant is simply there. No fade, no delay.

		`prefers-reduced-motion` is not a request for a smaller animation, it is
		a request for none — and the curtain already collapses to a 240ms fade
		with no stagger when it is set, so the plants matching that is the
		consistent reading.

		`transition: none` alone is not enough here, and the reason is specific
		to this component: the resting state is `opacity: 0`, so killing the
		transition without restoring the end state would leave a reduced-motion
		guest with two permanently invisible plants. The 1150ms delay has to
		go too — a delay that long is not a subtle offset, it is the animation
		never appearing.
	*/
	@media (prefers-reduced-motion: reduce) {
		img[data-sprig],
		:global(.is-revealed) img[data-sprig] {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
