<script lang="ts">
	interface Props {
		label: string;
		text: string;
	}

	let { label, text }: Props = $props();

	let el = $state<HTMLElement>();
	let expanded = $state(false);
	let overflows = $state(false);

	/**
	 * Whether the clamped text is actually taller than three lines.
	 *
	 * Measured rather than guessed from a character count, because the thing that
	 * decides it is how the text wraps at the width it is being read at — which
	 * changes with the window, the device, and the label beside it.
	 *
	 * Re-runs on the text, and on any resize via the observer. The `expanded`
	 * guard is load-bearing rather than an optimisation: removing the clamp is
	 * precisely what makes the text stop overflowing, so measuring while open
	 * would report "fits", hide the button, and strand the reader halfway down a
	 * message with no way back.
	 *
	 * The one-pixel tolerance absorbs sub-pixel layout rounding, which otherwise
	 * makes a box exactly three lines tall report a pixel of overflow and show a
	 * "Show more" that reveals nothing.
	 */
	$effect(() => {
		void text;

		// Held in a local so the closure below does not have to re-narrow `el`, and
		// so the observer watches the node this run measured rather than whatever the
		// binding holds by the time the callback fires.
		const node = el;

		if (!node || expanded) return;

		const fits = () => {
			overflows = node.scrollHeight > node.clientHeight + 1;

			// Text that now fits — narrower window, shorter message — must not leave
			// the reader stuck in an expanded block with a button that does nothing.
			if (!overflows) expanded = false;
		};

		fits();

		const observer = new ResizeObserver(fits);

		observer.observe(node);

		return () => observer.disconnect();
	});
</script>

<!--
	A block of writing that can be any length, shown at three lines until asked
	for otherwise.

	Not a `<details>`. The household panel is opened for one household, so
	hiding the content means the person who opened it to read the message has to
	click first — with nothing gained, because there is no list here to be
	scanning past. Clamping keeps the opening line visible, which is usually
	enough to confirm which message it is, and bounds the height so the attendee
	names, the guest's reply and the copy buttons below stay reachable.

	Three fields use this: the couple's own invitation wording, the note the
	guest left back, and the couple's notes. All three are free text with a
	2,000 character ceiling and none has a fixed length, so treating one of them
	as the problem would leave two identical ones behind it.

	Expanded text is not given a maximum height with its own scrollbar. Nested
	scrolling is worse than a long block on a phone, and someone who asked to
	read the whole message wants the whole message.
-->
<div>
	<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">
		{label}
	</p>

	<!--
		`pre-wrap` rather than `pre`, because these are the couple's and the guest's
		own words and their line breaks are theirs. Combined with `line-clamp` it
		still clamps, which is worth keeping an eye on — `pre-wrap` allows a long
		unbroken run to overflow rather than wrap, and there is no such run in
		prose. `break-words` underneath covers the pasted-URL case.
	-->
	<p
		bind:this={el}
		class="mt-1 font-body text-sm leading-relaxed break-words whitespace-pre-wrap text-ink {expanded
			? ''
			: 'line-clamp-3'}"
	>
		{text}
	</p>

	{#if overflows}
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			class="mt-1 font-body text-[10px] font-medium tracking-[0.28em] text-gold-deep uppercase underline underline-offset-4 transition hover:opacity-80"
		>
			{expanded ? 'Show less' : 'Show more'}
		</button>
	{/if}
</div>