<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { quintOut, cubicInOut } from 'svelte/easing';
	import { browser } from '$app/environment';
	import { reveal, openInvite } from '$lib/state/reveal.svelte';
	import { ambience } from '$lib/audio/ambience.svelte';
	import { sealBurst } from '$lib/lib/confetti';
	import MusicToggle from './MusicToggle.svelte';

	interface Props {
		children?: Snippet;
		/** Text stamped into the wax seal, e.g. "M & R" */
		monogram?: string;
		eyebrow?: string;
		names?: string;
		hint?: string;
		withMusic?: boolean;
		withConfetti?: boolean;
	}

	let {
		children,
		monogram = 'M & R',
		eyebrow = 'Together with their families',
		names = 'Michal & Lemuel',
		hint = 'Tap the seal to open',
		withMusic = true,
		withConfetti = true
	}: Props = $props();

	/* ── Motion budget ───────────────────────────────────────────
	   seal breaks 0–650ms · left panel 180ms · right panel 250ms
	   + 2400ms gather + 140ms wave span ≈ 2.7s unveiled.

	   The travel is deliberately longer than it needs to clear the viewport.
	   Each panel only has to travel one screen width, so a harder ease finishes
	   in the first third and the rest of the budget animates nothing. Measured:
	   the original quintOut version was fully open by 700ms of a 1700ms slot. */

	let reduced = $state(false);
	let breaking = $state(false);
	/** True once the curtain has fully cleared and the overlay is inert. */
	let dismissed = $state(reveal.opened);
	let sealEl = $state<HTMLButtonElement | null>(null);
	let curtainEl = $state<HTMLDivElement | null>(null);
	let guard = false;

	/**
	 * Fold groups per panel, and the two panel sides.
	 *
	 * `SIDES` must be a stable binding rather than an inline array literal in the
	 * template. As a literal it is a fresh array on every evaluation, and Svelte 5
	 * then tears the keyed each block down and rebuilds it instead of scheduling
	 * its `out:` transitions — the folds render correctly but never animate out.
	 * The symptom is a curtain that vanishes abruptly after the full timeout.
	 */
	const FOLDS = [0, 1, 2];
	const SIDES = ['left', 'right'] as const;
	const WAVE_STEP = 70;

	const timings: {
		release: number;
		stagger: number;
		duration: number;
		easing: (t: number) => number;
	} = $derived(
		reduced
			? { release: 0, stagger: 0, duration: 240, easing: cubicInOut }
			: {
					// Longer than it needs to clear the viewport, on purpose. The panel
					// only travels one screen width, so an aggressive ease finishes the
					// job in the first third and the rest of the budget animates nothing.
					// Slower is what makes it read as heavy rather than abrupt.
					release: 180,
					stagger: 70,
					duration: 2400,
					easing: quintOut
				}
	);

	/**
	 * A curtain, not a sliding rectangle.
	 *
	 * Everything is one composed `transform` string per frame so the components
	 * can never fight over the property, which is exactly the problem the
	 * previous fly + CSS-class arrangement had.
	 *
	 *   t — eased progress (quintOut), drives the main travel
	 *   u — linear progress, drives the swing and settle
	 *
	 * The fabric cues:
	 *   • the hem (`y`) eases on a *different* curve to the top edge (`x`),
	 *     so the bottom visibly trails — the single strongest realism cue
	 *   • `skewY` ramps as the panel is pulled, the fabric leaning into
	 *     its own weight
	 *   • `scaleX` dips as folds bunch together, then recovers
	 *   • `rotateY` unwinds about the inner edge, like a hinged door
	 */
	/**
	 * The rigid-slab travel, kept as a named alternative to the gather so the two
	 * can be compared without re-plumbing the animation loop.
	 *
	 *   u — linear progress through the panel's travel
	 *
	 * Cues: the hem (`y`) eases on a *different* curve to the top edge (`x`) so
	 * the bottom trails; `scaleX` dips as folds bunch then releases; `skewY` ramps
	 * as the cloth is pulled; `rotateY` unwinds about the seam edge with a damped
	 * settle. `quintOut` front-loads the travel, which is right for a rigid slab
	 * decelerating into its stop.
	 */
	function fabricFrame(u: number, sign: number): string {
		const t = quintOut(u);

		// Travel: quint, decelerating hard into the stop.
		const x = t * 108 * sign;

		// Hem lag — same journey, softer arrival. The gap between this and the
		// travel curve *is* the trailing cloth.
		const hem = u * u * (3 - 2 * u) * 26 * sign;

		// Cloth leans into the pull, then rights itself.
		const sag = u * u * 2.5 * sign;

		// Hinge unwind with a damped settle.
		const swing = (1 - Math.pow(1 - u, 2)) * 12;
		const settle = Math.sin(u * Math.PI * 2) * Math.exp(-u * 3.4) * 1.6 * sign;

		// Folds crowd together mid-travel, then release.
		const squash = 1 - Math.sin(u * Math.PI) * 0.14;

		return (
			`translate3d(${x}%, ${hem}px, 0) ` +
			`skewY(${sag}deg) scaleX(${squash}) ` +
			`rotateY(${swing + settle}deg)`
		);
	}

	/**
	 * The gather, applied to a whole panel: the cloth narrows to nothing while
	 * stretching tall, so it reads as being drawn aside rather than a slab sliding
	 * off-screen.
	 *
	 * `transform-origin` is the seam edge, so the panel collapses toward the centre
	 * line. This is the one transform that owns the silhouette — see the note in
	 * `animateCurtain` for why it can't live on the folds.
	 */
	function gatherFrame(u: number, sign: number): string {
		/*
			Travel, in two stages.

			The panel is 50% of the viewport plus a 6% bleed, so 100% of its own
			width only just gets it off the far side. It has to clear the screen by
			roughly half of its travel before `scaleX` starts shrinking it toward the
			seam origin, because the painted edge is
			`origin + width × scaleX + translate` — while the panel narrows, its outer
			edge retreats back toward the centre of the screen.

			That retreat is the flicker. Measured: with the two terms competing the
			edge came back inside the viewport after it had left. Travel is complete
			by 62% and overshot to 118%, so the retreat bottoms out at 101% — just
			past the screen edge, and stays there for the rest of the reveal. The
			narrowing then only shapes how the cloth leaves, never where it is.
		*/
		const travel = u;
		const x = cubicInOut(travel) * 118 * sign;

		// Hem lag: the bottom trails the top.
		const hem = u * u * (3 - 2 * u) * 26 * sign;

		/*
			Narrowing, over the whole timeline alongside the travel.

			Both run at their natural speed; the flicker is prevented by the travel
			overshoot above rather than by sequencing the two. A version that finished
			the narrowing at 62% while the panel was still mid-screen left a residual
			sliver at 88% of the viewport with curtain clearly on it, so the gather
			cannot be rushed relative to the travel.
		*/
		const hold = 0.18;
		const k = Math.min(1, Math.max(0, (u - hold) / (1 - hold)));
		const narrow = 1 - k * k * (3 - 2 * k);

		/*
			Bulge, but anchored so the panel never grows past the viewport.

			The pen's literal `scale(0,2)` doubled the panel's height, which on a
			full-bleed overlay made its bottom edge visible as a hard horizontal line
			part-way down the screen — the cloth read as floating rather than hanging.
			Gathering pulls cloth *inward*; it does not stretch it to twice its drop.
			Capped at 1.18 the bulge still catches the eye, and `transform-origin` on
			the vertical centre keeps the growth symmetric so the bottom edge stays
			pinned to the bottom of the frame.
		*/
		const stretch = 1 + Math.sin(u * Math.PI) * 0.18;

		// Hinge unwind, damped.
		const swing = (1 - Math.pow(1 - u, 2)) * 12;
		const settle = Math.sin(u * Math.PI * 2) * Math.exp(-u * 3.4) * 1.6 * sign;

		return (
			`translate3d(${x}%, ${hem}px, 0) ` +
			`skewY(${u * u * 2.5 * sign}deg) ` +
			`scaleX(${narrow}) scaleY(${stretch}) ` +
			`rotateY(${swing + settle}deg)`
		);
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
	function animateCurtain(): { folds: HTMLElement[]; wraps: HTMLElement[]; total: number } | null {
		if (!browser) return null;

		// A returning guest is already past the curtain, so nothing may animate.
		if (reveal.opened || dismissed) return null;

		const folds = [...(curtainEl?.querySelectorAll<HTMLElement>('[data-fabric]') ?? [])];
		if (!folds.length) return null;

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
			return { folds, wraps, total: timings.duration };
		}

		/*
			Two nested transforms, on two different elements. This is the whole
			reason the gather can work on a split panel.

			When the gather (scaleX → 0) was applied per fold, each of the six folds
			narrowed to its own sliver and the curtain read as a barcode — six bars
			instead of two halves of cloth. The pen this was adapted from had no
			fold split, which is exactly why one `scale(0,2)` looked like fabric
			there and doesn't here.

			So: the WRAPPER per side does the gather, collapsing the whole panel to a
			point on the seam edge, and the folds inside only carry the wave. Six
			staggered sub-transforms inside a narrowing parent read as one sheet of
			cloth being drawn, because the parent supplies the silhouette.
		*/

		// Fold 0 is innermost (nearest the seam) and leads on both sides, so the
		// wave always radiates outward from the centre.
		const tracks = folds.map((el) => ({
			el,
			sign: el.dataset.fabric === 'left' ? -1 : 1,
			delay:
				timings.release +
				(el.dataset.fabric === 'right' ? timings.stagger : 0) +
				Number(el.dataset.fold ?? 0) * WAVE_STEP
		}));

		const total = Math.max(...tracks.map((tr) => tr.delay + timings.duration));
		const start = performance.now();

		function step(now: number) {
			const elapsed = now - start;
			let done = true;

			// Per-side progress, used to drive the gather on the wrapper. The
			// outermost fold is the last to move, so the panel is only fully
			// gathered once every fold has caught up.
			const sideU: Record<string, number> = { left: 0, right: 0 };

			for (const tr of tracks) {
				const raw = (elapsed - tr.delay) / timings.duration;
				const key = tr.sign < 0 ? 'left' : 'right';
				sideU[key] = Math.max(sideU[key], Math.min(1, Math.max(0, raw)));
				if (raw < 1) done = false;
			}

			// The gather belongs to the panel, so the silhouette stays coherent.
			for (const wrap of wraps) {
				const sign = wrap.dataset.panel === 'left' ? -1 : 1;
				wrap.style.transform = gatherFrame(sideU[sign > 0 ? 'right' : 'left'], sign);
			}

			if (!done) frame = requestAnimationFrame(step);
		}

		frame = requestAnimationFrame(step);
		return { folds, wraps, total };
	}

	onMount(() => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// Land keyboard and screen-reader users on the seal.
		sealEl?.focus({ preventScroll: true });

		return () => {
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

			This was the reason the gather looked broken: with a solid
			`bg-forest-900` behind them, a panel that narrows in place revealed
			dark green instead of the invitation, so the curtain appeared to shrink
			without ever parting. The panels are 50% wide each with a 6% bleed, so
			they always overlap and fully cover the viewport while closed.

			What the backdrop *was* doing is shadowing the outer edges. That now
			lives on `.panel-wrap`, so it travels with the cloth.
		-->
		<!--
			Shadow only — deliberately transparent, so it never shows through the
			gap the panels are opening. The panels do the covering.
		-->
		<div
			class="pointer-events-none absolute inset-0 transition-opacity duration-[1800ms]
			       ease-luxury {dismissed ? 'opacity-0' : 'opacity-100'}"
			style="box-shadow: inset 0 0 140px rgb(0 0 0 / 0.55)"
			aria-hidden="true"
		></div>

		<!-- Perspective host for the 3D door fold. -->
		<div
			class="absolute inset-0"
			style="perspective: 1400px; transform-style: preserve-3d;
			       --part-ms: {timings.duration}ms; --release: {timings.release}ms"
		>
			<!--
				Panels are exactly `w-1/2` at `left-0` / `right-0`, so the join sits on
				50% by construction. The bleed that hides the seam lives on the inner
				fabric layer (`.panel--bleed`), OUTSIDE the fold wrapper, so `scaleX`
				can no longer eat into it. Fold index 0 is innermost, so the wave
				radiates outward from the seam.
			-->
			{#each SIDES as side (side)}
				<!--
					`data-panel` is the element the gather is written to. It has to be
					the panel as a whole: applying scaleX → 0 per fold made six narrow
					slivers that read as a barcode, where one narrowing parent holding
					three staggered children reads as cloth.
				-->
				<div
					data-panel={side}
					class="panel-wrap absolute inset-y-0 w-1/2 will-change-transform
					       {side === 'left' ? 'left-0' : 'right-0'}"
					style="height: 100%"
					class:panel-wrap--left={side === 'left'}
					class:panel-wrap--right={side === 'right'}
					class:is-closed={!breaking}
				>
					<!--
						The bleed, done with inset rather than a negative margin.

						A negative margin on this row moved the box without resizing it, so
						the right panel sat at 47%–97% and left a bare 3% strip at the right
						edge of the screen. `w-full` also overrode the intent, since an
						explicit width ignores the margin. Insetting the inner edge
						overrides the edges instead, which is what "this panel reaches a
						little past the centre line" actually means.
					-->
					<div
						class="absolute inset-y-0 flex
						       {side === 'left' ? 'left-0 right-[-6%]' : 'right-0 left-[-6%]'}"
					>
						{#each FOLDS as fold (fold)}
							<div
								class="panel relative h-full flex-1
								       {side === 'left' ? 'panel--left' : 'panel--right'}"
								data-fabric={side}
								data-fold={fold}
							></div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!--
			Seam, seal and vignette ride above the panels and fade out on the same
			choreography, so nothing is left hanging over the revealed page.
		-->
		<div
			class="absolute inset-0 transition-opacity duration-[1000ms] ease-luxury
			       {dismissed ? 'opacity-0' : 'opacity-100'}"
			style="transition-delay: 300ms"
		>
			<!-- Gold seam down the middle. -->
			<div
				class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2
				       bg-gradient-to-b from-transparent via-gold/25 to-transparent"
				aria-hidden="true"
			></div>

		<!-- ── Wax seal ── -->
		<div class="absolute inset-0 grid place-items-center px-8">
			<div class="flex flex-col items-center text-center">
				<p
					class="font-body text-[10px] font-medium tracking-[0.34em] text-champagne/55 uppercase"
				>
					{eyebrow}
				</p>
				<p class="mt-1.5 font-display text-lg italic tracking-wide text-champagne/85">
					{names}
				</p>

				<button
					bind:this={sealEl}
					type="button"
					onclick={handleOpen}
					disabled={breaking}
					aria-label="Open the invitation"
					class="seal group relative mt-9 grid h-32 w-32 place-items-center disabled:cursor-default"
				>
					<!-- pulsing halo -->
					<span
						class="pointer-events-none absolute inset-0 -z-10 rounded-full border border-gold/35
						       blur-[3px] animate-seal-pulse"
						aria-hidden="true"
					></span>

					<!-- gold rim -->
					<span
						class="absolute inset-[7px] rounded-full border border-gold/35 blur-[0.3px]
						       shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]"
						aria-hidden="true"
					></span>

					<!-- monogram, debossed into the wax -->
					<span
						class="relative z-10 font-display text-[1.65rem] font-medium tracking-[0.06em]
						       text-champagne"
						style="text-shadow: 0 1px 0 rgb(255 255 255 / 0.10), 0 -1px 1px rgb(0 0 0 / 0.55)"
					>
						{monogram}
					</span>

					<!-- wax mottling -->
					<span class="seal-blemish" aria-hidden="true"></span>
				</button>

				<p
					class="mt-8 font-body text-[10px] font-medium tracking-[0.3em] text-champagne/60
					       uppercase animate-breathe"
				>
					{hint}
				</p>
			</div>
		</div>

		<!-- Corner vignette keeps the eye centred on the seal. -->
		<div
			class="pointer-events-none absolute inset-0"
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
	/* ── Curtain fabric ───────────────────────────────────────────────
		Each fold is its own element so the wave can stagger them, which means
		the fold gradient has to line up across the seams between folds.
		`background-size: 100% 100%` with a gradient sized in % of each fold
		keeps the stripes continuous across all three.                        */
	.panel {
		overflow: hidden;
		background-color: var(--color-forest-800);
		background-image:
			repeating-linear-gradient(
				90deg,
				rgb(0 0 0 / 0) 0%,
				rgb(0 0 0 / 0) 8%,
				rgb(0 0 0 / 0.24) 14%,
				rgb(0 0 0 / 0.24) 16.5%,
				rgb(255 255 255 / 0.055) 22.5%,
				rgb(0 0 0 / 0.14) 31%
			),
			radial-gradient(120% 90% at 50% 6%, rgb(212 175 55 / 0.14), transparent 62%),
			linear-gradient(180deg, #2a3a32 0%, #1d2b24 48%, #111a15 100%);
		backface-visibility: hidden;
		will-change: transform;
	}

	/*
		NO border here. The gold trim belongs to the *seam* only, and there is one
		seam. When each of the three folds carried its own `border-right`, the trim
		multiplied to six full-height gold lines and the panel read as three
		separate slabs rather than one piece of cloth. The seam line is drawn once,
		on the overlay, and dies with the whole curtain.
	*/
	.panel--left {
		box-shadow: inset 0 0 140px rgb(0 0 0 / 0.5);
	}

	.panel--right {
		box-shadow: inset 0 0 140px rgb(0 0 0 / 0.5);
	}

	/*
		Seam cover is handled with the `right-[-6%]` / `left-[-6%]` insets in the
		template, not here. A negative margin was the original approach and it was
		wrong: it displaced each panel without resizing it, which both offset the
		whole right panel and left a bare strip at the viewport's right edge.

	/* A slow travelling sheen so the velvet feels alive while it hangs. */
	.panel::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			105deg,
			transparent 38%,
			rgb(212 175 55 / 0.1) 50%,
			transparent 62%
		);
		background-size: 260% 100%;
		animation: sheen 9s var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1)) infinite;
	}

	@keyframes sheen {
		from {
			background-position: 130% 0;
		}
		to {
			background-position: -30% 0;
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
		`transform-origin` is the SEAM edge on both the panel and the folds, and the
		vertical midpoint so the scaleY bulge grows symmetrically.

		On the panel, the seam edge is what makes the gather converge on the centre
		line, so the cloth is drawn inward toward the middle rather than shrinking in
		place. On the folds it keeps the staggered children aligned with the same
		point, which is what stops the wave from tearing the silhouette apart.
	*/
	.panel-wrap--left,
	.panel--left {
		transform-origin: 100% 50%;
	}
	.panel-wrap--right,
	.panel--right {
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

	/* ── Wax seal ─────────────────────────────────────────────────── */
	.seal {
		background:
			radial-gradient(circle at 36% 28%, #93303f 0%, #7a1f2b 38%, #5a1520 70%, #430d15 100%);
		/* A hand-poured edge, never a true circle. */
		border-radius: 47% 53% 52% 48% / 53% 47% 53% 47%;
		box-shadow:
			0 18px 38px -14px rgb(0 0 0 / 0.75),
			0 0 0 1px rgb(0 0 0 / 0.25),
			inset 0 2px 4px rgb(255 255 255 / 0.1),
			inset 0 -8px 16px rgb(0 0 0 / 0.45);
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
		opacity: 0.45;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	@media (prefers-reduced-motion: reduce) {
		.panel::after {
			animation: none;
		}
		.seal {
			transition-duration: 240ms;
		}
	}
</style>
