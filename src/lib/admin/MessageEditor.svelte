<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { copyText } from './clipboard';
	import { MAX_CUSTOM_MESSAGE, customMessageFrom, invitationLink, invitationMessage } from '$lib/rsvp/message';
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
	 * What this household receives when nobody has customised anything — the shared
	 * template, rendered for them.
	 *
	 * Compared against the draft below, not merely shown in the preview. That
	 * comparison is what keeps "unedited" meaningful: see `customMessageFrom`.
	 */
	const template = $derived(
		invitationMessage({
			household: household.householdName,
			seats: household.seatsAllocated,
			code: household.code,
			site
		})
	);

	/**
	 * Starts from the stored wording, or from the standard message when there is
	 * none — so the couple edits real words rather than retyping them out of a
	 * preview beside them.
	 *
	 * `untrack` for the same reason the snapshot had, and it now has to cover both
	 * reads: after a save the list is re-read, which replaces `household` with a
	 * new object, and tracked that would overwrite the draft from under the cursor
	 * while they are still typing in it. It reads `household.customMessage` first
	 * on purpose, so a household that *does* have its own wording opens on that
	 * rather than on text we would then have to compare it away from.
	 */
	let draft = $state(untrack(() => household.customMessage || template));
	/**
	 * A save announcement, withdrawn by anything that makes it untrue.
	 *
	 * On `input` as well as in `use()`: the token buttons were clearing it, and
	 * typing did not, so "Saved." sat on screen next to a half-rewritten message
	 * that had never been saved. The indicator is only ever true for the instant
	 * between a completed write and the next keystroke, which is what it is
	 * for.
	 */
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
		'{seats}',
		'{weddingDate}',
		'{weddingCeremony}',
		'{weddingReception}',
		'{weddingCeremonyTime}',
		'{weddingReceptionTime}'
	];

	const remaining = $derived(MAX_CUSTOM_MESSAGE - draft.length);
	const tooLong = $derived(remaining < 0);

	/** Whether the couple has moved anything off the standard wording. */
	const differs = $derived(draft.trim() !== template.trim());

	/**
	 * What a save would actually write. Blank when the draft is still the standard
	 * wording, which is the whole reason this is computed here rather than saved
	 * from the textarea directly.
	 */
	const value = $derived(
		customMessageFrom(draft, {
			household: household.householdName,
			seats: household.seatsAllocated,
			code: household.code,
			site
		})
	);

	const changed = $derived(value !== household.customMessage);

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

		if (await list.setMessage(household.code, value)) saved = true;
	}

	async function copyPreview() {
		await copyText(preview);
	}

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
			<span class="form-label">Their invitation, in your own words</span>
			<textarea
				rows="7"
				bind:this={textarea}
				bind:value={draft}
				oninput={() => (saved = false)}
				placeholder={'Hi {household}!\n\nWe would love you there.'}
				class="{FIELD} leading-relaxed"
				aria-invalid={tooLong ? 'true' : undefined}
			></textarea>
		</label>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			<span class="form-label">Insert</span>

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
			Two states, not one. Over the limit always shows, because it blocks the
			save and hiding a blocking message is how a 2,000-character limit gets
			discovered at the Firestore instead.

			The countdown only appears once the draft has moved off the standard
			wording. Otherwise a pre-filled textarea opens reading "1,970 characters
			left" for a message the couple has not written a word of, which looks like
			they already have.
		-->
		{#if tooLong}
			<p class="mt-2 font-body text-[11px] text-oxblood">
				{remaining * -1} characters over the {MAX_CUSTOM_MESSAGE} limit.
			</p>
		{:else if differs}
			<p class="mt-2 font-body text-[11px] {remaining < 200 ? 'text-ink/50' : 'text-ink/40'}">
				{remaining} characters left.
			</p>
		{/if}
	</div>

	<div>
		<p class="form-label">What they will read</p>

		<p
			class="rounded-2xl border border-gold/20 bg-ivory px-4 py-3 font-body text-[11px] leading-relaxed whitespace-pre-wrap text-ink/70"
		>
			{preview}
		</p>
	</div>

	<!--
			Explains the state the textarea opens in. Without it, a pre-filled box
			looks like the couple's own wording has already been written and saved,
			when in fact it is the shared template shown for editing.

			The link sentence is conditional on `differs` for the opposite reason: the
			standard wording already contains the link, so telling them "the link is
			added for you" about a message they did not write would be wrong.
		-->
	{#if !differs}
		<p class="font-body text-[11px] leading-relaxed text-ink/50">
			This is the standard message. Change anything above and it becomes this
			household's own; leave it as it is and they keep receiving whatever you
			write in <code class="text-ink/70">wedding.rsvp.invitation</code>.
		</p>
	{:else}
		<p class="font-body text-[11px] leading-relaxed text-ink/50">
			{#if hasOwnLink}
				Your message includes the link, so nothing has been added to it.
			{:else}
				The link and code are added to the end for you, so nobody receives an
				invitation they cannot open.
			{/if}
		</p>
	{/if}

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