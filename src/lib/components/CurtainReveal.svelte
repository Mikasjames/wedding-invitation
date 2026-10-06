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

	let reduced = $state(false);
	let breaking = $state(false);
	let dismissed = $state(reveal.opened);
	let sealEl = $state<HTMLButtonElement | null>(null);
	let curtainEl = $state<HTMLDivElement | null>(null);
	let guard = false;

	const SIDES = ['left', 'right'] as const;

	const MAX_TILT = 20;

	let cover = $state(0);

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

	function gatherFrame(u: number, sign: number): string {
		const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

		const x = e * 118 * sign;
		const narrow = 1 - e;
		const stretch = 1 + Math.sin(u * Math.PI) * 0.15;
		const rotate = e * MAX_TILT * sign;

		return `translate3d(${x}%, 0, 0) scaleX(${narrow}) scaleY(${stretch}) rotate(${rotate}deg)`;
	}

	function animateCurtain(): { wraps: HTMLElement[]; total: number } | null {
		if (!browser) return null;

		if (reveal.opened || dismissed) return null;

		const wraps = [...(curtainEl?.querySelectorAll<HTMLElement>('[data-panel]') ?? [])];
		if (!wraps.length) return null;

		if (reduced) {
			for (const wrap of wraps) {
				wrap.style.transition = 'none';
				wrap.style.opacity = '0';
			}
			return { wraps, total: timings.duration };
		}

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

		const ro = new ResizeObserver(() => (cover = panelCover()));
		if (curtainEl) ro.observe(curtainEl);
		cover = panelCover();

		sealEl?.focus({ preventScroll: true });

		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
			clearTimeout(dismissTimer);
		};
	});

	let frame = 0;
	let dismissTimer: ReturnType<typeof setTimeout> | undefined;

	function handleOpen() {
		if (guard) return;
		guard = true;

		if (withMusic) void ambience.play();

		if (withConfetti) sealBurst(!reduced);

		const run = animateCurtain();

		clearTimeout(dismissTimer);
		if (run) {
			dismissTimer = setTimeout(() => {
				cancelAnimationFrame(frame);
				for (const wrap of run.wraps) {
					wrap.style.transform = gatherFrame(1, wrap.dataset.panel === 'left' ? -1 : 1);
				}
				dismissed = true;
			}, run.total + 400);
		} else {
			dismissed = true;
		}

		breaking = true;
		openInvite();
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
		class="transition-[opacity,transform] duration-[1600ms] ease-luxury delay-500
		       motion-reduce:transition-none
		       {reveal.opened
			? 'opacity-100'
			: 'pointer-events-none scale-[0.985] opacity-0'}"
	>
		{@render children?.()}
	</div>

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

		<div
			class="absolute inset-0"
			style="perspective: 1400px; transform-style: preserve-3d;
			       --release: {timings.release}ms"
		>

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

		<div
			class="pointer-events-none absolute inset-0 transition-opacity duration-[2000ms]
			       ease-luxury {breaking ? 'opacity-0' : 'opacity-100'}"
			style="box-shadow: inset 0 0 170px rgb(91 104 115 / 0.55)"
			aria-hidden="true"
		></div>

		<div
			class="absolute inset-0 transition-opacity duration-[1000ms] ease-luxury
			       {dismissed ? 'opacity-0' : 'opacity-100'}"
			style="transition-delay: 300ms"
		>

		<div class="absolute inset-0 grid place-items-center px-8">

			<div class="flex flex-col items-center text-center">
				<button
					bind:this={sealEl}
					type="button"
					onclick={handleOpen}
					disabled={breaking}
					aria-label="Open the invitation"
					class="seal group relative cursor-pointer disabled:cursor-default"
				>
					<img
						src="/seal.svg"
						alt=""
						aria-hidden="true"
						class="relative z-10 h-32 w-32 object-contain drop-shadow-[0_18px_24px_rgb(91_104_115/0.45)]"
					/>

				</button>

				<p
					class="mt-8 font-body text-[10px] font-medium tracking-[0.3em] text-champagne
					       uppercase animate-breathe transition-opacity duration-500 ease-luxury
					       {breaking ? 'opacity-0' : 'opacity-100'}"
				>
					{hint}
				</p>
			</div>
		</div>

		<div
			class="pointer-events-none absolute inset-0 transition-opacity duration-[2000ms]
			       ease-luxury {breaking ? 'opacity-0' : 'opacity-100'}"
			style="background: radial-gradient(120% 80% at 50% 45%, transparent 40%, rgb(0 0 0 / 0.45))"
			aria-hidden="true"
		></div>
		</div>
	</div>
</div>

{#if reveal.opened && withMusic}
	<MusicToggle />
{/if}

<style>

	.panel {
		overflow: hidden;

		background-color: var(--color-forest-800);
		backface-visibility: hidden;
	}

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

	.panel--right::before {
		background-position: calc(0.47 * 100vw) center;
	}

	.panel-wrap:not(.is-closed) .panel::before {
		opacity: 1;
	}

	.panel::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			105deg,
			transparent 38%,
			rgb(235 222 213 / 0.12) 50%,
			transparent 62%
		);
		background-size: 260% 100%;
		will-change: transform;
		animation: sheen 9s var(--ease-silk, cubic-bezier(0.65, 0, 0.35, 1)) infinite;

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

	.panel-wrap {
		transform-style: preserve-3d;
	}

	.panel-wrap--left {
		transform-origin: 100% 50%;
	}
	.panel-wrap--right {
		transform-origin: 0% 50%;
	}

	.panel-wrap.is-closed {
		transform: none;
	}

	.seal {
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

	.seal:disabled {
		transform: translateY(-30px) rotate(-7deg) scale(1.14);
		opacity: 0;
	}

	@media (prefers-reduced-motion: reduce) {

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
