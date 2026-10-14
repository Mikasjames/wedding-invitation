<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { copyText } from './clipboard';
	import { MAX_CUSTOM_MESSAGE, invitationLink, invitationMessage } from '$lib/rsvp/message';
	import type { GuestList } from './guests.svelte';
	import type { AdminRow } from './row';

	interface Props {
		household: AdminRow;
		list: GuestList;
		site: string;

		onclose: () => void;
	}

	let { household, list, site, onclose }: Props = $props();

	/**
	 * A deliberate snapshot of what is stored, not a binding to it.
	 *
	 * `untrack` because the reactivity would be wrong in both directions. Opening
	 * the editor mounts this component fresh, so the initial read is exactly the
	 * stored value; and after a save the list is re-read, replacing `household`
	 * with a new object — which, tracked, would overwrite the couple's draft from
	 * under the cursor while they are still typing in it.
	 */
	let draft = $state(untrack(() => household.customMessage));
	let saved = $state(false);

	/** The textarea itself, so a token can be inserted where the caret is. */
	let textarea = $state<HTMLTextAreaElement>();

	/**
	 * The message as it would be sent, for this household, right now.
	 *
	 * Rendered through the same `invitationMessage` the copy button uses, against
	 * the same values — so the preview cannot be a second opinion. A separate
	 * renderer here would drift, and a preview that lies is worse than none.
	 *
	 * An empty draft previews the shared template, which is the state that means
	 * "go back to the default" and should look like it.
	 */
	const preview = $derived(
		invitationMessage({
			household: household.householdName,
			seats: household.seatsAllocated,
			code: household.code,
			site,
			custom: draft
		})
	);

	const tokens = [
		'{household}',
		'{names}',
		'{deadline}',
		'{link}',
		'{code}',
		'{seats}'
	];

	const remaining = $derived(MAX_CUSTOM_MESSAGE - draft.length);
	const tooLong = $derived(remaining < 0);
	const changed = $derived(draft.trim() !== household.customMessage);

	/**
	 * Whether the couple has written the link themselves.
	 *
	 * Matches `withAccess` in `message.ts` — the same string, the same question.
	 * It drives the sentence below and nothing else, so the worst a drift can do
	 * here is explain itself slightly wrongly.
	 */
	const link = $derived(invitationLink(site, household.code));
	const hasOwnLink = $derived(draft.trim().includes(link));

	function use(token: string) {
		const field = textarea;
		const at = field?.selectionStart ?? draft.length;
		const to = field?.selectionEnd ?? at;

		// Inserted where the caret is, replacing any selection. Setting `draft` to
		// the token itself would wipe whatever they had written, which is the one
		// thing a button labelled `{link}` must never do to a half-finished message.
		draft = draft.slice(0, at) + token + draft.slice(to);
		saved = false;

		// The caret goes to the end of what was just inserted, or the next click
		// lands in the wrong place.
		tick().then(() => field?.setSelectionRange(at + token.length, at + token.length));
	}

	async function save() {
		if (tooLong) return;

		if (await list.setMessage(household.code, draft.trim())) saved = true;
	}

	async function copyPreview() {
		await copyText(preview);
	}

	const LABEL =
		'font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase';
	const FIELD =
		'w-full rounded-2xl border border-gold/30 bg-ivory px-4 py-3 font-body text-sm text-ink placeholder:text-ink/40';
</script>

<!--
	The editor for one household's invitation wording.

	A textarea and a preview, side by side on a desktop and stacked below `sm`,
	because the question being answered is "what will this guest read?" and that
	cannot be answered by looking at a textarea.
-->
<div class="flex flex-col gap-5">
	<div>
		<label class="flex flex-col gap-2">
			<span class={LABEL}>Their invitation, in your own words</span>
			<textarea
				rows="7"
				bind:this={textarea}
				bind:value={draft}
				placeholder={'Hi {household}!\n\nWe would love you there.'}
				class="{FIELD} leading-relaxed"
				aria-invalid={tooLong ? 'true' : undefined}
			></textarea>
		</label>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			<span class={LABEL}>Insert</span>

			{#each tokens as token (token)}
				<button
					type="button"
					onclick={() => use(token)}
					title="Insert {token} where you tap it"
					class="rounded-full border border-gold/30 px-2 py-0.5 font-body text-[10px] tracking-[0.12em] text-gold-deep uppercase transition hover:opacity-80"
				>
					{token}
				</button>
			{/each}
		</div>

		<!--
			Counted down rather than up, and in red once it is over. Firestore would
			accept a megabyte here; this is about the couple's own screen, and about a
			pasted essay being caught before it is stored rather than after.
		-->
		<p
			class="mt-2 font-body text-[11px] {tooLong
				? 'text-oxblood'
				: remaining < 200
					? 'text-ink/50'
					: 'text-ink/40'}"
		>
			{#if tooLong}
				{remaining * -1} characters over the {MAX_CUSTOM_MESSAGE} limit.
			{:else}
				{remaining} characters left.
			{/if}
		</p>
	</div>

	<div>
		<p class={LABEL}>What they will read</p>

		<p
			class="mt-1 rounded-2xl border border-gold/20 bg-ivory px-4 py-3 font-body text-[11px] leading-relaxed whitespace-pre-wrap text-ink/70"
		>
			{preview}
		</p>
	</div>

	<!--
		Said once, here, rather than left to be discovered. The link is re-attached
		automatically when the message omits it, so the couple cannot break the one
		thing that makes the invitation work — but they should know it happens
		rather than finding a line in their message they did not write.
	-->
	<p class="font-body text-[11px] leading-relaxed text-ink/50">
		{#if hasOwnLink}
			Your message includes the link, so nothing has been added to it.
		{:else}
			The link and code are added to the end for you, so nobody receives an invitation
			they cannot open.
		{/if}
	</p>

	{#if list.messageError}
		<p role="alert" class="rounded-full border border-oxblood/30 bg-ivory px-4 py-3 font-body text-[11px] text-ink/70">
			{list.messageError}
		</p>
	{/if}

	{#if saved}
		<p role="status" class="font-body text-[11px] text-forest-700">Saved.</p>
	{/if}

	<div class="flex flex-wrap gap-3">
		<button
			type="button"
			onclick={save}
			disabled={!changed || tooLong || list.savingMessage}
			class="rounded-full border border-gold/30 bg-plum px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90 disabled:opacity-40"
		>
			{list.savingMessage ? 'Saving…' : 'Save'}
		</button>

		<button
			type="button"
			onclick={copyPreview}
			class="rounded-full border border-gold/30 px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
		>
			Copy the preview
		</button>

		<button
			type="button"
			onclick={onclose}
			class="rounded-full border border-gold/30 px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-gold-deep uppercase transition hover:opacity-80"
		>
			Cancel
		</button>
	</div>
</div>