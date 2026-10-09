<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { reveal, openInvite } from '$lib/state/reveal.svelte';
	import { ambience } from '$lib/audio/ambience.svelte';
	import { sealBurst } from '$lib/lib/confetti';
	import { wedding } from '$lib/lib/wedding';
	import MusicToggle from './MusicToggle.svelte';
	import Ornament from './Ornament.svelte';

	interface Props {
		children?: Snippet;
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

	type Phase = 'closed' | 'breaking' | 'flap' | 'letter' | 'leaving' | 'gone';

	let reduced = $state(false);
	let phase = $state<Phase>(reveal.opened ? 'gone' : 'closed');
	let sealEl = $state<HTMLButtonElement | null>(null);
	let guard = false;
	let timers: ReturnType<typeof setTimeout>[] = [];

	const breaking = $derived(phase !== 'closed');
	const dismissed = $derived(phase === 'gone');
	const leaving = $derived(phase === 'leaving' || phase === 'gone');

	const timings = $derived(
		reduced
			? { flapDelay: 0, flap: 0, letter: 0, hold: 0, fade: 240, content: 0 }
			: { flapDelay: 430, flap: 820, letter: 900, hold: 450, fade: 520, content: 2900 }
	);

	onMount(() => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		sealEl?.focus({ preventScroll: true });

		return () => {
			for (const t of timers) clearTimeout(t);
		};
	});

	function handleOpen() {
		if (guard) return;
		guard = true;

		if (withMusic) void ambience.play();

		if (withConfetti) sealBurst(!reduced);

		openInvite();

		if (reduced) {
			phase = 'leaving';
			timers.push(setTimeout(() => (phase = 'gone'), timings.fade + 40));
			return;
		}

		phase = 'breaking';
		const flapAt = timings.flapDelay;
		const letterAt = flapAt + timings.flap;
		const leavingAt = letterAt + timings.letter + timings.hold;
		const goneAt = leavingAt + timings.fade + 80;

		timers.push(setTimeout(() => (phase = 'flap'), flapAt));
		timers.push(setTimeout(() => (phase = 'letter'), letterAt));
		timers.push(setTimeout(() => (phase = 'leaving'), leavingAt));
		timers.push(setTimeout(() => (phase = 'gone'), goneAt));
	}

	$effect(() => {
		if (!browser) return;
		const locked = !dismissed;
		document.body.style.overflow = locked ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<div class="contents">
	<div
		data-reveal
		inert={!reveal.opened}
		class="transition-[opacity,transform] duration-[1200ms] ease-luxury
		       motion-reduce:transition-none
		       {reveal.opened
			? 'opacity-100'
			: 'pointer-events-none scale-[0.985] opacity-0'}"
		style="transition-delay: {timings.content}ms"
	>
		{@render children?.()}
	</div>

	<div
		data-envelope
		aria-hidden={dismissed}
		inert={dismissed}
		class="fixed inset-0 z-50 overflow-hidden
		       {dismissed ? 'pointer-events-none invisible' : ''}"
		style="padding-top: env(safe-area-inset-top)"
		role="dialog"
		aria-modal="true"
		aria-label="Wedding invitation — press the seal to open"
	>
		<div class="scene absolute inset-0" class:is-leaving={leaving}>
			<div class="paper absolute inset-0" aria-hidden="true"></div>

			<div class="folds absolute inset-0">
				<div class="envelope" data-phase={phase}>
					<div class="env-back" aria-hidden="true"></div>

					<div class="letter" aria-hidden="true">
						<p
							class="font-body text-[9px] font-medium tracking-[0.34em] text-gold-deep uppercase sm:text-[10px]"
						>
							{monogram}
						</p>
						<p
							class="mt-2 font-display text-[clamp(1.35rem,6.5vw,2.2rem)] leading-tight font-light italic text-ink"
						>
							{wedding.names}
						</p>
						<Ornament class="my-3 scale-90 sm:my-4" />
						<p
							class="font-body text-[9px] font-medium tracking-[0.26em] text-ink/60 uppercase sm:text-[10px]"
						>
							{wedding.dateLabel}
						</p>
					</div>

					<div class="pocket-wrap" aria-hidden="true">
						<div class="pocket pocket-bottom"></div>
						<div class="pocket pocket-left"></div>
						<div class="pocket pocket-right"></div>
					</div>

					<div class="flap-wrap" aria-hidden="true">
						<div class="flap">
							<div class="flap-face flap-front"></div>
							<div class="flap-face flap-liner"></div>
						</div>
					</div>

					<button
						bind:this={sealEl}
						type="button"
						onclick={handleOpen}
						disabled={breaking}
						aria-label="Open the invitation"
						class="seal group cursor-pointer disabled:cursor-default"
					>
						<img src="/seal.svg" alt="" aria-hidden="true" class="seal-wax" />
					</button>
				</div>
			</div>

			<div class="glaze absolute inset-0" aria-hidden="true"></div>

			<p
				class="hint absolute bottom-[7%] left-1/2 z-10 -translate-x-1/2 font-body text-[10px] font-medium
				       tracking-[0.3em] whitespace-nowrap text-gold-deep uppercase animate-breathe
				       transition-opacity duration-500 ease-luxury
				       {breaking ? 'opacity-0' : 'opacity-100'}"
			>
				{hint}
			</p>
		</div>
	</div>
</div>

{#if reveal.opened && withMusic}
	<MusicToggle />
{/if}

<style>
	.scene {
		--paper: #17446d;
		--apex: 47%;
		--radius: 10px;
		--column: min(86vw, 60svh, 460px);
		transition:
			opacity 520ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			transform 520ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.scene.is-leaving {
		opacity: 0;
		transform: translateY(14px) scale(0.99);
	}

	.paper {
		z-index: 0;
		background: var(--paper);
		pointer-events: none;
	}

	.glaze {
		z-index: 3;
		background:
			radial-gradient(58% 42% at 20% 15%, rgb(255 255 255 / 0.5), transparent 62%),
			radial-gradient(52% 48% at 84% 82%, rgb(140 152 162 / 0.22), transparent 66%),
			radial-gradient(130% 95% at 50% 44%, transparent 50%, rgb(62 72 84 / 0.14));
		pointer-events: none;
	}

	.folds {
		z-index: 2;
		display: grid;
		place-items: center;
		padding: 6%;
	}

	.envelope {
		position: relative;
		width: var(--column);
		aspect-ratio: 0.72;
		border-radius: var(--radius);
	}

	.env-back {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: var(--radius);
		background: linear-gradient(160deg, #d3d9dd, #c8d0d6);
		box-shadow: var(--shadow-luxe, 0 18px 40px -20px rgb(116 131 143 / 0.45));
	}

	.letter {
		position: absolute;
		left: 9%;
		right: 9%;
		top: 12%;
		height: 74%;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 9% 6% 6%;
		text-align: center;
		background: linear-gradient(to bottom, #f6f1e9, #f2ebe3 55%);
		border: 1px solid rgb(255 255 255 / 0.7);
		border-radius: 6px;
		box-shadow: 0 2px 6px rgb(62 72 84 / 0.14);
		pointer-events: none;
		transition:
			transform 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			box-shadow 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1));
		transition-delay: 80ms;
		will-change: transform;
	}

	.envelope[data-phase='letter'] .letter,
	.envelope[data-phase='leaving'] .letter,
	.envelope[data-phase='gone'] .letter {
		transform: translateY(-58%) rotate(-1.5deg);
		box-shadow: 0 26px 42px -18px rgb(62 72 84 / 0.42);
	}

	.pocket-wrap {
		position: absolute;
		inset: 0;
		z-index: 2;
		overflow: hidden;
		border-radius: var(--radius);
		pointer-events: none;
	}

	.pocket {
		position: absolute;
		inset: 0;
	}

	.pocket-left {
		clip-path: polygon(0 0, 50% var(--apex), 0 100%);
		background: linear-gradient(105deg, #e0e4e7, #d7dde1 70%);
		filter: drop-shadow(3px 5px 5px rgb(62 72 84 / 0.2));
	}

	.pocket-right {
		clip-path: polygon(100% 0, 50% var(--apex), 100% 100%);
		background: linear-gradient(255deg, #dce1e4, #d3dade 70%);
		filter: drop-shadow(3px 5px 5px rgb(62 72 84 / 0.2));
	}

	.pocket-bottom {
		clip-path: polygon(0 100%, 50% var(--apex), 100% 100%);
		background: linear-gradient(to top, #ccd4da, #d7dde2 90%);
	}

	.flap-wrap {
		position: absolute;
		inset: 0;
		z-index: 3;
		perspective: 1400px;
		pointer-events: none;
	}

	.envelope[data-phase='letter'] .flap-wrap,
	.envelope[data-phase='leaving'] .flap-wrap,
	.envelope[data-phase='gone'] .flap-wrap {
		z-index: 0;
	}

	.flap {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: var(--apex);
		clip-path: inset(0 round var(--radius) var(--radius) 0 0);
		transform-origin: 50% 0%;
		transform-style: preserve-3d;
		pointer-events: none;
		will-change: transform;
	}

	.flap-face {
		position: absolute;
		inset: 0;
		clip-path: polygon(0 0, 100% 0, 50% 100%);
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	.flap-front {
		background: linear-gradient(168deg, #e6eaec, #d9dfe3);
		filter: drop-shadow(4px 7px 6px rgb(62 72 84 / 0.18));
	}

	.flap-liner {
		transform: rotateX(180deg);
		background: linear-gradient(to top, #c9d1d7, #dee4e8 70%);
		filter: drop-shadow(-4px 6px 5px rgb(62 72 84 / 0.18));
	}

	.envelope[data-phase='flap'] .flap,
	.envelope[data-phase='letter'] .flap,
	.envelope[data-phase='leaving'] .flap,
	.envelope[data-phase='gone'] .flap {
		animation: flap-open 820ms var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1)) forwards;
	}

	@keyframes flap-open {
		0% {
			transform: rotateX(0deg);
		}
		100% {
			transform: rotateX(-180deg);
		}
	}

	.env-back::before,
	.env-back::after,
	.pocket::before,
	.pocket::after,
	.flap-front::before,
	.flap-front::after,
	.flap-liner::before,
	.flap-liner::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background-image: url('/lace.svg');
		background-repeat: repeat;
		background-size: 140px 140px;
		pointer-events: none;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	.env-back::before,
	.pocket::before,
	.flap-front::before,
	.flap-liner::before {
		opacity: 0.11;
		translate: 1px 1.1px;
	}

	.env-back::after,
	.pocket::after,
	.flap-front::after,
	.flap-liner::after {
		opacity: 0.15;
		translate: -0.9px -1px;
		filter: brightness(0) invert(1);
	}

	.seal {
		position: absolute;
		left: 50%;
		top: var(--apex);
		translate: -50% -50%;
		z-index: 5;
		width: clamp(88px, 24%, 128px);
		aspect-ratio: 432 / 446;
		border-radius: 9999px;
		transition:
			transform 420ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			opacity 420ms ease-out;
	}

	.seal-wax {
		display: block;
		width: 100%;
		filter:
			drop-shadow(7px 13px 14px rgb(62 72 84 / 0.3))
			drop-shadow(1px 2px 2px rgb(62 72 84 / 0.18));
	}

	.seal::after {
		content: '';
		position: absolute;
		inset: 4%;
		border-radius: 9999px;
		box-shadow: 0 0 26px 10px rgb(116 131 143 / 0.32);
		opacity: 0;
		transition: opacity 240ms ease-out;
	}

	.seal:hover:not(:disabled) {
		transform: translateY(-2px) scale(1.025);
	}
	.seal:active:not(:disabled) {
		transform: translateY(0) scale(0.985);
	}
	.seal:focus-visible {
		outline: none;
	}
	.seal:focus-visible::after {
		opacity: 1;
	}

	.seal:disabled {
		transform: translateY(-30px) rotate(-7deg) scale(1.14);
		opacity: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.scene {
			transition-duration: 240ms;
		}
		.flap {
			animation: none !important;
		}
		.letter {
			transition-duration: 240ms;
			transition-delay: 0ms;
		}
		.flap-wrap {
			animation: none !important;
		}
		.seal {
			transition-duration: 240ms;
		}
	}
</style>