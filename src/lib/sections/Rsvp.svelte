<script lang="ts">
	import Ornament from '$lib/components/Ornament.svelte';
	import { wedding } from '$lib/lib/wedding';
</script>

<section class="bg-champagne/30 px-6 py-24">
	<div class="mx-auto flex max-w-md flex-col items-center text-center">
		<p class="font-body text-[10px] font-medium tracking-[0.34em] text-gold-deep uppercase">RSVP</p>
		<Ornament class="my-6" />
		<p class="font-display text-lg text-ink/70">Kindly respond by {wedding.rsvp.deadline}.</p>
		<form action={wedding.rsvp.endpoint} method="POST" class="mt-8 flex w-full max-w-sm flex-col gap-4">
			<input
				type="text"
				name="name"
				required
				placeholder="Your name"
				class="rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
			/>
			<input
				type="email"
				name="email"
				required
				placeholder="Email"
				class="rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink placeholder:text-ink/40"
			/>
			<select
				name="attending"
				class="rounded-full border border-gold/30 bg-ivory px-5 py-3 font-body text-sm text-ink"
			>
				<option value="yes">Joyfully attending</option>
				<option value="no">Regretfully declines</option>
			</select>
			<button
				type="submit"
				class="rounded-full border border-gold/30 bg-plum px-5 py-3 font-body text-[11px] font-medium tracking-[0.28em] text-champagne uppercase transition hover:opacity-90"
			>
				Send RSVP
			</button>
		</form>
		<p class="mt-6 font-body text-[11px] text-ink/50">
			Or reach us at {wedding.rsvp.contact}
		</p>
	</div>
</section>
