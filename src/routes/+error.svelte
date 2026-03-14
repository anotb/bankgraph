<script lang="ts">
	import { page } from '$app/stores';

	let status = $derived($page.status);
	let message = $derived($page.error?.message);

	let icon = $derived.by(() => {
		if (status === 404) return 'missing';
		if (status === 403) return 'locked';
		return 'error';
	});

	let title = $derived.by(() => {
		if (status === 404) return 'Page not found';
		if (status === 403) return 'Access denied';
		if (status >= 500) return 'Something went wrong';
		return `Error ${status}`;
	});

	let description = $derived.by(() => {
		if (status === 404) return 'The page you\'re looking for doesn\'t exist or has been moved.';
		if (status === 403) return 'You don\'t have permission to access this resource.';
		if (message) return message;
		if (status >= 500) return 'An unexpected error occurred. Please try again later.';
		return 'Something unexpected happened.';
	});
</script>

<svelte:head>
	<title>Error {status} | Bank Data Explorer</title>
</svelte:head>

<div class="flex flex-col items-center justify-center py-20 text-center">
	<div class="rounded-lg bg-[--surface-1] px-10 py-10 max-w-md w-full" role="alert" style="box-shadow: var(--shadow-md)">
		<!-- Icon -->
		<div class="mb-5 text-[--text-disabled]">
			{#if icon === 'missing'}
				<!-- Search/not found icon -->
				<svg class="mx-auto" width="44" height="44" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M21 21l-4.35-4.35" />
					<path d="M8 8l6 6" />
					<path d="M14 8l-6 6" />
				</svg>
			{:else if icon === 'locked'}
				<!-- Lock icon -->
				<svg class="mx-auto" width="44" height="44" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0110 0v4" />
				</svg>
			{:else}
				<!-- Warning triangle -->
				<svg class="mx-auto" width="44" height="44" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
			{/if}
		</div>

		<!-- Status code -->
		<p class="text-[48px] font-semibold text-[--text-primary] data-mono leading-none">
			{status}
		</p>

		<!-- Title -->
		<p class="text-[15px] font-medium text-[--text-primary] mt-2">
			{title}
		</p>

		<!-- Description -->
		<p class="text-[13px] text-[--text-tertiary] mt-1.5 max-w-xs mx-auto leading-relaxed">
			{description}
		</p>

		<!-- Actions -->
		<div class="flex items-center justify-center gap-3 mt-6">
			<button
				onclick={() => history.back()}
				class="inline-flex items-center gap-1.5 rounded-md border border-[--border] bg-[--surface-1] px-4 py-2 text-[13px] font-medium text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-2] transition-colors"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M19 12H5" />
					<path d="M12 19l-7-7 7-7" />
				</svg>
				Go back
			</button>
			<a
				href="/"
				class="inline-flex items-center gap-1.5 rounded-md bg-[--accent] px-4 py-2 text-[13px] font-medium text-white hover:bg-[--accent-hover] transition-colors"
			>
				Go home
			</a>
		</div>
	</div>
</div>
