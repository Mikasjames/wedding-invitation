<script lang="ts">
	import { page } from '$app/state';
	import type { AdminRow } from './row';
	import { copyText } from './clipboard';
	import { formatTimestamp } from './format';
	import HouseholdEditor from './HouseholdEditor.svelte';
	import LongText from './LongText.svelte';
	import MessageEditor from './MessageEditor.svelte';
	import type { GuestList } from './guests.svelte';
	import { invitationLink, invitationMessage } from '$lib/rsvp/message';

	interface Props {
		household: AdminRow;

		/**
		 * Only needed to save a message.
		 *
		 * Optional because the panel is also rendered for a list that cannot write —
		 * a stale row, a signed-out dashboard. Requiring the whole `GuestList` just
		 * to show a guest's attendee names would tie reading to writing for no gain.
		 */
		list?: GuestList;
	}

	let { household, list }: Props = $props();

	const SITE = $derived(page.url.origin);

	/**
	 * Which panel the couple is looking at, if any.
	 *
	 * One value rather than a boolean per editor, because the two are mutually
	 * exclusive and independent booleans could both be true — two forms in one
	 * full-width panel, each holding its own draft, and a Save that silently commits
	 * whichever was mounted last.
	 *
	 * A string rather than an enum so the two editors can keep their own names for
	 * what they are, and the `{#if}` reads as the panel it is showing.
	 */
	type Panel = 'none' | 'details' | 'message';

	let panel = $state<Panel>('none');

	const LABEL = 'font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase';
	const MUTED = 'font-body text-[11px] text-ink/50';

	/**
	 * The timestamps, with anything absent dropped.
	 *
	 * A household that has not replied has no `respondedAt`, and a row reading
	 * "Replied —" is furniture that says nothing. Filtering here rather than in
	 * three separate `{#if}`s also means the rule is stated once.
	 */
	const RECORD = $derived(
		[
			{ label: 'Replied', value: formatTimestamp(household.respondedAt) },
			{ label: 'Added', value: formatTimestamp(household.createdAt) },
			{ label: 'Last change', value: formatTimestamp(household.updatedAt) }
		].filter((entry) => entry.value)
	);

	/**
	 * The message this household actually receives — their own wording when they
	 * have any, the shared template otherwise.
	 *
	 * This is what "Copy the message" puts on the clipboard, and the editor's
	 * preview is the same call. Built from the row rather than from a stored copy of
	 * the text, so rewording the template in `wedding.ts` changes the message a
	 * household without a custom one will receive, which is what should happen.
	 */
	const messageText = $derived(
		invitationMessage({
			household: household.householdName,
			seats: household.seatsAllocated,
			code: household.code,
			site: SITE,
			custom: household.customMessage
		})
	);

	/**
	 * From `invitationLink` rather than assembled here, so the link on screen and
	 * the link inside the copied message are the same string by construction.
	 */
	const link = $derived(invitationLink(SITE, household.code));

	type Copyable = 'message' | 'link';

	let copied = $state<Copyable | null>(null);
	let copyFailed = $state(false);

	async function copy(kind: Copyable, text: string) {
		// Cleared first: a second refusal after a success must not leave the
		// earlier "Copied" sitting next to the new failure text.
		copied = null;
		copyFailed = false;

		const ok = await copyText(text);

		copied = ok ? kind : null;
		copyFailed = !ok;
	}

	const ACTION =
		'rounded-full border border-gold/30 px-4 py-2 font-body text-[10px] font-medium tracking-[0.24em] text-gold-deep uppercase transition hover:opacity-80';
</script>

<!--
	Everything `readAdminRow` already loaded and the table had no room for.

	A detail row rather than more columns, because two of these fields have no
	fixed length: a guest's message and the couple's own note can each be a
	sentence or a paragraph, and a column wide enough for the longest one makes
	the whole table unreadable for the ninety-nine rows that have neither. The
	short fields — who is coming, when they replied — are the ones worth
	scanning, and those stay in the row itself.
-->
<div class="flex flex-col gap-5 px-4 py-4">
	{#if panel === 'details' && list}
		<HouseholdEditor {household} {list} onclose={() => (panel = 'none')} />
	{:else if panel === 'message' && list}
		<MessageEditor
			{household}
			{list}
			site={SITE}
			onclose={() => (panel = 'none')}
		/>
	{:else}
		{#if household.customMessage}
			<LongText label="Their invitation, in your own words" text={household.customMessage} />
		{/if}

		{#if household.attendeeNames.length}
			<div>
				<p class={LABEL}>Attending</p>
				<p class="mt-1 font-body text-sm text-ink">{household.attendeeNames.join(', ')}</p>
			</div>
		{/if}

		{#if household.message}
			<LongText label="Their message" text={household.message} />
		{/if}

		{#if household.notes}
			<LongText label="Your notes" text={household.notes} />
		{/if}

		{#if household.contactEmail}
			<div>
				<p class={LABEL}>Email</p>
				<!--
					Never rendered to a guest — `SeededFields.contactEmail` is the couple's
					own reminder list — so a `mailto:` here is safe and is the thing that
					makes the field worth having collected.
				-->
				<a
					href="mailto:{household.contactEmail}"
					class="mt-1 block break-all font-body text-sm text-ink underline underline-offset-4"
				>
					{household.contactEmail}
				</a>
			</div>
		{/if}

		{#if RECORD.length}
			<dl class="flex flex-wrap gap-x-8 gap-y-1 border-t border-gold/20 pt-4">
				{#each RECORD as entry (entry.label)}
					<div class="flex items-baseline gap-2">
						<dt class={MUTED}>{entry.label}</dt>
						<dd class="font-body text-[11px] text-ink">{entry.value}</dd>
					</div>
				{/each}
			</dl>
		{/if}

		<!--
			Recoverable only from here.

			`AddHousehold` shows a message for the household it just created, and that
			receipt is the only place the text has ever existed for a household added
			from a phone — the seed script's `out/links.csv` does not cover one, and
			closing the receipt loses it permanently. Both the link and the message are
			rebuilt from the row, which is why `invitationMessage` needs nothing here
			that `AdminRow` does not already carry.
		-->
		<div class="flex flex-wrap gap-3 border-t border-gold/20 pt-4">
			<button
				type="button"
				onclick={() => copy('message', messageText)}
				class={ACTION}
				aria-label="Copy the invitation message for {household.householdName}"
			>
				{copied === 'message' ? 'Message copied' : 'Copy the message'}
			</button>

			<button
				type="button"
				onclick={() => copy('link', link)}
				class={ACTION}
				aria-label="Copy the invitation link for {household.householdName}"
			>
				{copied === 'link' ? 'Link copied' : 'Copy the link'}
			</button>

			<!--
				Gated on `list`, because without one there is nowhere to save. The
				deployed rules scope the admin arm of `allow update` to the owner
				fields and `updatedAt`, so these writes are permitted — but a refusal
				is still possible if that list and `GuestListBackend` ever diverge. See
				`AdminWriteRefusedError`.

				"Send this back to the shared template" is only offered where there is
				a custom message to revert, which is what the label checks: with none
				set, clearing the box would be indistinguishable from having never
				opened it.
			-->
			{#if list}
				<button
					type="button"
					onclick={() => (panel = 'details')}
					class={ACTION}
					aria-label="Edit {household.householdName}"
				>
					Edit household
				</button>

				<button
					type="button"
					onclick={() => (panel = 'message')}
					class={ACTION}
					aria-label="Write a different invitation for {household.householdName}"
				>
					{household.customMessage ? 'Rewrite their invitation' : 'Write their invitation'}
				</button>
			{/if}

			<p class="flex basis-full break-all font-body text-[11px] text-ink/50">
				{link}
			</p>

			{#if copyFailed}
				<p role="status" class={MUTED}>
					Your browser would not let us copy it. Select the text instead.
				</p>
			{/if}
		</div>
	{/if}
</div>