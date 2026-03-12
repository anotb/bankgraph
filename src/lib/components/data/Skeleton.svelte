<script lang="ts">
	let {
		width = '100%',
		height = '1em',
		rounded = true
	}: {
		width?: string;
		height?: string;
		rounded?: boolean;
	} = $props();
</script>

<div
	class="skeleton {rounded ? 'rounded' : ''}"
	style:width
	style:height
	aria-hidden="true"
></div>

<style>
	.skeleton {
		background: linear-gradient(
			90deg,
			var(--surface-2) 25%,
			var(--surface-3) 50%,
			var(--surface-2) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
</style>
