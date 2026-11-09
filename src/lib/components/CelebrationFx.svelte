<script lang="ts">
	/**
	 * The decorative layer for a reveal. It renders one of two strategies —
	 * the CSS seal burst or the canvas confetti — behind a single `burst`
	 * counter, so callers do not need to know which one is configured.
	 *
	 * The CSS effect only animates `transform`/`opacity`/`scale`, all on small
	 * pre-painted elements. No filters, shadows, masks, or per-frame script.
	 */
	import { deferredSealBurst } from '$lib/lib/confetti';
	import type { CelebrationKind, CelebrationTier } from '$lib/lib/celebration';

	interface Props {
		kind?: CelebrationKind;
		tier?: CelebrationTier;
		scale?: number;
		/** Increment to play the effect. Zero is idle. */
		burst?: number;
	}

	let { kind = 'none', tier = 'full', scale = 1, burst = 0 }: Props = $props();

	let visible = $state(false);

	/**
	 * Each shard is a static clip-path on its own small element, moved outward
	 * with the individual `translate`/`rotate` properties. Keeping them as
	 * separate transforms means the browser can hand the whole thing to the
	 * compositor instead of re-rasterising a filter per frame.
	 */
	const SHARDS = [
		{ tx: '-66px', ty: '-54px', rot: '-64deg', delay: '60ms', shape: 'polygon(50% 0%, 100% 100%, 0% 82%)' },
		{ tx: '58px', ty: '-62px', rot: '52deg', delay: '84ms', shape: 'polygon(0% 12%, 100% 0%, 22% 100%)' },
		{ tx: '72px', ty: '24px', rot: '84deg', delay: '104ms', shape: 'polygon(50% 0%, 100% 62%, 12% 100%)' },
		{ tx: '22px', ty: '70px', rot: '-32deg', delay: '74ms', shape: 'polygon(8% 0%, 100% 26%, 74% 100%, 0% 76%)' },
		{ tx: '-70px', ty: '34px', rot: '-78deg', delay: '96ms', shape: 'polygon(50% 0%, 100% 42%, 62% 100%, 0% 68%)' }
	];

	/**
	 * One wrapper holds every mote, so the puff is a single animated layer:
	 * the children are painted once and only the wrapper scales and fades.
	 */
	const DUST = [
		{ x: '-38px', y: '-30px', size: '5px' },
		{ x: '12px', y: '-48px', size: '4px' },
		{ x: '44px', y: '-22px', size: '6px' },
		{ x: '52px', y: '24px', size: '4px' },
		{ x: '20px', y: '48px', size: '5px' },
		{ x: '-24px', y: '42px', size: '4px' },
		{ x: '-50px', y: '12px', size: '6px' },
		{ x: '-8px', y: '-8px', size: '3px' }
	];

	const shards = $derived(tier === 'reduced' ? SHARDS.slice(0, 3) : SHARDS);

	$effect(() => {
		if (burst === 0) return;

		if (kind === 'confetti') {
			return deferredSealBurst(scale);
		}

		if (kind !== 'seal') return;

		visible = true;
		const timer = setTimeout(() => (visible = false), 1600);
		return () => clearTimeout(timer);
	});
</script>

{#if visible && kind === 'seal'}
	<div
		class="celebration"
		data-celebration="seal"
		data-tier={tier}
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
		animation: bloom 760ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) both;
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
		animation: ripple 700ms ease-out both;
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
		animation: shard 860ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) var(--delay, 0ms) both;
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
		animation: dust 950ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)) 60ms both;
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
