export const reveal = $state({ opened: false });

export function openInvite() {
	reveal.opened = true;
}

export function resetReveal() {
	reveal.opened = false;
}
