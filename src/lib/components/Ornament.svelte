<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div class="flex items-center justify-center gap-3 {className}" aria-hidden="true">
	<span class="h-px w-10 bg-gradient-to-r from-transparent to-gold/50"></span>
	<svg viewBox="0 0 12 12" class="h-2 w-2 text-gold" fill="currentColor">
		<path d="M6 0l1.4 4.6L12 6l-4.6 1.4L6 12l-1.4-4.6L0 6l4.6-1.4L6 0Z" />
	</svg>
	<span class="h-px w-10 bg-gradient-to-l from-transparent to-gold/50"></span>
</div>
