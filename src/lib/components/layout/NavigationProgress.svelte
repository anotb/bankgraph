<script lang="ts">
	import { navigating } from '$app/stores';

	let visible = $state(false);
	let width = $state(0);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let crawlTimer: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		const nav = $navigating;

		clearTimeout(hideTimer);
		clearInterval(crawlTimer);

		if (nav) {
			// Navigation started
			visible = true;
			width = 0;

			// Quick jump to ~15%, then animate to 80%
			requestAnimationFrame(() => {
				width = 15;
				setTimeout(() => {
					width = 80;
				}, 50);
			});

			// Slow crawl from 80% toward 95% while still loading
			crawlTimer = setInterval(() => {
				if (width >= 95) {
					clearInterval(crawlTimer);
					return;
				}
				width += (95 - width) * 0.1;
			}, 500);
		} else if (visible) {
			// Navigation complete
			clearInterval(crawlTimer);
			width = 100;

			hideTimer = setTimeout(() => {
				visible = false;
				width = 0;
			}, 200);
		}

		return () => {
			clearTimeout(hideTimer);
			clearInterval(crawlTimer);
		};
	});
</script>

{#if visible}
	<div
		class="nav-progress"
		style:transform={`scaleX(${width / 100})`}
		style:opacity={width === 100 ? 0 : 1}
		role="progressbar"
		aria-valuenow={Math.round(width)}
		aria-valuemin={0}
		aria-valuemax={100}
	></div>
{/if}

<style>
	.nav-progress {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 2px;
		background: var(--accent);
		z-index: 9999;
		transform-origin: left center;
		transition: transform 0.3s ease, opacity 0.2s ease;
		box-shadow: 0 0 6px var(--accent);
	}
</style>
