<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import AdminPanel from '$lib/admin/AdminPanel.svelte';
	import AdminStat from '$lib/admin/AdminStat.svelte';
	import { AdminSession } from '$lib/admin/auth.svelte';
	import { GuestList } from '$lib/admin/guests.svelte';
	import { ACCESS_DENIED } from '$lib/admin/guests.driver';
	import { isAuthConfigured } from '$lib/firebase/app';
	import { createAuthDriver } from '$lib/firebase/admin-auth.client';
	import { getGuestListBackend } from '$lib/firebase/admin-guests.client';

	const ERROR_CLASS =
		'mt-6 w-full rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] leading-relaxed text-ink/70';

	const BUTTON_CLASS =
		'rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90';

	/**
	 * `isAuthConfigured` rather than `isConfigured`: this page needs `authDomain`,
	 * which Firestore does not. Checking only the Firestore values would let a
	 * build with no auth domain through and fail silently at the sign-in button
	 * instead of here.
	 */
	const configured = isAuthConfigured();

	const auth = new AdminSession(createAuthDriver());
	const guests = new GuestList(getGuestListBackend);

	// Start listening only once Firebase is usable. `createAuthDriver()` reaches
	// `getApp()` on its first call, which *rejects* when unconfigured — so on a
	// fresh checkout or the Playwright build this would be an unhandled rejection
	// on mount rather than a page that explains itself.
	$effect(() => {
		if (!configured) return;

		const detach = auth.start();
		void auth.resume();

		return detach;
	});

	// Re-runs constantly, so `sync` only fetches when the account actually
	// changes. See GuestList.sync.
	$effect(() => {
		void guests.sync(auth.user?.uid ?? null);
	});

	/**
	 * Why this exists: a custom claim granted by `scripts/set-admin.mjs` does not
	 * reach an already-issued ID token, so the rules keep refusing somebody who
	 * has been made an admin until the token is discarded. Refresh, then ask
	 * again.
	 */
	async function checkAgain() {
		await auth.refresh();
		await guests.load();
	}

	const t = $derived(guests.totals);
</script>

<svelte:head>
	<title>RSVP dashboard</title>
	<meta name="robots" content="noindex" />

	<link rel="icon" href={favicon} />
</svelte:head>

<!--
	The HTML for this page is public — GitHub Pages has no auth, so `/admin/` is
	fetchable by anyone. It contains no guest data, and every row below is
	authorised by Firestore rules rather than by anything on screen. `noindex`
	and the robots.txt entry keep it out of search results; neither is a control.

	Not wrapped in `Reveal`. That exists to make the invitation an object, and a
	dashboard is not an object.
-->

<main class="min-h-screen bg-ivory px-4 py-10 sm:px-6">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<header class="flex flex-wrap items-baseline justify-between gap-4">
			<div>
				<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
					Private
				</p>
				<h1 class="font-display mt-1 text-2xl text-ink sm:text-3xl">RSVP dashboard</h1>
			</div>

			{#if auth.signedIn}
				<div class="flex items-center gap-3">
					<span class="font-body text-[11px] text-ink/50">{auth.label}</span>
					<button
						type="button"
						onclick={() => auth.signOut()}
						disabled={auth.busy}
						class="rounded-full border border-gold/30 px-4 py-2 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80 disabled:opacity-40"
					>
						Sign out
					</button>
				</div>
			{/if}
		</header>

		{#if !configured}
			<AdminPanel title="Not configured">
				<p class="font-display text-lg text-ink/70">
					This build has no Firebase configuration. Copy <code>.env.example</code> to
					<code>.env</code> and fill in the web config for
					<code>michalemuel-wedding</code> — including
					<code>PUBLIC_FIREBASE_AUTH_DOMAIN</code>, which this page needs and the
					invitation does not.
				</p>
			</AdminPanel>
		{:else if !auth.ready}
			<AdminPanel title="Checking your session">
				<p class="font-display text-lg text-ink/50">One moment.</p>
			</AdminPanel>
		{:else if !auth.user}
			<AdminPanel title="Sign in">
				<p class="font-display text-lg text-ink/70">
					The guest list is only visible to the couple. Sign in with the Google account
					that is on the list.
				</p>

				{#if auth.error}
					<p role="alert" class={ERROR_CLASS}>{auth.error}</p>
				{/if}

				<button type="button" onclick={() => auth.signIn()} disabled={auth.busy} class="{BUTTON_CLASS} mt-6 disabled:opacity-40">
					{auth.busy ? 'Opening…' : 'Sign in with Google'}
				</button>
			</AdminPanel>
		{:else if guests.phase === 'unconfigured'}
			<AdminPanel title="Not configured">
				<p class="font-display text-lg text-ink/70">
					Firebase is configured but Firestore could not be reached.
				</p>
			</AdminPanel>
		{:else if guests.isDenied}
			<AdminPanel title="Not on the admin list">
				<p class="font-display text-lg text-ink/70">
					Signed in as <span class="text-ink">{auth.label}</span>, but this account cannot
					read the guest list.
				</p>
				<p role="alert" class={ERROR_CLASS}>{ACCESS_DENIED}</p>

				<button type="button" onclick={checkAgain} class="{BUTTON_CLASS} mt-6">
					Check again
				</button>
			</AdminPanel>
		{:else if guests.phase === 'failed'}
			<AdminPanel title="Could not load">
				{#if guests.error}
					<p role="alert" class={ERROR_CLASS}>{guests.error}</p>
				{/if}
				<button type="button" onclick={() => guests.load()} class="{BUTTON_CLASS} mt-6">
					Try again
				</button>
			</AdminPanel>
		{:else if guests.phase === 'loading' || guests.phase === 'idle'}
			<AdminPanel title="Loading">
				<p class="font-display text-lg text-ink/50">Fetching the guest list…</p>
			</AdminPanel>
		{:else}
			<!--
				Totals first, because they are the payoff: when this strip agrees with
				the spreadsheet, the seed script, the rules and the arithmetic all
				agree. It is the fastest check available that the data upstream is
				sound.
			-->
			<section class="rounded-2xl border border-gold/20 bg-champagne/20 px-5 py-6">
				<dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
					<AdminStat label="Households" value={t.households} />
					<AdminStat label="Seats invited" value={t.invited} />
					<AdminStat label="Confirmed" value={t.confirmed} accent />
					<AdminStat label="Awaiting reply" value={t.pendingSeats} />
					<AdminStat label="Declined seats" value={t.declinedSeats} />
					<AdminStat label="Seats unfilled" value={t.unfilledSeats} />
				</dl>

				{#if t.archived > 0 || t.overcommitted > 0}
					<ul class="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-gold/20 pt-4">
						{#if t.archived > 0}
							<li class="font-body text-[11px] text-ink/50">
								{t.archived}
								{t.archived === 1 ? 'household' : 'households'} archived
							</li>
						{/if}
						{#if t.overcommitted > 0}
							<li class="font-body text-[11px] text-oxblood">
								{t.overcommitted}
								{t.overcommitted === 1 ? 'household has' : 'households have'} confirmed more
								seats than they were given
							</li>
						{/if}
					</ul>
				{/if}
			</section>

			<div class="overflow-x-auto rounded-2xl border border-gold/20">
				<table class="w-full min-w-[42rem] border-collapse text-left">
					<thead>
						<tr class="border-b border-gold/20">
							{#each ['Household', 'Code', 'Side', 'Seats', 'Confirmed', 'Status'] as column, i (column)}
								<th
									class="px-4 py-3 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase
										{i > 2 && i < 5 ? 'text-right' : ''}"
								>
									{column}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each guests.rows as household (household.code)}
							<tr
								class="border-b border-gold/10 last:border-0 {household.active
									? ''
									: 'opacity-50'}"
							>
								<td class="px-4 py-3 font-body text-sm text-ink">
									{household.householdName}
									{#if household.overcommitted}
										<span
											class="ml-2 rounded-full border border-oxblood/40 px-2 py-0.5 text-[9px] tracking-[0.18em] text-oxblood uppercase"
											title="Confirmed more seats than they were allocated"
										>
											Over
										</span>
									{/if}
									{#if !household.active}
										<span class="ml-2 text-[9px] tracking-[0.18em] text-ink/40 uppercase">
											Archived
										</span>
									{/if}
								</td>
								<td class="px-4 py-3 font-body text-xs tracking-[0.16em] text-ink/60">
									{household.code}
								</td>
								<td class="px-4 py-3 font-body text-xs text-ink/60 capitalize">{household.side}</td>
								<td class="px-4 py-3 text-right font-body text-sm text-ink">
									{household.seatsAllocated}
								</td>
								<td class="px-4 py-3 text-right font-body text-sm text-ink">
									{household.partySize}
								</td>
								<td class="px-4 py-3 font-body text-xs text-ink/60 capitalize">
									{household.status}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<noscript>
			<p class="font-display text-lg text-ink/70">This dashboard needs JavaScript.</p>
		</noscript>

		<footer class="border-t border-gold/20 pt-6">
			<a href="/" class="font-body text-[11px] text-ink/50 underline underline-offset-4">
				Back to the invitation
			</a>
		</footer>
	</div>
</main>