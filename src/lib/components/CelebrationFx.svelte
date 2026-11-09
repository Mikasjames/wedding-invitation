<script lang="ts">
	/**
	 * The decorative layer for a reveal. It renders one of two strategies —
	 * the CSS seal burst or the canvas confetti — behind a single `burst`
	 * counter, so callers do not need to know which one is configured.
	 *
	 * The CSS effect only animates `transform`/`opacity`/`scale`, all on small
	 * pre-painted elements. No filters, shadows, masks, or per-frame script.
	 */
	import { onMount } from 'svelte';
	import { deferredSealBurst } from '$lib/lib/confetti';
	import {
		celebrationSpeedFromSearch,
		DEFAULT_CELEBRATION_SPEED,
		type CelebrationKind,
		type CelebrationTier
	} from '$lib/lib/celebration';

	interface Props {
		kind?: CelebrationKind;
		tier?: CelebrationTier;
		scale?: number;
		/** Increment to play the effect. Zero is idle. */
		burst?: number;
	}

	let { kind = 'none', tier = 'full', scale = 1, burst = 0 }: Props = $props();

	let visible = $state(false);
	/** 1 plays the authored timings; >1 slows every animation down. */
	let speed = $state(DEFAULT_CELEBRATION_SPEED);

	/** Longest animation (dust: 950ms + 60ms delay) plus a settle frame. */
	const BASE_LIFETIME = 1010;
	const SETTLE = 150;

	onMount(() => {
		speed = celebrationSpeedFromSearch(window.location.search);
	});

	/**
	 * Each shard is a static clip-path on its own small element, moved outward
	 * with the individual `translate`/`rotate` properties. Keeping them as
	 * separate transforms means the browser can hand the whole thing to the
	 * compositor instead of re-rasterising a filter per frame.
	 *
	 * Distances stay short on purpose: a frame drop at 30fps is less visible
	 * when a shard only advances a few pixels per frame.
	 */
	const SHARDS = [
		{ tx: '-50px', ty: '-42px', rot: '-64deg', delay: '60ms', shape: 'polygon(50% 0%, 100% 100%, 0% 82%)' },
		{ tx: '46px', ty: '-48px', rot: '52deg', delay: '84ms', shape: 'polygon(0% 12%, 100% 0%, 22% 100%)' },
		{ tx: '56px', ty: '20px', rot: '84deg', delay: '104ms', shape: 'polygon(50% 0%, 100% 62%, 12% 100%)' },
		{ tx: '18px', ty: '54px', rot: '-32deg', delay: '74ms', shape: 'polygon(8% 0%, 100% 26%, 74% 100%, 0% 76%)' },
		{ tx: '-54px', ty: '28px', rot: '-78deg', delay: '96ms', shape: 'polygon(50% 0%, 100% 42%, 62% 100%, 0% 68%)' }
	];

	/**
	 * One wrapper holds every mote, so the puff is a single animated layer:
	 * the children are painted once and only the wrapper scales and fades.
	 */
	const DUST = [
		{ x: '-32px', y: '-26px', size: '5px' },
		{ x: '10px', y: '-40px', size: '4px' },
		{ x: '38px', y: '-18px', size: '6px' },
		{ x: '44px', y: '20px', size: '4px' },
		{ x: '16px', y: '42px', size: '5px' },
		{ x: '-20px', y: '36px', size: '4px' },
		{ x: '-42px', y: '10px', size: '6px' },
		{ x: '-6px', y: '-6px', size: '3px' }
	];

	const shards = $derived(tier === 'reduced' ? SHARDS.slice(0, 3) : SHARDS);

	$effect(() => {
		if (burst === 0) return;

		if (kind === 'confetti') {
			return deferredSealBurst(scale);
		}

		if (kind !== 'seal') return;

		visible = true;
		const timer = setTimeout(
			() => (visible = false),
			Math.round(BASE_LIFETIME * speed + SETTLE)
		);
		return () => clearTimeout(timer);
	});
</script>

{#if visible && kind === 'seal'}
	<div
		class="celebration"
		data-celebration="seal"
		data-tier={tier}
		style="--speed: {speed}"
		aria-hidden="true"
	>
		<span class="bloom"></span>

		{#if tier === 'full'}
			<span class="ripple"></span>
		{/if}

		{#each shards as shard (shard.tx)}
			<span
				class="shard"
				style="--tx: {shard.tx}; --ty: {shard.ty}; --rot: {shard.rot}; --delay: {shard.delay};
				       clip-path: {shard.shape}"
			></span>
		{/each}

		{#if tier === 'full'}
			<span class="dust">
				{#each DUST as mote (mote.x + mote.y)}
					<i style="--x: {mote.x}; --y: {mote.y}; --size: {mote.size}"></i>
				{/each}
			</span>
		{/if}
	</div>
{/if}

<style>
	.celebration {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}

	.bloom,
	.ripple,
	.shard,
	.dust {
		position: absolute;
		left: 50%;
		top: 50%;
	}

	/*
	 * A warm flash, painted once as a radial gradient. The 140% box is larger
	 * than the seal so the light spills past its edge, which is what makes it
	 * read as a glow rather than a disc.
	 */
	.bloom {
		width: 140%;
		aspect-ratio: 1;
		translate: -50% -50%;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgb(221 201 180 / 0.6) 0%,
			rgb(221 201 180 / 0.22) 42%,
			transparent 70%
		);
		opacity: 0;
		animation: bloom calc(760ms * var(--speed, 1))
			var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) both;
	}

	@keyframes bloom {
		0% {
			scale: 0.55;
			opacity: 0;
		}
		20% {
			opacity: 0.9;
		}
		100% {
			scale: 1.35;
			opacity: 0;
		}
	}

	/* The seal "stamps": one border circle, no painted fill. */
	.ripple {
		width: 100%;
		aspect-ratio: 1;
		translate: -50% -50%;
		border: 1.5px solid rgb(95 109 120 / 0.42);
		border-radius: 50%;
		opacity: 0;
		animation: ripple calc(700ms * var(--speed, 1)) ease-out both;
	}

	@keyframes ripple {
		0% {
			scale: 0.55;
			opacity: 0.75;
		}
		100% {
			scale: 2.1;
			opacity: 0;
		}
	}

	.shard {
		width: 24px;
		height: 24px;
		margin: -12px 0 0 -12px;
		background: linear-gradient(
			145deg,
			var(--color-champagne, #ddc9b4),
			var(--color-champagne-deep, #cdb59b) 48%,
			var(--color-rose-deep, #74838f)
		);
		opacity: 0;
		animation: shard calc(860ms * var(--speed, 1))
			var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1))
			calc(var(--delay, 0ms) * var(--speed, 1)) both;
	}

	@keyframes shard {
		0% {
			translate: 0 0;
			rotate: 0deg;
			scale: 0.35;
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		100% {
			translate: var(--tx) var(--ty);
			rotate: var(--rot);
			scale: 1;
			opacity: 0;
		}
	}

	.dust {
		width: 1px;
		height: 1px;
		opacity: 0;
		animation: dust calc(950ms * var(--speed, 1))
			var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1))
			calc(60ms * var(--speed, 1)) both;
	}

	.dust i {
		position: absolute;
		left: 0;
		top: 0;
		width: var(--size);
		height: var(--size);
		margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
		border-radius: 50%;
		background: var(--color-champagne-deep, #cdb59b);
		translate: var(--x) var(--y);
	}

	@keyframes dust {
		0% {
			scale: 0.35;
			opacity: 0;
		}
		20% {
			opacity: 0.95;
		}
		100% {
			scale: 1.5;
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bloom,
		.ripple,
		.shard,
		.dust {
			animation: none;
		}
	}
</style>
