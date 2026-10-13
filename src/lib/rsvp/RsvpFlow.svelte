<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
	import { CODE_LENGTH } from './codes';
	import { getBackend } from './firebase.client';
	import { RsvpFlow, confirmedSeats, seatLabel } from './rsvp.svelte';

	interface Props {
		/** Lets a caller own the flow — used by the tests. */
		flow?: RsvpFlow;
		class?: string;
	}

	let { flow, class: className = '' }: Props = $props();

	const rsvp = $derived(
		flow ?? new RsvpFlow({ getBackend, storage: browser ? localStorage : null })
	);

	let entry = $state('');
	let heading = $state<HTMLHeadingElement | null>(null);
	let copied = $state(false);
	let copiedError = $state(false);

	// A guest who taps their personal link should land on their household, not on
	// a code box. Read from `page.url` rather than a `load` function: `load` runs
	// at prerender time, so a query string would be baked into the static HTML.
	$effect(() => {
		const code = page.url.searchParams.get('code');

		if (code) rsvp.lookup(code);
	});

	// The remembered code goes in the box, not into a lookup. See `lookup()`.
	$effect(() => {
		if (!entry && rsvp.remembered) entry = rsvp.remembered;
	});

	// Each phase is announced and focused, so a guest using a screen reader is
	// told the flow moved on rather than having to go looking for it.
	$effect(() => {
		void rsvp.phase;
		heading?.focus();
	});

	function submitCode(event: SubmitEvent) {
		event.preventDefault();
		rsvp.lookup(entry);
	}

	function rsvpLink(code: string | null): string {
		return code ? `${page.url.origin}${base}/?code=${code}` : '';
	}

	async function copyLink() {
		copied = false;
		copiedError = false;

		try {
			await navigator.clipboard.writeText(rsvpLink(rsvp.code));
			copied = true;
		} catch {
			// Clipboard access is refused outside a secure context and on older
			// Android WebViews. Showing the link in the receipt is the fallback.
			copiedError = true;
		}
	}

	const busy = $derived(rsvp.phase === 'loading' || rsvp.phase === 'submitting');

	/** The form has to stay on screen while the save is in flight. */
	const onForm = $derived(rsvp.phase === 'found' || rsvp.phase === 'submitting');
</script>

<div
	class="mx-auto flex w-full max-w-md flex-col items-center text-center {className}"
	data-rsvp
>
	{#if rsvp.unavailable}
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			RSVP
		</p>
		<Ornament class="my-6" />
		<h2 class="font-display text-xl text-ink" tabindex="-1" bind:this={heading}>
			RSVPs are not open just yet
		</h2>
		<p class="mt-3 font-display text-lg text-ink/70">
			Please reach us at {wedding.rsvp.contact} and we will add you by hand.
		</p>
	{:else if rsvp.phase === 'loading'}
		<div class="py-10" role="status">
			<span
				class="mx-auto block h-6 w-6 animate-spin rounded-full border border-gold/30 border-t-gold-deep motion-reduce:animate-none"
				aria-hidden="true"
			></span>
			<span class="sr-only">Looking up your invitation</span>
		</div>
	{:else if rsvp.phase === 'confirmed' && rsvp.household}
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			RSVP
		</p>
		<Ornament class="my-6" />
		<h2 class="font-display text-2xl text-ink" tabindex="-1" bind:this={heading}>
			{rsvp.household.status === 'attending' ? 'Joyfully accepted!' : 'With regret, noted.'}
		</h2>
		<p class="mt-3 font-display text-lg text-ink/70">
			{rsvp.household.householdName} ·
			{rsvp.household.status === 'attending'
				? `${seatLabel(confirmedSeats(rsvp.household))} confirmed`
				: 'not able to attend'}
		</p>

		<p class="mt-6 font-body text-[11px] leading-relaxed text-ink/50">
			Your reference is
			<span class="tracking-[0.2em] text-ink/70">{rsvp.code}</span>. You can return to your
			link and change this any time before {wedding.rsvp.deadline}.
		</p>

		<div class="mt-6 flex w-full flex-col gap-3">
			<button
				type="button"
				onclick={copyLink}
				class="w-full rounded-full border border-gold/30 px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
			>
				{copied ? 'Link copied' : 'Copy my link'}
			</button>
			{#if copiedError}
				<p class="font-body text-[11px] break-all text-ink/50">{rsvpLink(rsvp.code)}</p>
			{/if}
			<button
				type="button"
				onclick={() => rsvp.edit()}
				class="rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90"
			>
				Change my answer
			</button>
		</div>
	{:else if onForm && rsvp.household}
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			RSVP
		</p>
		<Ornament class="my-6" />
		<h2 class="font-display text-2xl text-ink" tabindex="-1" bind:this={heading}>
			Welcome, {rsvp.household.householdName}
		</h2>
		<p class="mt-3 font-display text-lg text-ink/70">
			{#if rsvp.canAttend}
				We have reserved {seatLabel(rsvp.seatsAllocated)} in your honour.
			{:else}
				We are not able to seat your party, but please let us know you received this.
			{/if}
		</p>

		{#if rsvp.error}
			<p
				role="alert"
				class="mt-6 w-full rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] text-ink/70"
			>
				{rsvp.error}
			</p>
		{/if}

		<form
			class="mt-8 flex w-full flex-col gap-6"
			onsubmit={(e) => {
				e.preventDefault();
				rsvp.submit();
			}}
		>
			{#if rsvp.canAttend}
				<fieldset class="flex w-full flex-col gap-3">
					<legend class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
						Our answer
					</legend>
					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							onclick={() => rsvp.setIntent('attending')}
							aria-pressed={rsvp.intent === 'attending'}
							class="rounded-full border px-4 py-3 font-body text-[11px] font-medium tracking-[0.2em] uppercase transition
								{rsvp.intent === 'attending'
								? 'border-plum bg-plum text-champagne'
								: 'border-gold/30 text-ink/60 hover:opacity-80'}"
						>
							Accepting
						</button>
						<button
							type="button"
							onclick={() => rsvp.setIntent('declined')}
							aria-pressed={rsvp.intent === 'declined'}
							class="rounded-full border px-4 py-3 font-body text-[11px] font-medium tracking-[0.2em] uppercase transition
								{rsvp.intent === 'declined'
								? 'border-plum bg-plum text-champagne'
								: 'border-gold/30 text-ink/60 hover:opacity-80'}"
						>
							Declining
						</button>
					</div>
				</fieldset>
			{/if}

			{#if rsvp.intent === 'attending' && rsvp.canAttend}
				<fieldset class="flex w-full flex-col gap-3">
					<legend class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
						How many of you are coming?
					</legend>
					<div class="flex items-center justify-center gap-6">
						<button
							type="button"
							onclick={() => rsvp.setPartySize(rsvp.partySize - 1)}
							disabled={rsvp.partySize <= 1}
							aria-label="One fewer seat"
							class="h-11 w-11 rounded-full border border-gold/30 text-lg text-ink/70 transition hover:opacity-80 disabled:opacity-30"
						>
							&minus;
						</button>
						<span class="w-16 text-center font-display text-3xl text-ink" aria-live="polite">
							{rsvp.partySize}
						</span>
						<button
							type="button"
							onclick={() => rsvp.setPartySize(rsvp.partySize + 1)}
							disabled={rsvp.partySize >= rsvp.seatsAllocated}
							aria-label="One more seat"
							class="h-11 w-11 rounded-full border border-gold/30 text-lg text-ink/70 transition hover:opacity-80 disabled:opacity-30"
						>
							+
						</button>
					</div>
					<p class="font-body text-[11px] text-ink/50">
						of {seatLabel(rsvp.seatsAllocated)} reserved for you
					</p>
					{#if rsvp.partySize < rsvp.seatsAllocated}
						<button
							type="button"
							onclick={() => rsvp.setAllAttending()}
							class="font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase underline underline-offset-4"
						>
							All {rsvp.seatsAllocated} of you
						</button>
					{/if}
				</fieldset>

				<details class="w-full">
					<summary class="cursor-pointer font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
						Names (optional)
					</summary>
					<div class="mt-4 flex flex-col gap-2">
						{#each rsvp.attendeeNames as _name, i (i)}
							<label class="sr-only" for={`attendee-${i}`}>Guest {i + 1}</label>
							<input
								id={`attendee-${i}`}
								type="text"
								bind:value={rsvp.attendeeNames[i]}
								placeholder="Guest {i + 1}"
								class="w-full rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
							/>
						{/each}
					</div>
				</details>

				<label class="flex w-full flex-col gap-2 text-left">
					<span class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
						Dietary requirements (optional)
					</span>
					<textarea
						rows="2"
						bind:value={rsvp.dietaryNotes}
						placeholder="Allergies, or simply no beef"
						class="w-full rounded-2xl border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
					></textarea>
				</label>
			{/if}

			{#if rsvp.canAttend}
				<label class="flex w-full flex-col gap-2 text-left">
					<span class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
						A note for us (optional)
					</span>
					<textarea
						rows="3"
						bind:value={rsvp.message}
						placeholder="Congratulations, or a note about the seating"
						class="w-full rounded-2xl border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
					></textarea>
				</label>
			{/if}

			<button
				type="submit"
				disabled={!rsvp.canSubmit || busy}
				class="w-full rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90 disabled:opacity-40"
			>
				{busy ? 'Saving' : 'Confirm our RSVP'}
			</button>
		</form>
	{:else}
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
			RSVP
		</p>
		<Ornament class="my-6" />
		<h2 class="font-display text-2xl text-ink" tabindex="-1" bind:this={heading}>Enter your code</h2>
		<p class="mt-3 font-display text-lg text-ink/70">
			Your {CODE_LENGTH}-character code came with your invitation.
		</p>

		{#if rsvp.error}
			<p
				role="alert"
				class="mt-6 w-full rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] text-ink/70"
			>
				{rsvp.error}
			</p>
		{/if}

		<form class="mt-8 flex w-full flex-col gap-4" onsubmit={submitCode}>
			<label class="sr-only" for="rsvp-code">Your RSVP code</label>
			<input
				id="rsvp-code"
				type="text"
				name="code"
				inputmode="text"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				maxlength="64"
				placeholder="W8K9JPTR4M"
				bind:value={entry}
				required
				data-rsvp-code
				class="w-full rounded-full border border-gold/30 bg-ivory px-5 py-3 text-center font-body text-sm uppercase tracking-[0.3em] text-ink placeholder:text-ink/30"
			/>
			<button
				type="submit"
				disabled={busy}
				class="rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90 disabled:opacity-40"
			>
				Continue
			</button>
		</form>

		<p class="mt-6 font-body text-[11px] text-ink/50">
			Cannot find your code? Write to
			{#if wedding.rsvp.contactEmail}
				<a href={`mailto:${wedding.rsvp.contactEmail}`} class="underline underline-offset-4">
					{wedding.rsvp.contact}
				</a>
			{:else}
				<span class="text-ink/70">{wedding.rsvp.contact}</span>
			{/if}
			and we will sort it out.
		</p>
	{/if}
</div>