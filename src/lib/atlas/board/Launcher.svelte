<script lang="ts">
	import { Board } from './board.svelte';
	import { BOARD_TEMPLATES } from '$lib/atlas/templates';
	import { agentPresence } from '$lib/atlas/agent.svelte';
	import { shortBankName, usdThousands } from '$lib/atlas/format';
	import LayoutPreview from './LayoutPreview.svelte';

	const board = Board.use();
	let bankQuery = $state('');
	let results = $state<Array<{ cert: number; name: string; city: string | null; state: string | null; total_assets: number | null }>>([]);
	let controller: AbortController | null = null;
	$effect(() => {
		const q = bankQuery.trim();
		controller?.abort();
		if (q.length < 2) { results = []; return; }
		controller = new AbortController();
		const signal = controller.signal;
		const t = setTimeout(async () => {
			try { const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&active=all&limit=6&sort=assets&order=desc`, { signal }); if (res.ok) { const body = (await res.json()) as { data: typeof results }; if (!signal.aborted) results = body.data; } } catch { /* aborted */ }
		}, 120);
		return () => clearTimeout(t);
	});
	function needs(t: (typeof BOARD_TEMPLATES)[number]): string | null {
		if (t.needs.includes('banks') && !board.selectedCerts.length) return 'Add a bank first';
		if (t.needs.includes('cohort') && !board.data.cohort.length) return 'Define a cohort first';
		return null;
	}
	const COHORTS = [
		{ label: 'All active banks', recipe: { states: [], assetRange: { min: null, max: null } } },
		{ label: 'Under $1B', recipe: { states: [], assetRange: { min: null, max: 1_000_000 } } },
		{ label: '$1B – $50B', recipe: { states: [], assetRange: { min: 1_000_000, max: 50_000_000 } } },
		{ label: 'Over $50B', recipe: { states: [], assetRange: { min: 50_000_000, max: null } } }
	];
</script>

<div class="launch">
	<section class="plate path">
		<h3>Start with a bank or a cohort</h3>
		<input class="in" placeholder="Bank name, city, or FDIC certificate" bind:value={bankQuery} aria-label="Find a bank" />
		{#if results.length}
			<div class="list">{#each results as b}<button type="button" onclick={() => { board.addCert(b.cert); bankQuery = ''; board.applyTemplate('one_bank'); }}><span>{shortBankName(b.name)}</span><span class="sub">{b.city}{b.state ? `, ${b.state}` : ''} · {usdThousands(b.total_assets)}</span></button>{/each}</div>
		{/if}
		<div class="cap" style="margin-top:14px">Or a cohort</div>
		<div class="chips">{#each COHORTS as c}<button type="button" class="chip" onclick={() => { board.setPeerRecipe({ ...board.state.peerRecipe, basis: 'custom', name: c.label, active: 'active', ...c.recipe, maximumPeers: 200 }); board.applyTemplate('credit_stress'); }}>{c.label}</button>{/each}<a class="chip add" href="/banks">Filter the directory</a></div>
		{#if board.selectedCerts.length || board.data.cohort.length}
			<p class="have">{board.selectedCerts.length ? `${board.selectedCerts.length} bank${board.selectedCerts.length > 1 ? 's' : ''} selected` : ''}{board.selectedCerts.length && board.data.cohort.length ? ' · ' : ''}{board.data.cohort.length ? `Cohort of ${board.data.cohort.length}` : ''}. Pick a layout to place views.</p>
		{/if}
	</section>

	<section class="plate path layouts">
		<h3>Start from a layout</h3>
		<div class="grid">
			{#each BOARD_TEMPLATES as t}
				{@const gap = needs(t)}
				<button type="button" class="tmpl" class:gap={gap} onclick={() => { board.applyTemplate(t); if (gap) board.requestPanel = t.needs.includes('banks') && !board.selectedCerts.length ? 'banks' : 'cohort'; }}>
					<LayoutPreview template={t} height={40} />
					<b>{t.name}</b>
					<span class="d">{t.description}</span>
					{#if gap}<span class="gap-note">{gap === 'Add a bank first' ? 'Places the views, then asks for a bank' : 'Places the views, then asks for a cohort'}</span>{/if}
				</button>
			{/each}
		</div>
	</section>

	<section class="plate path agent">
		<h3>Work with an agent</h3>
		{#if agentPresence.phase === 'unsupported'}
			<p>In a browser that supports WebMCP, ChatGPT or Claude can build this board from a question: search institutions, define the cohort, add views, and arrange them here.</p>
			<p class="sub">This browser doesn't expose WebMCP.</p>
		{:else}
			<p>{agentPresence.registered} tools are registered for this tab. Ask a question in your assistant and it will build here.</p>
			<p class="ex">“Show how failed banks evolved before 2008, then find active banks with similar patterns.”</p>
		{/if}
	</section>
</div>

<style>
	.launch { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 6fr) minmax(0, 3fr); gap: 12px; }
	.path h3 { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
	.in { width: 100%; height: 32px; font-size: 13px; }
	.list { display: grid; gap: 1px; margin-top: 6px; }
	.list button { display: grid; text-align: left; border: 0; background: none; padding: 7px 8px; border-radius: 4px; cursor: pointer; color: var(--ink); font: inherit; font-weight: 500; }
	.list button:hover { background: var(--surface-2); }
	.sub { color: var(--ink-3); font-size: 11.5px; font-weight: 400; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
	.chip.add { text-decoration: none; }
	.have { margin: 12px 0 0; font-size: 12.5px; color: var(--ink-2); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
	.tmpl { text-align: left; border: 1px solid var(--rule-2); background: var(--surface-2); border-radius: 4px; padding: 8px; cursor: pointer; color: var(--ink); font: inherit; display: grid; gap: 4px; transition: border-color 140ms ease-out, background 140ms ease-out; }
	.tmpl:hover { border-color: var(--accent); background: var(--surface); }


	.tmpl b { font-weight: 600; font-size: 12.5px; }
	.tmpl .d { color: var(--ink-3); font-size: 11.5px; line-height: 1.35; }
	.tmpl .gap-note { display: block; color: var(--ink-3); font-size: 11px; margin-top: 3px; font-style: normal; }
	.agent p { margin: 0 0 8px; font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
	.agent .ex { color: var(--ink); font-style: italic; }
	@media (max-width: 1100px) { .launch { grid-template-columns: 1fr 1fr; } .layouts { grid-column: 1 / -1; } }
	@media (max-width: 640px) { .launch { grid-template-columns: 1fr; } .layouts { grid-column: auto; } .grid { grid-template-columns: 1fr 1fr; } }
</style>
