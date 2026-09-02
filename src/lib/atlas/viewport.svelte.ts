import { browser } from '$app/environment';

/** Presentational breakpoints, so views can choose one focused representation on phones. */
class Viewport {
	width = $state(browser ? window.innerWidth : 1366);
	constructor() {
		if (!browser) return;
		window.addEventListener('resize', () => { this.width = window.innerWidth; }, { passive: true });
	}
	get narrow(): boolean { return this.width <= 640; }
	get tablet(): boolean { return this.width <= 1024; }
}

export const viewport = new Viewport();
