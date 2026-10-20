<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import AddHousehold from '$lib/admin/AddHousehold.svelte';
	import AdminPanel from '$lib/admin/AdminPanel.svelte';
	import AdminStat from '$lib/admin/AdminStat.svelte';
	import HouseholdBadges from '$lib/admin/HouseholdBadges.svelte';
	import HouseholdCard from '$lib/admin/HouseholdCard.svelte';
	import HouseholdDetail from '$lib/admin/HouseholdDetail.svelte';
	import { AdminSession } from '$lib/admin/auth.svelte';
	import { capacityStanding } from '$lib/admin/capacity';
	import { downloadCsv } from '$lib/admin/download';
	import { GuestList } from '$lib/admin/guests.svelte';
	import {
		FILTERS,
		type Filter,
		type SortKey,
		countsFor,
		visibleRows
	} from '$lib/admin/table';
	import { ACCESS_DENIED } from '$lib/admin/guests.driver';
	import type { Side } from '$lib/rsvp/types';
	import { isAuthConfigured } from '$lib/firebase/app';
	import { createAuthDriver } from '$lib/firebase/admin-auth.client';
	import { getGuestListBackend } from '$lib/firebase/admin-guests.client';
	import { wedding } from '$lib/lib/wedding';

	const ERROR_CLASS =
		'mt-6 w-full rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] leading-relaxed text-ink/70';

	const BUTTON_CLASS =
		'rounded-full border border-gold/30 bg-plum px-6 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90';

	const SIDE_LABEL: Record<Side, string> = { bride: 'Bride', groom: 'Groom', both: 'Both' };

	/**
	 * Alignment declared per column, rather than derived from the index.
	 *
	 * This was `i > 2 && i < 5`, which is right for exactly six columns in
	 * exactly this order and silently wrong the moment a column is added — a
	 * header stops lining up with its figures and nothing fails a build. A column
	 * that says where its own numbers go cannot do that.
	 */
	const COLUMNS: ReadonlyArray<{ label: string; align?: 'right'; sort?: SortKey }> = [
		{ label: 'Household', sort: 'household' },
		{ label: 'Code', sort: 'code' },
		{ label: 'Side' },
		{ label: 'Seats', align: 'right', sort: 'seats' },
		{ label: 'Confirmed', align: 'right', sort: 'confirmed' },
		{ label: 'Status' }
	];

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
	 * Signing out has to close this too. The form holds a household being typed,
	 * and a dashboard left open on a shared laptop should not leave one on screen.
	 */
	$effect(() => {
		if (!auth.signedIn) {
			adding = false;

			// `guests.clear()` already drops the rows, but leaving a code expanded
			// would mean the next person to sign in lands on a detail panel for a
			// household that is no longer on screen.
			expandedCode = null;
		}
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

	/**
	 * How the list stands against the number of guests the couple is planning
	 * for, or `null` when `wedding.ts` sets no target.
	 *
	 * The six figures below say how many seats exist in each state. This says
	 * whether the list fits the room, which is a different question and the one
	 * that has to be answered before the invitations go out.
	 */
	const capacity = $derived(capacityStanding(t, wedding.guestCapacity));

	/**
	 * The sides with households in them.
	 *
	 * `both` is the default on the add form, so a couple who never picked a side
	 * has every household in `both` — and two empty tiles for bride and groom
	 * beside them is noise rather than information. The strip is also skipped
	 * entirely for a single side, which the overall figures above already say.
	 */
	const sidesInUse = $derived(
		(['bride', 'groom', 'both'] as const).filter((side) => t.bySide[side].households > 0)
	);

	let adding = $state(false);

	/**
	 * The one household whose detail is open, or `null`.
	 *
	 * A single code rather than a `Set`. The detail is a full-width panel, two of
	 * them open at once is a page of noise, and one at a time is the only shape
	 * that still means something after a refresh or a rotation — which is why the
	 * page owns this rather than each row keeping its own flag.
	 */
	let expandedCode = $state<string | null>(null);

	function toggle(code: string) {
		expandedCode = expandedCode === code ? null : code;
	}

	// --- Finding a household -------------------------------------------------
	//
	// Plain component state rather than anything on `GuestList`. These narrow what
	// is on screen; they do not change what the server holds, and the totals strip
	// above is deliberately left showing the whole list so the figures and the
	// number of rows on screen never quietly disagree about which is which.

	let query = $state('');
	let filter = $state<Filter>('all');
	let sort = $state<SortKey>('household');
	let direction = $state<'asc' | 'desc'>('asc');

	/** One answer for both renderings — see `visibleRows`. */
	const shown = $derived(visibleRows(guests.rows, { query, filter, sort, direction }));

	/** Faceted on the query, ignoring the filter, so the chips describe what was typed. */
	const counts = $derived(countsFor(guests.rows, query));

	/** The whole list is empty, as opposed to nothing matching what was asked for. */
	const listIsEmpty = $derived(guests.rows.length === 0);

	const narrowing = $derived(!listIsEmpty && (query.trim() !== '' || filter !== 'all'));

	function sortBy(key: SortKey) {
		// Same column again flips it; a new column starts ascending, except for
		// confirmed heads and last change, where the useful first click is
		// "biggest" and "most recent" rather than "smallest" and "longest ago".
		if (sort === key) direction = direction === 'asc' ? 'desc' : 'asc';
		else {
			sort = key;
			direction = key === 'confirmed' || key === 'responded' ? 'desc' : 'asc';
		}
	}

	function clearFilters() {
		query = '';
		filter = 'all';
	}

	const CHIP_LABEL: Record<Filter, string> = {
		all: 'All',
		awaiting: 'Awaiting',
		attending: 'Attending',
		declined: 'Declined',
		archived: 'Archived',
		over: 'Over'
	};
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
				<!--
					Above the figures rather than below them, because it is the only
					wrong thing on this page that is wrong because of this repo rather
					than because of Firestore. `booksBalance` holds for any input, so a
					false result means the arithmetic in `totals.ts` was edited badly —
					and the six numbers underneath are what the couple orders catering
					against.
				-->
				{#if !guests.balanced}
					<p
						role="alert"
						class="mb-5 rounded-full border border-oxblood/30 bg-ivory px-5 py-3 font-body text-[11px] leading-relaxed text-ink/70"
					>
						These figures do not add up, which means the dashboard's own arithmetic is
						wrong rather than the guest list. The numbers below should not be relied on.
					</p>
				{/if}

				<dl class="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
					<AdminStat label="Households" value={t.households} />
					<AdminStat label="Seats invited" value={t.invited} />
					<AdminStat label="Confirmed" value={t.confirmed} accent />
					<AdminStat label="Awaiting reply" value={t.pendingSeats} />
					<AdminStat label="Declined seats" value={t.declinedSeats} />
					<AdminStat label="Seats unfilled" value={t.unfilledSeats} />
				</dl>

				<!--
					Not a seventh stat. The six figures above are counts of seats in
					each state; this is a comparison against a planning target, and a
					number on the same line would invite being read as one more count.

					The target is `wedding.guestCapacity`, so it is edited in the same
					place as every other wedding fact rather than hidden in here.
				-->
				{#if capacity}
					<div class="mt-5 border-t border-gold/20 pt-4">
						<p class="font-body text-[11px] text-ink/60">
							<span class="text-ink">{capacity.confirmed}</span>
							of {capacity.target} confirmed
							{#if capacity.remaining > 0}
								· <span class="text-ink">{capacity.remaining}</span>
								{capacity.remaining === 1 ? 'guest' : 'guests'} to go
							{:else if capacity.confirmedOver > 0}
								· <span class="text-oxblood">{capacity.confirmedOver} over target</span>
							{/if}
						</p>

						<!--
							Only while the target is still intact. Once confirmed heads
							are already over it, the line above says so and this would
							repeat it in longer words.

							`fullHouse` rather than the seats invited: a decline releases
							its seats, and a family that comes with two of its five
							releases the other three. Warning about those would be an
							alarm about people who are not coming.
						-->
						{#if capacity.fullHouseOver > 0 && capacity.confirmedOver === 0}
							<p class="mt-2 font-body text-[11px] text-ink/60">
								If every household still to answer fills its seats, that is
								<span class="text-oxblood">{capacity.fullHouse}</span> —
								{capacity.fullHouseOver} over the target.
							</p>
						{/if}
					</div>
				{/if}

				<!--
					Only when a split actually exists. One side on its own is already
					the figure above, restated.
				-->
				{#if sidesInUse.length > 1}
					<dl class="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-gold/20 pt-5 sm:grid-cols-3">
						{#each sidesInUse as side (side)}
							<div>
								<dt class="form-label">{SIDE_LABEL[side]}</dt>
								<dd class="font-body text-sm text-ink">
									{t.bySide[side].households}
									{t.bySide[side].households === 1 ? 'household' : 'households'},
									{t.bySide[side].confirmed} of {t.bySide[side].invited} seats
								</dd>
							</div>
						{/each}
					</dl>
				{/if}

				{#if guests.outstanding.households > 0 || t.archived > 0 || t.overcommitted > 0}
					<div class="mt-6 border-t border-gold/20 pt-4">
						<!--
							First in the footer because it is the reason the dashboard gets
							opened. `outstanding` already drops archived and declined rows,
							so every household counted here is one somebody has to chase.
						-->
						{#if guests.outstanding.households > 0}
							<p class="font-body text-[11px] text-ink/70">
								<span class="text-ink">{guests.outstanding.households}</span>
								{guests.outstanding.households === 1 ? 'household has' : 'households have'} not
								answered yet, with
								<span class="text-ink">{guests.outstanding.seats}</span>
								{guests.outstanding.seats === 1 ? 'seat' : 'seats'} still unaccounted for.
							</p>
						{/if}

						{#if t.archived > 0 || t.overcommitted > 0}
							<ul
								class="flex flex-wrap gap-x-6 gap-y-2 {guests.outstanding.households > 0
									? 'mt-3'
									: ''}"
							>
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
					</div>
				{/if}
			</section>

			<!--
				Shown instead of demoting the page when the refresh that follows a create
				fails. The household exists and its code is on the receipt above; only the
				list is behind, and saying so beats replacing a working dashboard with
				"Could not load".
			-->
			{#if guests.refreshError}
				<!--
					Branches on whether there is a receipt on screen. The create wording is
					load-bearing — it is what stops a household existing in Firestore while
					the couple are shown no code for it — so it stays exactly as it was, and
					the refresh button gets its own sentence rather than inheriting one
					about a household that was never added.
				-->
				<p role="status" class={ERROR_CLASS}>
					{guests.lastCreated
						? 'That household was added, but the list could not be refreshed, so it may be missing below.'
						: 'The list could not be refreshed, so it may be out of date.'}
					{guests.refreshError}
				</p>
			{/if}

			{#if adding}
				<AddHousehold list={guests} onclose={() => (adding = false)} />
			{:else}
				<div class="flex flex-wrap justify-end gap-3">
					<!--
						`toCsv` and its round-trip tests have existed since the dashboard
						did, with no button anywhere. The export is the whole record —
						names, messages, the couple's own notes — for the caterer and for a
						backup, and on a phone it is the one thing here that can be handed
						to somebody else.
					-->
					<button
						type="button"
						onclick={() => downloadCsv(guests.rows)}
						disabled={guests.rows.length === 0}
						class="{BUTTON_CLASS} w-full disabled:opacity-40 sm:w-auto"
					>
						Export CSV
					</button>

					<button
						type="button"
						onclick={() => (adding = true)}
						class="{BUTTON_CLASS} w-full sm:w-auto"
					>
						Add a household
					</button>
				</div>
			{/if}

			<!--
				Finding a household.

				There was no way to search, narrow or reorder any of this. `sortRows`
				fixed the order as active-then-name and there was nothing else, which
				against the few hundred rows `GuestList` already anticipates means a
				couple cannot find one household without reading every line.

				No debounce on the box: a few hundred rows times four `toLowerCase`
				calls per keystroke is nothing, and debouncing would make the list feel
				laggy to buy nothing.
			-->
			<section class="flex flex-col gap-3">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<label class="flex-1">
						<span class="sr-only">Search households</span>
						<input
							type="search"
							bind:value={query}
							placeholder="Search a name, a code or an email"
							class="w-full rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
						/>
					</label>

					<!--
						`refresh()` rather than `load()`, which sets `phase = 'loading'`
						and unmounts the branch — taking an open invitation editor and
						everything typed into it with it. This leaves the rows, the
						search box and the filter where they were, which is also why
						there is no state to restore after a refresh.
					-->
					<button
						type="button"
						onclick={() => guests.refresh()}
						disabled={guests.refreshing}
						class="shrink-0 rounded-full border border-gold/30 px-5 py-3 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80 disabled:opacity-40"
					>
						{guests.refreshing ? 'Refreshing' : 'Refresh'}
					</button>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#each FILTERS as chip (chip)}
						<button
							type="button"
							onclick={() => (filter = chip)}
							aria-pressed={filter === chip}
							class="rounded-full border px-3 py-1.5 font-body text-[10px] tracking-[0.18em] uppercase transition
								{filter === chip
								? 'border-plum bg-plum text-champagne'
								: 'border-gold/30 text-ink/60 hover:opacity-80'}"
						>
							{CHIP_LABEL[chip]}
							<span class="opacity-70">{counts[chip]}</span>
						</button>
					{/each}
				</div>

				<p class="font-body text-[11px] text-ink/50" aria-live="polite">
					{#if listIsEmpty}
						Nothing on the list yet.
					{:else if shown.length === guests.rows.length}
						Showing all {guests.rows.length}
						{guests.rows.length === 1 ? 'household' : 'households'}.
					{:else}
						Showing {shown.length} of {guests.rows.length}
						{guests.rows.length === 1 ? 'household' : 'households'}.
					{/if}
				</p>
			</section>

			<!--
				Two renderings of the same rows, split at `sm`.

				`AddHousehold` says outright that it is built for a phone — "we
				forgot Auntie" is typed from a phone — while the table beside it was
				`min-w-[42rem]` of sideways scroll, and gets wider as detail is added
				to it. A couple who adds a household from the sofa and then has to
				scroll sideways to read what they just added has it backwards.

				Both are always in the DOM and one is hidden by CSS, so their
				element ids are prefixed apart — `card-detail-` and `detail-` — or
				`aria-controls` would point at one of two elements sharing an id.
			-->
			<!--
				An empty table is a worse answer than a sentence. Every sign-in that
				can read the collection and finds nothing is a real state — a
				project seeded and then emptied, or the wrong database — and the
				dashboard should say so rather than presenting six zeroes and a
				header.
			-->
			{#if listIsEmpty}
				<p class="rounded-2xl border border-gold/20 px-5 py-8 text-center font-display text-lg text-ink/50">
					No households on the list yet. Add one above, or seed the list from a
					spreadsheet.
				</p>
			{:else if shown.length === 0}
				<!--
					Its own message, because it has the same shape as an empty list and means the
					opposite. A filter matching nothing would otherwise read as data loss, which
					is the one thing a narrowing control must never look like.
				-->
				<div class="rounded-2xl border border-gold/20 px-5 py-8 text-center">
					<p class="font-display text-lg text-ink/50">
						No households match{query.trim() ? ` “${query.trim()}”` : ''}.
					</p>

					{#if narrowing}
						<button
							type="button"
							onclick={clearFilters}
							class="mt-4 rounded-full border border-gold/30 px-5 py-3 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
						>
							Show the whole list
						</button>
					{/if}
				</div>
			{:else}
				<ul class="divide-y divide-gold/10 rounded-2xl border border-gold/20 sm:hidden">
					{#each shown as household (household.code)}
						<HouseholdCard
							{household}
							list={guests}
							expanded={expandedCode === household.code}
							ontoggle={() => toggle(household.code)}
						/>
					{/each}
				</ul>

				<div class="hidden overflow-x-auto rounded-2xl border border-gold/20 sm:block">
					<table class="w-full min-w-[42rem] border-collapse text-left">
						<caption class="sr-only">
							Every household on the guest list. Select a household's name to see who is
							attending, any message left for the couple, and the invitation link.
						</caption>
						<thead>
							<tr class="border-b border-gold/20">
								{#each COLUMNS as column (column.label)}
									<th
										scope="col"
										aria-sort={column.sort && sort === column.sort
											? direction === 'asc'
												? 'ascending'
												: 'descending'
											: undefined}
										class="px-4 py-3 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase
											{column.align === 'right' ? 'text-right' : ''}"
									>
										{#if column.sort}
											{@const key = column.sort}
											<!--
												A button rather than an `onclick` on the `<th>`, so sorting is reachable
												from the keyboard and `aria-sort` can report it. Clicking a heading is
												otherwise a decoration on a heading.
											-->
											<button
												type="button"
												onclick={() => sortBy(key)}
												class="inline-flex items-center gap-1 uppercase transition hover:opacity-80"
											>
												{column.label}
												<span aria-hidden="true" class="text-[8px]">
													{sort === column.sort ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
												</span>
											</button>
										{:else}
											{column.label}
										{/if}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<!--
								A row and its detail are both emitted per household rather than
								split into two loops, so the detail cannot drift out of sync with
								the row above it. `border-b-0` while open keeps the pair joined
								instead of drawing a line through the middle of one household.
							-->
							{#each shown as household (household.code)}
								{@const open = expandedCode === household.code}
								<tr
									class="border-b border-gold/10 {open
										? 'border-b-0'
										: 'last:border-0'} {household.active ? '' : 'opacity-50'}"
								>
									<td class="px-4 py-3 font-body text-sm text-ink">
										<button
											type="button"
											onclick={() => toggle(household.code)}
											aria-expanded={open}
											aria-controls="detail-{household.code}"
											class="text-left underline-offset-4 hover:underline"
										>
											{household.householdName}
										</button>
										<HouseholdBadges {household} />
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

								{#if open}
									<tr id="detail-{household.code}" class="last:border-0">
										<td colspan={COLUMNS.length} class="px-0 pb-4">
											<HouseholdDetail {household} list={guests} />
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
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