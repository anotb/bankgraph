<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { Institution } from '$lib/types';
	import { formatCurrency } from '$lib/utils/formatters.js';

	type NavItem = {
		kind: 'nav';
		label: string;
		href: string;
		hint: string;
		shortcut?: string;
	};

	type BankItem = {
		kind: 'bank';
		label: string;
		hint: string;
		cert: number;
		state: string | null;
		assets: number | null;
	};

	type Item = NavItem | BankItem;

	const NAV: NavItem[] = [
		{ kind: 'nav', label: 'Browse all banks', href: '/banks', hint: 'Filter by state, asset size, or status', shortcut: 'G B' },
		{ kind: 'nav', label: 'Industry overview', href: '/industry', hint: 'Aggregate medians, distributions, segments', shortcut: 'G I' },
		{ kind: 'nav', label: 'Compare banks', href: '/compare', hint: 'Multi-bank side-by-side analysis', shortcut: 'G C' },
		{ kind: 'nav', label: 'Macro context', href: '/macro', hint: 'Agency rates, labor, prices, H.8 bank conditions', shortcut: 'G M' },
		{ kind: 'nav', label: 'Bank failures', href: '/industry/failures', hint: 'Full failure history with filters' },
		{ kind: 'nav', label: 'Glossary', href: '/glossary', hint: 'Metric definitions, MDRM codes' }
	];

	let open = $state(false);
	let query = $state('');
	let highlighted = $state(0);
	let bankResults = $state<Institution[]>([]);
	let loading = $state(false);
	let inputEl = $state<HTMLInputElement | undefined>();
	let fetchTimer: ReturnType<typeof setTimeout> | undefined;
	// Element focused before the palette opened — focus returns here on close.
	let triggerEl: HTMLElement | null = null;

	export function show() {
		if (browser) triggerEl = document.activeElement as HTMLElement | null;
		open = true;
		query = '';
		highlighted = 0;
		bankResults = [];
		setTimeout(() => inputEl?.focus(), 30);
	}

	export function hide() {
		open = false;
		clearTimeout(fetchTimer);
		loading = false;
		// Restore focus to the trigger so keyboard users aren't dropped at the top of the page.
		triggerEl?.focus?.();
		triggerEl = null;
	}

	function isMac(): boolean {
		if (!browser) return false;
		return /Mac|iPhone|iPad/.test(navigator.platform);
	}

	let modKeyLabel = $derived(isMac() ? '⌘' : 'Ctrl');

	$effect(() => {
		if (!browser) return;
		const handler = (e: KeyboardEvent) => {
			const mod = isMac() ? e.metaKey : e.ctrlKey;
			if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
				const target = e.target as HTMLElement | null;
				const tag = target?.tagName;
				// Don't capture when the user is typing in a form field unless palette is already open
				if (!open && (tag === 'INPUT' || tag === 'TEXTAREA') && target?.getAttribute('type') !== 'search') {
					return;
				}
				e.preventDefault();
				if (open) hide(); else show();
			} else if (e.key === 'Escape' && open) {
				e.preventDefault();
				hide();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	// Fetch bank suggestions when query changes
	$effect(() => {
		if (!open) return;
		const q = query.trim();
		clearTimeout(fetchTimer);
		if (q.length < 2) {
			bankResults = [];
			loading = false;
			return;
		}
		loading = true;
		fetchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&limit=8&active=1`);
				if (res.ok) {
					const json = (await res.json()) as { data?: Institution[] };
					bankResults = json.data ?? [];
				} else {
					bankResults = [];
				}
			} catch {
				bankResults = [];
			} finally {
				loading = false;
			}
		}, 200);
	});

	let filteredNav = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return NAV;
		return NAV.filter((n) => n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q));
	});

	let bankItems = $derived.by<BankItem[]>(() => {
		return bankResults.map((b) => ({
			kind: 'bank',
			label: b.name,
			hint: [b.city, b.state].filter(Boolean).join(', '),
			cert: b.cert,
			state: b.state,
			assets: b.total_assets
		}));
	});

	let allItems = $derived<Item[]>([...bankItems, ...filteredNav]);

	$effect(() => {
		const len = allItems.length;
		if (highlighted >= len) highlighted = Math.max(0, len - 1);
		if (highlighted < 0 && len > 0) highlighted = 0;
	});

	function activate(item: Item) {
		if (item.kind === 'bank') {
			goto(`/banks/${item.cert}`);
		} else {
			goto(item.href);
		}
		hide();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlighted = Math.min(highlighted + 1, allItems.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = allItems[highlighted];
			if (item) activate(item);
		} else if (e.key === 'Tab') {
			e.preventDefault();
			highlighted = (highlighted + (e.shiftKey ? -1 : 1) + allItems.length) % allItems.length;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) hide();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
	<div
		class="cmdk"
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
		tabindex="-1"
		onclick={handleBackdrop}
	>
		<div class="cmdk__panel" role="presentation">
			<div class="cmdk__input-wrap">
				<svg class="cmdk__search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<circle cx="7" cy="7" r="5"/>
					<path stroke-linecap="round" d="M11 11l3.5 3.5"/>
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="search"
					class="cmdk__input"
					placeholder="Search banks, jump to a page…"
					onkeydown={handleKey}
					autocomplete="off"
					spellcheck="false"
				/>
				<kbd class="cmdk__esc">esc</kbd>
			</div>

			<div class="cmdk__list" role="listbox">
				{#if bankItems.length > 0}
					<div class="cmdk__group">Banks</div>
					{#each bankItems as item, i}
						{@const idx = i}
						<button
							type="button"
							class="cmdk__row"
							class:cmdk__row--active={highlighted === idx}
							onmouseenter={() => (highlighted = idx)}
							onclick={() => activate(item)}
							role="option"
							aria-selected={highlighted === idx}
						>
							<svg class="cmdk__row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 13V5l5-3 5 3v8M3 13h10M6 13V9h4v4"/></svg>
							<div class="cmdk__row-main">
								<span class="cmdk__row-label">{item.label}</span>
								{#if item.hint}<span class="cmdk__row-hint">{item.hint}</span>{/if}
							</div>
							{#if item.assets != null}
								<span class="cmdk__row-aux data-mono">{formatCurrency(item.assets)}</span>
							{/if}
						</button>
					{/each}
				{:else if loading}
					<div class="cmdk__loading">Searching…</div>
				{/if}

				{#if filteredNav.length > 0}
					<div class="cmdk__group">Jump to</div>
					{#each filteredNav as item, i}
						{@const idx = bankItems.length + i}
						<button
							type="button"
							class="cmdk__row"
							class:cmdk__row--active={highlighted === idx}
							onmouseenter={() => (highlighted = idx)}
							onclick={() => activate(item)}
							role="option"
							aria-selected={highlighted === idx}
						>
							<svg class="cmdk__row-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8h10M9 4l4 4-4 4"/></svg>
							<div class="cmdk__row-main">
								<span class="cmdk__row-label">{item.label}</span>
								<span class="cmdk__row-hint">{item.hint}</span>
							</div>
							{#if item.shortcut}
								<span class="cmdk__row-aux">{item.shortcut}</span>
							{/if}
						</button>
					{/each}
				{/if}

				{#if bankItems.length === 0 && filteredNav.length === 0 && !loading}
					<div class="cmdk__empty">No matches for "{query}"</div>
				{/if}
			</div>

			<div class="cmdk__footer">
				<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
				<span><kbd>↵</kbd> open</span>
				<span><kbd>esc</kbd> close</span>
				<span class="cmdk__footer-spacer"></span>
				<span class="cmdk__brand"><kbd>{modKeyLabel}</kbd><kbd>K</kbd> toggle</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.cmdk {
		position: fixed;
		inset: 0;
		z-index: 100;
		background-color: color-mix(in srgb, var(--surface-0) 60%, transparent);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 1rem 1rem;
		animation: cmdkFade 0.12s ease-out;
	}
	@keyframes cmdkFade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	.cmdk__panel {
		width: 100%;
		max-width: 640px;
		background-color: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 0;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: cmdkSlide 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes cmdkSlide {
		from { transform: translateY(-6px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}
	.cmdk__input-wrap {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border-muted);
	}
	.cmdk__search-icon {
		width: 16px;
		height: 16px;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}
	.cmdk__input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 14px;
		color: var(--text-primary);
		font-family: inherit;
	}
	.cmdk__input::placeholder { color: var(--text-tertiary); }
	.cmdk__input::-webkit-search-cancel-button { display: none; }
	.cmdk__esc {
		font-size: 11px;
		color: var(--text-tertiary);
		background-color: var(--surface-2);
		border: 1px solid var(--border-muted);
		padding: 1px 5px;
		border-radius: 0;
		font-family: inherit;
	}

	.cmdk__list {
		max-height: 56vh;
		overflow-y: auto;
		padding: 0.5rem 0.375rem 0.625rem;
	}
	.cmdk__group {
		padding: 0.625rem 0.625rem 0.25rem;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-tertiary);
	}
	.cmdk__row {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		background: transparent;
		border: none;
		border-radius: 0;
		text-align: left;
		cursor: pointer;
		color: var(--text-primary);
		font-family: inherit;
	}
	.cmdk__row--active {
		background-color: var(--accent-muted);
	}
	.cmdk__row-icon {
		width: 14px;
		height: 14px;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}
	.cmdk__row--active .cmdk__row-icon { color: var(--accent); }
	.cmdk__row-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.cmdk__row-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cmdk__row-hint {
		font-size: 11px;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cmdk__row-aux {
		font-size: 11px;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}
	.cmdk__loading, .cmdk__empty {
		padding: 1rem 0.75rem;
		font-size: 12px;
		color: var(--text-tertiary);
		text-align: center;
	}

	.cmdk__footer {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.5rem 0.875rem;
		font-size: 11px;
		color: var(--text-tertiary);
		background-color: var(--surface-2);
		border-top: 1px solid var(--border-muted);
	}
	.cmdk__footer-spacer { flex: 1; }
	.cmdk__brand { color: var(--text-secondary); }
	.cmdk__footer kbd {
		display: inline-block;
		min-width: 14px;
		padding: 1px 4px;
		margin: 0 1px;
		font-family: inherit;
		font-size: 11px;
		text-align: center;
		color: var(--text-secondary);
		background-color: var(--surface-1);
		border: 1px solid var(--border-muted);
		border-radius: 0;
	}
</style>
