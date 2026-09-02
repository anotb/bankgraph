<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatCurrency } from '$lib/utils/formatters';

	type Match = { cert: number; name: string; city: string | null; state: string | null; active: number; total_assets: number | null };
	let hydrated = $state(false);
	let query = $state('');
	let matches = $state<Match[]>([]);
	let highlighted = $state(-1);
	let open = $state(false);
	let loading = $state(false);
	let failed = $state(false);
	let input: HTMLInputElement | undefined = $state();
	let requestId = 0;

	onMount(() => { hydrated = true; });

	$effect(() => {
		const value = query.trim();
		if (!hydrated || value.length < 2) {
			matches = []; open = false; loading = false; failed = false;
			return;
		}
		const id = ++requestId;
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			loading = true; failed = false;
			try {
				const response = await fetch(`/api/v1/banks?q=${encodeURIComponent(value)}&active=all&limit=8`, { signal: controller.signal });
				if (!response.ok) throw new Error(`Search returned ${response.status}`);
				const payload = await response.json() as { data?: Match[] };
				if (id !== requestId) return;
				matches = Array.isArray(payload.data) ? payload.data.slice(0, 8) : [];
				highlighted = matches.length ? 0 : -1;
				open = true;
			} catch {
				if (controller.signal.aborted || id !== requestId) return;
				matches = []; failed = true; open = true;
			} finally {
				if (id === requestId) loading = false;
			}
		}, 180);
		return () => { window.clearTimeout(timer); controller.abort(); };
	});

	function openMatch(match: Match) { open = false; void goto(`/banks/${match.cert}`); }
	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (open && highlighted >= 0 && matches[highlighted]) return openMatch(matches[highlighted]);
		const value = query.trim();
		if (value) void goto(`/banks?q=${encodeURIComponent(value)}&active=all`);
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); open = true; highlighted = (highlighted + 1) % matches.length; }
		else if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); open = true; highlighted = (highlighted - 1 + matches.length) % matches.length; }
		else if (event.key === 'Escape') open = false;
	}
	function clear() { query = ''; matches = []; open = false; input?.focus(); }
</script>

<div class="finder" aria-busy={loading}>
	<label for="home-bank-search">Find an institution</label>
	<form method="get" action="/banks" onsubmit={submit}>
		<div class="finder__input">
			<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
			<input bind:this={input} bind:value={query} id="home-bank-search" name="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="home-bank-results" aria-activedescendant={open && highlighted >= 0 ? `home-bank-option-${highlighted}` : undefined} disabled={!hydrated} autocomplete="off" placeholder="Name, city, state, or FDIC certificate" onkeydown={keydown} onfocus={() => { if (query.trim().length >= 2) open = true; }} onblur={() => window.setTimeout(() => { open = false; }, 140)} />
			{#if query}<button class="finder__clear" type="button" onclick={clear} aria-label="Clear search">×</button>{/if}
			<button class="finder__submit" type="submit" disabled={!hydrated || !query.trim()}><span>Search</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5"></path></svg></button>
		</div>
		{#if open}
			<div class="finder__results" id="home-bank-results" role="listbox" aria-label="Institution matches">
				{#if loading && matches.length === 0}<p>Searching the FDIC directory…</p>
				{:else if failed}<p>Institution search is temporarily unavailable. Press Search to open the full directory.</p>
				{:else if matches.length === 0}<p>No institution matched this name, city, state, or certificate.</p>
				{:else}
					{#each matches as match, index}
						<button id={`home-bank-option-${index}`} type="button" role="option" aria-selected={highlighted === index} class:active={highlighted === index} onmouseenter={() => highlighted = index} onmousedown={(event) => event.preventDefault()} onclick={() => openMatch(match)}>
							<span><strong>{match.name}</strong><small>{match.city ? `${match.city}, ` : ''}{match.state ?? '—'} · FDIC {match.cert}{match.active ? '' : ' · Historical'}</small></span>
							<em>{formatCurrency(match.total_assets)}</em>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</form>
	<p>Searches active and historical institutions in the FDIC directory.</p>
</div>

<style>
	.finder { position: relative; margin-top: 1.6rem; }
	.finder > label { display: block; margin-bottom: .55rem; color: var(--text-secondary); font-size: .75rem; font-weight: 650; }
	form { position: relative; }
	.finder__input { display: grid; grid-template-columns: 1.25rem 1fr auto auto; gap: .65rem; align-items: center; min-height: 3.25rem; border: 1px solid var(--border); background: var(--surface-1); padding: .42rem .45rem .42rem .8rem; box-shadow: var(--shadow-md); }
	.finder__input:focus-within { border-color: var(--accent); box-shadow: var(--shadow-md), 0 0 0 1px rgb(37 205 245 / .16); }
	.finder__input > svg { width: 1.05rem; fill: none; stroke: var(--text-tertiary); stroke-width: 1.5; }
	input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: 450 .95rem/1.35 Inter, system-ui, sans-serif; caret-color: var(--accent); }
	input::placeholder { color: var(--text-disabled); }
	input::-webkit-search-cancel-button { display: none; }
	.finder__clear { width: 2rem; min-height: 2rem; border: 0; background: transparent; color: var(--text-tertiary); font-size: 1.25rem; cursor: pointer; }
	.finder__clear:hover { color: var(--text-primary); }
	.finder__submit { display: inline-flex; align-items: center; gap: .35rem; min-height: 2.35rem; border: 0; background: var(--accent); color: #06131d; padding: 0 .8rem; font: 750 .75rem/1 Inter, system-ui, sans-serif; cursor: pointer; }
	.finder__submit:hover { background: var(--accent-hover); }
	.finder__submit:disabled { background: var(--surface-3); color: var(--text-disabled); cursor: default; }
	.finder__submit svg { width: .95rem; fill: none; stroke: currentColor; stroke-width: 1.7; }
	.finder > p { margin: .55rem 0 0; color: var(--text-tertiary); font-size: .72rem; }
	.finder__results { position: absolute; z-index: 30; top: calc(100% + .35rem); left: 0; right: 0; border: 1px solid var(--border); background: #081824; box-shadow: var(--shadow-lg); }
	.finder__results > p { margin: 0; padding: 1rem; color: var(--text-tertiary); font-size: .75rem; line-height: 1.45; }
	.finder__results > button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; width: 100%; border: 0; border-bottom: 1px solid var(--border-muted); background: transparent; color: var(--text-primary); padding: .72rem .8rem; text-align: left; cursor: pointer; }
	.finder__results > button:last-child { border-bottom: 0; }
	.finder__results > button:hover, .finder__results > button.active { background: var(--surface-2); }
	.finder__results span { min-width: 0; }
	.finder__results strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; font-weight: 650; }
	.finder__results small { display: block; margin-top: .2rem; color: var(--text-tertiary); font-size: 11px; }
	.finder__results em { align-self: center; color: var(--text-secondary); font: 500 11px/1 var(--font-mono); font-style: normal; white-space: nowrap; }
	@media (max-width: 520px) { .finder__input { grid-template-columns: 1.1rem 1fr auto auto; } .finder__clear { width: 2.75rem; min-height: 2.75rem; } .finder__submit span { display: none; } .finder__submit { width: 2.75rem; min-height: 2.75rem; justify-content: center; padding: 0; } .finder__results em { display: none; } }
</style>
