import { browser } from '$app/environment';

export type ScrollRevealOptions = {
	threshold?: number;
	rootMargin?: string;
	once?: boolean;
	delay?: number;
	/** Animation variant: 'up' (default), 'fade', 'scale', 'left', 'right' */
	variant?: 'up' | 'fade' | 'scale' | 'left' | 'right';
};

export function scrollReveal(node: HTMLElement, options: ScrollRevealOptions = {}) {
	if (!browser) return;

	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduced) {
		node.classList.add('revealed');
		return;
	}

	const variant = options.variant ?? 'up';
	node.classList.add('scroll-reveal', `scroll-reveal--${variant}`);
	if (options.delay) node.style.setProperty('--reveal-delay', `${options.delay}ms`);

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					node.classList.add('revealed');
					if (options.once !== false) observer.unobserve(node);
				} else if (options.once === false) {
					node.classList.remove('revealed');
				}
			});
		},
		{
			threshold: options.threshold ?? 0.12,
			rootMargin: options.rootMargin ?? '0px 0px -60px 0px'
		}
	);

	observer.observe(node);

	return {
		update(next: ScrollRevealOptions) {
			if (next.delay !== undefined) {
				node.style.setProperty('--reveal-delay', `${next.delay}ms`);
			}
		},
		destroy() {
			observer.disconnect();
		}
	};
}
