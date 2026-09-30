<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { reveal, openInvite } from '$lib/state/reveal.svelte';
	import { ambience } from '$lib/audio/ambience.svelte';
	import { sealBurst } from '$lib/lib/confetti';
	import MusicToggle from './MusicToggle.svelte';

	interface Props {
		children?: Snippet;
		/** Text stamped into the wax seal, e.g. "M & L" */
		monogram?: string;
		hint?: string;
		withMusic?: boolean;
		withConfetti?: boolean;
	}

	let {
		children,
		monogram = 'M & L',
		hint = 'Tap the seal to open',
		withMusic = true,
		withConfetti = true
	}: Props = $props();

	/* ── Motion budget ───────────────────────────────────────────
	   seal breaks 0–700ms · left panel 120ms · right panel 200ms
	   + 2000ms opening ≈ 2.2s unveiled.

	   The pen this is adapted from runs its curtain for 4s. 2s is half that,
	   which keeps the drama without making a guest wait out a loading screen. */

	let reduced = $state(false);
	let breaking = $state(false);
	/** True once the curtain has fully cleared and the overlay is inert. */
	let dismissed = $state(reveal.opened);
	let sealEl = $state<HTMLButtonElement | null>(null);
	let curtainEl = $state<HTMLDivElement | null>(null);
	let guard = false;

	/**
	 * The two panel sides. A stable binding, not an inline array literal in the
	 * template: as a literal it is a fresh array on every evaluation, and Svelte 5
	 * tears the keyed each block down and rebuilds it rather than letting its
	 * contents animate out.
	 */
	const SIDES = ['left', 'right'] as const;

	/**
	 * Peak tilt away from the seam, in degrees. The pen's figure.
	 *
	 * This is the single source of truth for the tilt: `gatherFrame` reads it, and
	 * `panelCover` reads it to work out how much fabric has to hang above the frame
	 * so the tilt cannot pull the panel's top edge into view. It lives here rather
	 * than as a literal inside `gatherFrame` precisely because the second consumer
	 * needs it — change one and the other follows.
	 */
	const MAX_TILT = 20;

	/** Vertical bleed on each panel, in px. Set by `panelCover`; see there. */
	let cover = $state(0);

	/**
	 * How far the panel must extend past the top and bottom of the frame for the
	 * tilt to stay out of sight.
	 *
	 * The panel is rotated about the seam edge at the vertical midpoint, so its top
	 * edge is a diagonal whose outer end swings DOWN into the viewport by roughly
	 * `w * sin(tilt)`. On a phone the panel is 195px wide and the dip is ~35px, lost
	 * off the side of the frame. On a 1440px desktop it is 720px wide, the dip is
	 * ~230px, and a wedge of page appears at each top corner and sweeps downward as
	 * the tilt ramps up — the "curtain top flying down".
	 *
	 * Requiring the top edge to cross y=0 exactly at the left edge of the frame,
	 * with the panel's half-height H measured from the viewport centre:
	 *
	 *     h/2 - H·cos(t) + w·tan(t) · (w - H·sin(t)) / (w·cos(t))  =  0
	 *  =>  H = cos(t) · (h/2 + w·tan(t))
	 *
	 * and the bleed per side is `H - h/2`. Symmetric top and bottom keeps the
	 * panel's `transform-origin: 50%` on the viewport centre, so the existing seam
	 * origin and the `scaleY` bulge are untouched.
	 *
	 * At MAX_TILT that is 110% of the viewport on a phone and ~155% on 1920x1080.
	 * The surplus is clipped by the overlay's `overflow-hidden`, and the fold
	 * texture is vertical stripes, so the extra fabric is invisible.
	 *
	 * Computed in JS rather than written as a `calc()` of `vw`/`vh` so that MAX_TILT
	 * stays the only place the angle is written down, and so the measurement tracks
	 * the real panel rather than an assumed one.
	 */
	function panelCover(): number {
		if (!browser) return 0;
		const panel = curtainEl?.querySelector<HTMLElement>('[data-panel]');
		const w = panel?.getBoundingClientRect().width ?? 0;
		if (!w) return 0;
		const t = (MAX_TILT * Math.PI) / 180;
		const h = window.innerHeight;
		return Math.ceil(Math.cos(t) * (h / 2 + w * Math.tan(t)) - h / 2);
	}

	const timings: {
		release: number;
		stagger: number;
		duration: number;
	} = $derived(
		reduced
			? { release: 0, stagger: 0, duration: 240 }
			: { release: 120, stagger: 80, duration: 2000 }
	);

	/**
	 * The opening, per panel, at a point in its own timeline.
	 *
	 * This is the pen's motion, unchanged in shape:
	 *
	 *     translate(±100%) rotate(±20deg) scale(0, 2)
	 *
	 * The panel is drawn out sideways, tips away from the seam, and narrows to
	 * nothing on the way. That last term is the whole effect — collapsing to
	 * zero width is what makes it read as cloth being pulled aside rather than a
	 * rectangle sliding off-screen.
	 *
	 * Two deliberate departures from the pen, both because its demo is a fixed
	 * 1200x600 box and ours is a full-viewport mobile overlay:
	 *
	 *  · `scaleY` is capped at 1.15. A literal 2 doubled the panel's height, so its
	 *    bottom edge appeared as a hard horizontal line part-way down the screen and
	 *    the cloth looked like it was floating. The bulge still catches the eye and
	 *    the panel stays full-bleed.
	 *
	 *  · The travel overshoots to 118%. The painted edge is
	 *    `origin + width x scaleX + translate`, and as the panel narrows toward its
	 *    seam origin the edge retreats back toward the middle of the screen. Without
	 *    the overshoot that retreat brings the edge back inside the viewport after it
	 *    has already left — measured at ~50 frames of inward drift.
	 *
	 *   u — linear progress through the panel's opening
	 */
	function gatherFrame(u: number, sign: number): string {
		// ease-in-out, as the pen. Symmetric: slow start, fast middle, slow stop.
		const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

		const x = e * 118 * sign;
		const narrow = 1 - e;
		const stretch = 1 + Math.sin(u * Math.PI) * 0.15;
		const rotate = e * MAX_TILT * sign;

		return `translate3d(${x}%, 0, 0) scaleX(${narrow}) scaleY(${stretch}) rotate(${rotate}deg)`;
	}

	/**
	 * Runs the fabric reveal on a rAF loop.
	 *
	 * Why not a Svelte `out:` transition: Svelte freezes a block the instant it
	 * starts outroing, and transitions declared on elements inside nested
	 * `{#each}` blocks in that frozen block are never scheduled. Measured — a
	 * sibling `out:fade` on a direct child ran, the nested `out:fabric` produced
	 * zero animations across the whole reveal.
	 *
	 * Why not `Element.animate()`: it rides the document timeline, which does
	 * not advance reliably in every environment (it crawled at 1/20 speed under
	 * headless). A rAF loop is what Svelte uses for its own transitions, is
	 * throttled correctly when the tab is hidden, and lets each fold's start
	 * time be staggered exactly.
	 *
	 * Returns the total time until the last fold has landed.
	 */
	function animateCurtain(): { wraps: HTMLElement[]; total: number } | null {
		if (!browser) return null;

		// A returning guest is already past the curtain, so nothing may animate.
		if (reveal.opened || dismissed) return null;

		const wraps = [...(curtainEl?.querySelectorAll<HTMLElement>('[data-panel]') ?? [])];
		if (!wraps.length) return null;

		/*
			Reduced motion: no fabric, no wave, no stagger. The panels are simply
			faded and cleared in a single short pass, because the whole point of
			`prefers-reduced-motion` is to not move things.

			This has to short-circuit before any of the choreography below. Without
			it the rAF loop ran the full 2400ms gather and the dismissal was deferred
			by the same amount, so reduced-motion guests got the longest wait of all.
		*/
		if (reduced) {
			for (const wrap of wraps) {
				wrap.style.transition = 'none';
				wrap.style.opacity = '0';
			}
			return { wraps, total: timings.duration };
		}

		// One track per side. There is no fold split and no wave: both existed to
		// make a three-fold panel read as cloth, and with a single element per side
		// there is nothing left to stagger.
		const tracks = wraps.map((el) => ({
			el,
			sign: el.dataset.panel === 'left' ? -1 : 1,
			delay: timings.release + (el.dataset.panel === 'right' ? timings.stagger : 0)
		}));

		const total = Math.max(...tracks.map((tr) => tr.delay + timings.duration));
		const start = performance.now();

		function step(now: number) {
			const elapsed = now - start;
			let done = true;

			for (const tr of tracks) {
				const u = (elapsed - tr.delay) / timings.duration;
				if (u >= 1) {
					tr.el.style.transform = gatherFrame(1, tr.sign);
					continue;
				}
				done = false;
				if (u >= 0) tr.el.style.transform = gatherFrame(u, tr.sign);
			}

			if (!done) frame = requestAnimationFrame(step);
		}

		frame = requestAnimationFrame(step);
		return { wraps, total };
	}

	onMount(() => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// The cover depends on the measured panel width, so it has to be read after
		// layout. A ResizeObserver rather than a resize listener: it also catches the
		// mobile URL-bar collapsing, which fires no window resize at all and changes
		// both the width and the height the cover is derived from.
		const ro = new ResizeObserver(() => (cover = panelCover()));
		if (curtainEl) ro.observe(curtainEl);
		cover = panelCover();

		// Land keyboard and screen-reader users on the seal.
		sealEl?.focus({ preventScroll: true });

		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
			clearTimeout(dismissTimer);
		};
	});

	/** rAF handle for the fabric loop, so a re-open cannot leave a loop running. */
	let frame = 0;
	/** Timer that dismisses the overlay once the last fold has landed. */
	let dismissTimer: ReturnType<typeof setTimeout> | undefined;

	function handleOpen() {
		// Double-tap guard: the reveal needs a single clean trigger.
		if (guard) return;
		guard = true;

		// 1 · Audio first — the user-activation window is open right now.
		if (withMusic) void ambience.play();

		// 2 · Particle burst from the seam.
		if (withConfetti) sealBurst(!reduced);

		// 3 · Start the fabric. This must happen while the curtain is still in
		//     the DOM and unfrozen, so it goes before the state flip.
		const run = animateCurtain();

		// 4 · Arm the dismissal for when the last fold has landed. The overlay
		//     stays mounted throughout (see the template note) so nothing can
		//     interrupt the animation. The extra margin covers the case where the
		//     tab is backgrounded and rAF is throttled to a stop mid-reveal.
		clearTimeout(dismissTimer);
		if (run) {
			dismissTimer = setTimeout(() => {
				cancelAnimationFrame(frame);
				// Make sure nothing is left stranded mid-open if the loop was
				// throttled, then dismiss. Cheap and idempotent.
				for (const wrap of run.wraps) {
					wrap.style.transform = gatherFrame(1, wrap.dataset.panel === 'left' ? -1 : 1);
				}
				dismissed = true;
			}, run.total + 400);
		} else {
			// Reduced motion, or a returning guest: nothing to wait for.
			dismissed = true;
		}

		// 5 · Flip state: the seal dissolves, the page content fades up, and the
		//     music toggle mounts. The folds are animating imperatively and are
		//     not owned by any Svelte transition.
		breaking = true;
		openInvite();
	}

	// Lock scrolling while the curtain is up. Keyed on `dismissed`, not
	// `reveal.opened`, so the page stays put for the whole 2.4s reveal instead
	// of unlocking while the curtain is still visibly parting.
	$effect(() => {
		if (!browser) return;
		const locked = !dismissed;
		document.body.style.overflow = locked ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<!--
	`breaking` is only read inside the curtain, to drive the seal's dissolve and
	the fold classes. It deliberately does NOT gate the block below: Svelte freezes
	a block the moment it starts outroing, so an `{#if}` here would stop reacting
	to it and cancel the reveal mid-flight. See `animateCurtain`.
-->
<div class="contents">
	<!-- ── The invitation itself ───────────────────────────────────────
	     Always in the DOM: link-preview crawlers and no-JS guests still get the
	     text, and `inert` keeps tab focus out of the curtain.            -->
	<div
		data-reveal
		inert={!reveal.opened}
		class="transition-[opacity,transform] duration-[1600ms] ease-luxury delay-500
		       motion-reduce:transition-none
		       {reveal.opened
			? 'opacity-100'
			: 'pointer-events-none scale-[0.985] opacity-0'}"
	>
		{@render children?.()}
	</div>

	<!--
		Curtain overlay.

		Deliberately NOT wrapped in `{#if !reveal.opened}`. Svelte would tear the
		block down the moment the state flips, yanking the folds out mid-flight
		and cancelling their animations — the frozen-block problem that also stops
		`out:` transitions from being scheduled inside it. So the overlay stays
		mounted, is animated imperatively, and is hidden by hand once the last
		fold has landed (`dismissCurtain`).

		While it is up it is a modal dialog; once dismissed it is inert and
		non-interactive, so it never traps focus or swallows taps.
	-->
	<div
		bind:this={curtainEl}
		data-curtain
		aria-hidden={dismissed}
		inert={dismissed}
		class="fixed inset-0 z-50 overflow-hidden
		       {dismissed ? 'pointer-events-none invisible' : ''}"
		style="padding-top: env(safe-area-inset-top)"
		role="dialog"
		aria-modal="true"
		aria-label="Wedding invitation — press the seal to open"
	>
		<!--
			NO opaque backdrop. The panels are the backdrop.

			This was the reason the gather looked broken: with a solid fill behind
			them, a panel that narrows in place revealed flat rose instead of the
			invitation, so the curtain appeared to shrink without ever parting. The
			panels are 50% wide each with a 6% bleed, so they always overlap by 6% of
			the viewport and fully cover it while closed — the seam needs no help.

			That fill WAS here once, as `absolute inset-0 bg-forest-800`, and it
			reproduced the original bug exactly: a full-viewport opaque div behind
			the panels is indistinguishable from one in front of the invitation, so
			the gather revealed more curtain. It is gone, and the closed rose field
			is now the panels' own base colour (see `.panel` in the style below).
		-->

		<!-- Perspective host for the door hinge. -->
		<div
			class="absolute inset-0"
			style="perspective: 1400px; transform-style: preserve-3d;
			       --release: {timings.release}ms"
		>
			<!--
				One element per side. No fold split.

				Splitting each panel into three `flex-1` folds to stagger a wave was the
				source of most of what went wrong: the gather had to live on the parent
				because narrowing each fold separately produced six slivers that read
				as a barcode, and the percentage background sizes had to be expressed
				relative to each fold or the folds re-anchored and hard seams appeared
				at the thirds. All of that is gone with one element.

				Each panel is exactly w-1/2 at left-0/right-0, so the join is 50% by
				construction, with a 6% bleed across the seam to hide it.
			-->
			{#each SIDES as side (side)}
				<div
					data-panel={side}
					class="panel-wrap absolute inset-y-0 w-1/2 will-change-transform
					       {side === 'left' ? 'left-0' : 'right-0'}"
					style="height: 100%"
					class:panel-wrap--left={side === 'left'}
					class:panel-wrap--right={side === 'right'}
					class:is-closed={!breaking}
				>
					<div
						data-fabric={side}
						class="panel absolute
						       {side === 'left'
								? 'panel--left left-0 right-[-6%]'
								: 'panel--right right-0 left-[-6%]'}"
						style="top: -{cover}px; bottom: -{cover}px"
					></div>
				</div>
			{/each}
		</div>

		<!--
			Edge vignette, once, over both panels.

			Dusty rose measures 2.09:1 against the ivory page — a mid-tone on a pale
			background, so without help the curtain reads as a wash rather than a heavy
			thing covering the screen. This is load-bearing, not decoration.

			IT MUST SIT ABOVE THE PANEL HOST. It is a bare `inset` box-shadow, so it
			paints as a sibling rather than as part of the curtain, and with nothing
			opaque over it the panels themselves would bury it. It used to be the
			overlay's first child, where the backdrop hid it completely — dead code
			wearing a comment that called it load-bearing.

			FADING ON `breaking`, NOT `dismissed`. The cloth is gone by ~1900ms but
			`dismissed` only flips at 2600ms, so a vignette held at full strength sat
			over a fully revealed page for ~700ms — the dark edge that lingered after
			the curtain had opened. Timing it to the gather clears it as the panels
			leave instead.
		-->
		<div
			class="pointer-events-none absolute inset-0 transition-opacity duration-[2000ms]
			       ease-luxury {breaking ? 'opacity-0' : 'opacity-100'}"
			style="box-shadow: inset 0 0 170px rgb(74 31 44 / 0.55)"
			aria-hidden="true"
		></div>

		<!--
			Seam, seal and vignette ride above the panels and fade out on the same
			choreography, so nothing is left hanging over the revealed page.
		-->
		<div
			class="absolute inset-0 transition-opacity duration-[1000ms] ease-luxury
			       {dismissed ? 'opacity-0' : 'opacity-100'}"
			style="transition-delay: 300ms"
		>
			<!--
				No seam line drawn down the middle. It existed to hide the join when
				each panel was three separate folds; with one element per side and a
				6% bleed the panels' own edges cover it. At gold/25 over pink it just
				rendered as a dark stripe through the middle of the composition.
			-->

		<!-- ── Wax seal ── -->
		<div class="absolute inset-0 grid place-items-center px-8">
			<!--
				No names, no eyebrow.

				A curtain exists to conceal. Printing the couple's names across it
				meant the guest had already read the announcement before the panels
				parted, which spent the reveal's payoff before it arrived. Only the
				monogram teases the event; the names are the reward for opening.
			-->
			<div class="flex flex-col items-center text-center">
				<button
					bind:this={sealEl}
					type="button"
					onclick={handleOpen}
					disabled={breaking}
					aria-label="Open the invitation"
					class="seal group relative grid h-32 w-32 place-items-center disabled:cursor-default"
				>
					<!-- pulsing halo -->
					<span
						class="pointer-events-none absolute inset-0 -z-10 rounded-full border border-rose-gold/60
						       blur-[3px] animate-seal-pulse"
						aria-hidden="true"
					></span>

					<!-- rose-gold bezel -->
					<span
						class="absolute inset-[7px] rounded-full border border-rose-gold/80 blur-[0.3px]
						       shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
						aria-hidden="true"
					></span>

					<!-- monogram, debossed into the wax -->
					<span
						class="relative z-10 font-display text-[1.65rem] font-medium tracking-[0.06em]
						       text-champagne"
						style="text-shadow: 0 1px 0 rgb(0 0 0 / 0.35), 0 -1px 1px rgb(255 255 255 / 0.18)"
					>
						{monogram}
					</span>

					<!-- wax mottling -->
					<span class="seal-blemish" aria-hidden="true"></span>
				</button>

				<!--
					The hint leaves with the seal, not at dismissal.

					Its wrapper only fades on `dismissed`, which is the end of the
					reveal — so for the whole 2.6s the prompt stayed lit over the
					opening curtain, and once the gather actually revealed the page it
					was plainly visible on top of the couple's names. `breaking` is the
					seal's own trigger, so the prompt leaves on the same beat the wax
					dissolves on.
				-->
				<p
					class="mt-8 font-body text-[10px] font-medium tracking-[0.3em] text-plum
					       uppercase animate-breathe transition-opacity duration-500 ease-luxury
					       {breaking ? 'opacity-0' : 'opacity-100'}"
				>
					{hint}
				</p>
			</div>
		</div>

		<!--
			Corner vignette keeps the eye centred on the seal.

			Fading on `breaking` for the same reason as the edge vignette, and it
			needed an actual transition to do it: this one was never gated at all, so
			it sat at full strength until the whole overlay went invisible at 2600ms —
			the corners of the revealed page stayed darkened for the whole tail of the
			reveal. It is nested inside the seal layer, so it inherits that layer's
			own fade as well; this is the layer's contribution, on its own clock.
		-->
		<div
			class="pointer-events-none absolute inset-0 transition-opacity duration-[2000ms]
			       ease-luxury {breaking ? 'opacity-0' : 'opacity-100'}"
			style="background: radial-gradient(120% 80% at 50% 45%, transparent 40%, rgb(0 0 0 / 0.45))"
			aria-hidden="true"
		></div>
		</div>
	</div>
</div>

<!-- ── Music toggle: only once the curtains are gone ───────────────── -->
{#if reveal.opened && withMusic}
	<MusicToggle />
{/if}

<style>
	/* ── Curtain fabric ─────────────────────────────────────────────────
		ONE gradient, hard stops, greyscale.

		Everything before this was four soft-ramped layers fighting to look like
		cloth, and it read as blurry panelling. The crispness is the look: a fold
		has a definite edge where the light turns, and smoothing that out is what
		made it look like a gradient rather than a curtain. Hard stops it is.

		Greyscale on purpose, so the fold shading and the colour are independent —
		one dark/light wash over a flat base, instead of hand-picking a tinted
		shadow for every colour change.

		The period is a fixed 190px, roughly one fold every 30px on a phone. It is
		not sized in %, because there is no longer a fold split to re-anchor
		inside, and px is what makes the fold width consistent across panels and
		viewports instead of stretching with the element.

		TWO LAYERS: THE PANEL IS ALWAYS OPAQUE, THE TEXTURE IS WHAT FADES.

		`.panel` carries the flat rose base at `opacity: 1` for the whole reveal,
		and the fold gradient lives on `::before` at `opacity: 0` until the seal
		breaks. So the closed state is still one flat rose field and the cloth
		still arrives with the movement — but the panel itself never stops covering
		the invitation.

		That split is the whole fix. The panel used to fade from `opacity: 0` with
		a full-viewport `bg-forest-800` div painted behind it to supply the closed
		colour, and that div is indistinguishable from one in front of the page:
		as the panels gathered they uncovered more flat rose rather than the
		invitation, so the curtain shrank without ever parting and the page only
		appeared when the whole overlay went `invisible` at the end. Fading the
		texture instead of the panel means the gather uncovers the invitation, and
		the closed state is unchanged.

		The delay is `var(--release)`, set on the perspective host from
		`timings.release`, so the texture lands exactly as the gather starts. That
		keeps JS the single source of truth for the choreography rather than
		duplicating 120ms here.

		THE PANEL IS TALLER THAN THE FRAME, ON PURPOSE. `top`/`bottom` come from
		`cover` in the template, computed by `panelCover` from the measured panel
		width and MAX_TILT. They are what stops the tilt dragging the top edge into
		view on a wide screen; see `panelCover` for the derivation. The surplus is
		clipped by the overlay's `overflow-hidden` and costs nothing visually, since
		`::before`'s folds are vertical stripes — which is also why `inset: 0` on it
		is correct and reaches over the bleed.                                       */
	.panel {
		overflow: hidden;
		/*
			The base colour is load-bearing twice over.

			Once, for the closed state: it *is* the closed rose field, now that the
			backdrop that used to supply it is gone. Remove it and the curtain goes
			ivory at rest, because `[data-reveal]` is `opacity-0` and the body is
			#fdfbf7.

			And once for the seam: `.panel` bleeds 6% across the middle, so the two
			panels overlap in a band — against a transparent base both alpha
			gradients composite there, doubling the darkening. Measured at R=133 in
			the band against R=149 for the neighbouring fold minimum: a dark stripe
			straight down the curtain. Opaque, so the right panel simply covers the
			left's bleed.
		*/
		background-color: var(--color-forest-800);
		backface-visibility: hidden;
	}

	/*
		The fold texture, withheld until the seal breaks.
	*/
	.panel::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity 500ms var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1))
			var(--release, 120ms);
		background-image: repeating-linear-gradient(
			90deg,
			rgb(0 0 0 / 0.3) 0%,
			rgb(0 0 0 / 0.3) 7%,
			rgb(255 255 255 / 0.22) 7%,
			rgb(255 255 255 / 0.22) 13%,
			rgb(0 0 0 / 0.12) 18%,
			rgb(0 0 0 / 0.12) 30%,
			rgb(255 255 255 / 0.3) 33%,
			rgb(255 255 255 / 0.3) 40%,
			rgb(0 0 0 / 0.2) 44%,
			rgb(0 0 0 / 0.2) 56%,
			rgb(255 255 255 / 0.24) 59%,
			rgb(255 255 255 / 0.24) 67%,
			rgb(0 0 0 / 0.1) 72%,
			rgb(0 0 0 / 0.1) 85%,
			rgb(0 0 0 / 0.28) 92%,
			rgb(0 0 0 / 0.28) 100%
		);
		background-size: 190px 100%;
		background-repeat: repeat-x;
	}

	/*
		Both halves share ONE continuous gradient, phased so the folds run
		straight through the seam instead of restarting on each side.

		The right panel is inset 6% of the wrap past the centre line, so it begins
		at 47% of the overlay, and continuity needs its tile shifted by that same
		47% — the value the left panel samples at the seam.

		`0.47 * 100vw`, not a px constant. The offset was hardcoded to 53px, which
		is the correct phase at exactly one viewport width and wrong at every
		other: it needs `47% of the overlay`, and that scales. Measured at 390px
		the seam stepped from rgb(148,116,116) to rgb(225,192,192) across two
		adjacent pixels — the same hard step this was supposed to remove, which the
		old comment recorded as (152,119,119) against (222,187,186).

		`100vw` rather than a percentage of the panel: background-position
		percentages resolve against (positioning area − image) = 207px − 190px, so
		no useful percentage of the panel's own width expresses a 183px shift.
		The overlay is `position: fixed; inset-0` and the body is scroll-locked
		while the curtain is up, so `100vw` is exactly the overlay's width here.
	*/
	.panel--right::before {
		background-position: calc(0.47 * 100vw) center;
	}

	/*
		The fabric arrives with the movement. `.is-closed` is dropped from
		`.panel-wrap` at the same tick the gather starts, so this is the same
		trigger as the transform — one state flip brings the cloth and the
		motion in together rather than as two separate events.
	*/
	.panel-wrap:not(.is-closed) .panel::before {
		opacity: 1;
	}

	/*
		NO vignette here. It is drawn once on the overlay instead.

		An `inset` box-shadow per panel put a visible seam straight down the middle,
		where the two vignettes met: each one's inner edge darkened the strip only
		its own half covered, so the join read as a hard line through the seal. One
		vignette over both panels has no boundary to show.
	*/

	/*
		A slow travelling sheen, so the drape feels alive while it hangs. Gold at low
		alpha only — it was measured invisible at full strength on a rose field.

		THE BAND IS MOVED BY `transform`, NOT `background-position`.

		`background-position` is not a compositable property, so animating it forces
		a full repaint of this element every frame. This element is `inset: 0` of a
		panel — half the viewport — carrying a gradient on a 260%-wide tile, so that
		was ~170 gradient rasterisations per panel across the reveal, on the main
		thread, competing with the gather for the same frames. `transform` is
		composited, so the same motion costs nothing.

		The two percentage systems are not interchangeable, which is where the odd
		looking numbers below come from. The old keyframes were
		`background-position: 130% 0` → `-30% 0`. A background-position percentage
		resolves against (positioning area − image) = W − 2.6W = −1.6W, so those were
		offsets of −1.6W × 1.3 = −2.08W and −1.6W × −0.3 = +0.48W. `translateX` takes
		percentages of the element's own border box, so the same travel is −208% and
		+48%. Identical motion, different units.

		The band sits at 38–62% of the 2.6×W tile, i.e. 0.988W–1.612W from the tile's
		left edge: off-panel at both endpoints, crossing the visible width mid-cycle.
		`.panel` is `overflow: hidden`, so the translated pseudo-element is clipped.
	*/
	.panel::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			105deg,
			transparent 38%,
			rgb(255 244 240 / 0.12) 50%,
			transparent 62%
		);
		background-size: 260% 100%;
		/* Hold it on the compositor for the whole reveal, not just from the point
		   the animation is first noticed. */
		will-change: transform;
		animation: sheen 9s var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1)) infinite;
		/*
			Gated and paused together while the cloth is withheld. `.panel` is opaque
			for the whole reveal — it is `::before` that fades in on the break — so
			pausing alone is not enough: the sheen would sit parked at
			`translateX(-208%)`, painting a soft band across the closed field, and it
			would still be mid-screen over the revealed invitation.

			Both flip on the same trigger as the texture, so the drape *starts* its
			travel as the curtain parts rather than appearing mid-swing from page
			load.
		*/
		opacity: 0;
		animation-play-state: paused;
	}

	.panel-wrap:not(.is-closed) .panel::after {
		opacity: 1;
		animation-play-state: running;
	}

	@keyframes sheen {
		from {
			transform: translateX(-208%);
		}
		to {
			transform: translateX(48%);
		}
	}

	/* ── The resting pose ──────────────────────────────────────────────────
		The closed state only — the pose the curtain holds before the seal is
		broken. All motion is written as inline transforms by `animateCurtain`,
		which outrank this, so there is no "open" counterpart to declare.     */
	.panel-wrap {
		transform-style: preserve-3d;
	}

	/*
		`transform-origin` is the SEAM edge, and the vertical midpoint so the scaleY
		bulge grows symmetrically.

		The seam edge is what makes the gather converge on the centre line, so the
		cloth is drawn inward toward the middle rather than shrinking in place.
	*/
	.panel-wrap--left {
		transform-origin: 100% 50%;
	}
	.panel-wrap--right {
		transform-origin: 0% 50%;
	}

	/*
		The resting pose, before the seal is broken.

		No rotation at all. A 3D `rotateY` foreshortens the panel's outer edge, and
		because these are full-bleed panels that pulled the edge inward and left a
		bare strip at the far side of the viewport (up to 2% at 1280px wide). With
		no opaque backdrop behind them any more, that strip shows as bare page.

		Depth comes from the fold gradient and the vignette instead, and the gather
		supplies the 3D read once the reveal starts.
	*/
	.panel-wrap.is-closed {
		transform: none;
	}

	/*
		Wax seal.

		Kept warm and opaque, because the earlier near-black plum was tuned
		against the *pink* curtain and then carried over to the rose one, where it
		went translucent and the monogram stopped reading. The rose drape is
		lighter than the pink was, so the seal needs saturation rather than depth:
		a warm oxblood holds 4.72:1 against #d4a5a5 and still looks like wax,
		whereas near-black just reads as a grey disc.

		Opaque in the outer stops is doing real work too — the old fully
		transparent rim let the curtain show through and made it look like glass.

		The feTurbulence grain in .seal-blemish is what stops this reading as a
		glossy plastic button; real sealing wax is matte and slightly pitted.
	*/
	.seal {
		background:
			radial-gradient(
				circle at 36% 28%,
				#a3313f 0%,
				#8a2434 38%,
				#6b1a28 70%,
				#5c1622 100%
			);
		/* A hand-poured edge, never a true circle. */
		border-radius: 47% 53% 52% 48% / 53% 47% 53% 47%;
		box-shadow:
			0 18px 38px -14px rgb(74 31 44 / 0.55),
			0 0 0 1px rgb(74 31 44 / 0.3),
			inset 0 2px 4px rgb(255 255 255 / 0.14),
			inset 0 -8px 16px rgb(0 0 0 / 0.4);
		transition:
			transform 700ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			opacity 700ms ease-out;
	}

	.seal:hover:not(:disabled) {
		transform: translateY(-2px) scale(1.025);
	}
	.seal:active:not(:disabled) {
		transform: translateY(0) scale(0.985);
	}
	.seal:focus-visible {
		outline: 2px solid var(--color-gold);
		outline-offset: 6px;
	}

	/* The break: the seal lifts, tilts and dissolves before the doors move. */
	.seal:disabled {
		transform: translateY(-30px) rotate(-7deg) scale(1.14);
		opacity: 0;
	}

	/* Wax grain. The feTurbulence data-URI is what stops this reading as a
	   glossy plastic button — real sealing wax is matte and slightly pitted. */
	.seal-blemish {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		/* Low, and on soft-light rather than overlay. Overlay with an opaque grey
		   noise rect pushes the result toward white, which was invisible on the
		   near-black seal this was tuned for but bleached a mid-tone wax into a
		   translucent disc. soft-light only modulates around the backdrop. */
		opacity: 0.3;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	@media (prefers-reduced-motion: reduce) {
		/*
			The texture is already fully faded in and never animates here. The whole
			point of the flag is not to move things, so the closed state is skipped
			outright rather than cross-faded: `animation-play-state` never needs
			overriding because `animation: none` below beats it.

			`.panel::before`, not `.panel` — the base is opaque unconditionally now,
			so it is the texture layer that has to be pinned at full strength.
		*/
		.panel::before {
			opacity: 1;
			transition: none;
		}
		.panel::after {
			animation: none;
		}
		.seal {
			transition-duration: 240ms;
		}
	}
</style>
