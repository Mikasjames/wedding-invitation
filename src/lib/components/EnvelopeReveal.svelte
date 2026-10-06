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
			<div class="backdrop absolute inset-0" aria-hidden="true"></div>

			<div class="absolute inset-0 grid place-items-center px-6" style="perspective: 1400px">
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
						<div class="pocket pocket-left"></div>
						<div class="pocket pocket-right"></div>
						<div class="pocket pocket-bottom"></div>
					</div>

					<div class="flap" aria-hidden="true">
						<div class="flap-face flap-front"></div>
						<div class="flap-face flap-liner"></div>
					</div>

					<button
						bind:this={sealEl}
						type="button"
						onclick={handleOpen}
						disabled={breaking}
						aria-label="Open the invitation"
						class="seal group cursor-pointer disabled:cursor-default"
					>
						<img
							src="/seal.svg"
							alt=""
							aria-hidden="true"
							class="relative z-10 h-24 w-24 object-contain drop-shadow-[0_18px_24px_rgb(91_104_115/0.45)] sm:h-28 sm:w-28"
						/>
					</button>
				</div>

				<p
					class="absolute bottom-[9%] left-1/2 -translate-x-1/2 font-body text-[10px] font-medium
					       tracking-[0.3em] whitespace-nowrap text-gold-deep uppercase animate-breathe
					       transition-opacity duration-500 ease-luxury
					       {breaking ? 'opacity-0' : 'opacity-100'}"
				>
					{hint}
				</p>
			</div>
		</div>
	</div>
</div>

{#if reveal.opened && withMusic}
	<MusicToggle />
{/if}

<style>
	.backdrop {
		background:
			radial-gradient(120% 90% at 50% 38%, transparent 52%, rgb(62 72 84 / 0.16)),
			linear-gradient(165deg, var(--color-ivory) 30%, var(--color-champagne) 145%);
	}

	.scene {
		transition:
			opacity 520ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			transform 520ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1));
	}

	.scene.is-leaving {
		opacity: 0;
		transform: translateY(14px) scale(0.99);
	}

	.envelope {
		position: relative;
		width: min(88vw, 90svh, 560px);
		aspect-ratio: 1.45;
		transform-style: preserve-3d;
	}

	.env-back {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: 10px;
		background: linear-gradient(150deg, var(--color-champagne) 10%, var(--color-champagne-deep) 90%);
		box-shadow: var(--shadow-luxe, 0 18px 40px -20px rgb(116 131 143 / 0.45));
	}

	.letter {
		position: absolute;
		left: 5%;
		right: 5%;
		top: 6%;
		height: 92%;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 9% 6% 6%;
		text-align: center;
		background: linear-gradient(to bottom, #f2ebe3, var(--color-ivory) 55%);
		border: 1px solid rgb(255 255 255 / 0.65);
		border-radius: 6px;
		box-shadow: 0 2px 6px rgb(62 72 84 / 0.14);
		transition:
			transform 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			box-shadow 900ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1));
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
		border-radius: 10px;
		pointer-events: none;
	}

	.pocket {
		position: absolute;
		inset: 0;
	}

	.pocket-left {
		clip-path: polygon(0 0, 63% 50%, 0 100%);
		background: linear-gradient(100deg, #d3bda6, var(--color-champagne) 70%);
	}

	.pocket-right {
		clip-path: polygon(100% 0, 37% 50%, 100% 100%);
		background: linear-gradient(260deg, #d3bda6, var(--color-champagne) 70%);
	}

	.pocket-bottom {
		clip-path: polygon(0 100%, 50% 26%, 100% 100%);
		background: linear-gradient(to top, var(--color-champagne-deep), #e0ccb9 85%);
		filter: drop-shadow(0 -3px 4px rgb(62 72 84 / 0.14));
	}

	.flap {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 50%;
		z-index: 3;
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
		background: linear-gradient(to bottom, var(--color-champagne) 55%, var(--color-champagne-deep));
	}

	.flap-liner {
		transform: rotateX(180deg);
		background: linear-gradient(to top, var(--color-blush), #ececef 70%);
	}

	.envelope[data-phase='flap'] .flap,
	.envelope[data-phase='letter'] .flap,
	.envelope[data-phase='leaving'] .flap,
	.envelope[data-phase='gone'] .flap {
		animation: flap-open 820ms var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1)) forwards;
	}

	@keyframes flap-open {
		0% {
			transform: rotateX(0deg) scaleY(1);
			z-index: 3;
		}
		49.9% {
			z-index: 3;
		}
		50% {
			z-index: 0;
		}
		100% {
			transform: rotateX(-180deg) scaleY(0.04);
			z-index: 0;
		}
	}

	.seal {
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		z-index: 4;
		border-radius: 9999px;
		transition:
			transform 420ms var(--ease-luxury, cubic-bezier(0.22, 1, 0.36, 1)),
			opacity 420ms ease-out;
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
		}
		.seal {
			transition-duration: 240ms;
		}
	}
</style>
