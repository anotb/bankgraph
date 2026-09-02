<script lang="ts">
	import { Board } from './board.svelte';
	import { RESEARCH_METRICS, RESEARCH_METRIC_CATEGORY_LABELS, RESEARCH_METRIC_CATEGORIES, type ResearchMetric } from '$lib/research-metrics';
	import { quarterLabel, shortBankName, usdThousands, seriesColor, count } from '$lib/atlas/format';
	import { US_STATES } from '$lib/atlas/states';
	import { quartersBetween, previousQuarter } from '$lib/atlas/engine/metrics';
	import type { MetricCondition } from '$lib/workspace/types';

	const board = Board.use();
	let open = $state<'banks' | 'cohort' | 'measures' | 'time' | null>(null);
	let bankQuery = $state('');
	let bankResults = $state<Array<{ cert: number; name: string; city: string | null; state: string | null; total_assets: number | null }>>([]);
	let controller: AbortController | null = null;

	$effect(() => {
		const q = bankQuery.trim();
		controller?.abort();
		if (q.length < 2) { bankResults = []; return; }
		controller = new AbortController();
		const signal = controller.signal;
		const t = setTimeout(async () => {
			try {
				const res = await fetch(`/api/v1/banks?q=${encodeURIComponent(q)}&active=all&limit=8&sort=assets&order=desc`, { signal });
				if (res.ok) { const body = (await res.json()) as { data: typeof bankResults }; if (!signal.aborted) bankResults = body.data; }
			} catch { /* aborted */ }
		}, 120);
		return () => clearTimeout(t);
	});

	function toggle(which: typeof open) { open = open === which ? null : which; }
	// Empty plates and the needs banner ask for a panel; open it and put the cursor in its field.
	let justRequested = false;
	$effect(() => {
		const want = board.requestPanel;
		if (!want) return;
		open = want;
		board.requestPanel = null;
		// The click that asked for the panel is still bubbling to the window; don't let it close what it opened.
		justRequested = true;
		setTimeout(() => { justRequested = false; }, 50);
		setTimeout(() => { (document.querySelector(`.anchor.open input, .anchor.open select, .anchor.open button.row`) as HTMLElement | null)?.focus(); document.querySelector('.anchor.open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 0);
	});
	let recipe = $derived(board.state.peerRecipe);
	let cohortLabel = $derived.by(() => {
		const r = recipe;
		const parts: string[] = [];
		if (r.basis === 'screen') parts.push('Current screen');
		if (r.states.length) parts.push(r.states.length > 3 ? `${r.states.length} states` : r.states.map((s) => US_STATES[s] ?? s).join(', '));
		if (r.assetRange.min != null || r.assetRange.max != null) parts.push(`${r.assetRange.min != null ? usdThousands(r.assetRange.min, 0) : ''}${r.assetRange.min != null && r.assetRange.max != null ? ' – ' : r.assetRange.min != null ? ' and above' : 'under '}${r.assetRange.max != null ? usdThousands(r.assetRange.max, 0) : ''}`);
		if (r.metricConditions.length) parts.push(`${r.metricConditions.length} condition${r.metricConditions.length > 1 ? 's' : ''}`);
		if (!parts.length) parts.push(r.active === 'any' ? 'All institutions' : r.active === 'inactive' ? 'Inactive institutions' : 'Active filers');
		return parts.join(' · ');
	});
	const ASSET_BANDS = [
		{ label: 'Any size', min: null, max: null }, { label: 'Under $1B', min: null, max: 1_000_000 }, { label: '$1B – $10B', min: 1_000_000, max: 10_000_000 },
		{ label: '$10B – $50B', min: 10_000_000, max: 50_000_000 }, { label: '$50B – $250B', min: 50_000_000, max: 250_000_000 }, { label: 'Over $250B', min: 250_000_000, max: null }
	];
	const SCREEN_METRICS = [{ id: 'roa', label: 'ROA %' }, { id: 'nim', label: 'NIM %' }, { id: 'noncurrentLoanRatio', label: 'Noncurrent %' }, { id: 'tier1Ratio', label: 'Tier 1 %' }, { id: 'roe', label: 'ROE %' }];
	function setStates(states: string[]) { board.setPeerRecipe({ ...recipe, basis: 'custom', states }); }
	function setBand(min: number | null, max: number | null) { board.setPeerRecipe({ ...recipe, basis: 'custom', assetRange: { min, max } }); }
	function addCondition() { board.setPeerRecipe({ ...recipe, basis: 'custom', metricConditions: [...recipe.metricConditions, { metric: 'noncurrentLoanRatio', operator: 'gte', value: 1, upperValue: null }] }); }
	function setCondition(i: number, patch: Partial<MetricCondition>) { const next = recipe.metricConditions.map((c, k) => (k === i ? { ...c, ...patch } : c)); board.setPeerRecipe({ ...recipe, metricConditions: next }); }
	function removeCondition(i: number) { board.setPeerRecipe({ ...recipe, metricConditions: recipe.metricConditions.filter((_, k) => k !== i) }); }
	let stateInput = $state('');
	function addState() { const code = stateInput.trim().toUpperCase(); if (US_STATES[code] && !recipe.states.includes(code)) setStates([...recipe.states, code]); stateInput = ''; }

	let allQuarters = $derived(quartersBetween('19920331', board.latest).reverse());
	let historyLength = $derived(board.quarters.length);
	function setHistoryLength(n: number) { board.setHistory(previousQuarter(board.asOf, n - 1), board.asOf); }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = null)} onclick={(e) => { if (open && !justRequested && !(e.target as HTMLElement).closest('.deck')) open = null; }} />
<div class="plate deck" role="group" aria-label="Board selection">
	<div class="anchor" class:open={open === 'banks'}>
		<button type="button" class="lab" onclick={() => toggle('banks')}>Banks</button>
		<div class="val">
			{#each board.selectedCerts as cert, i}
				{@const inst = board.data.institutions[cert]}
				<span class="chip bank" class:active={board.state.activeBank === cert}>
					<button type="button" class="pick" onclick={() => board.setActiveBank(cert)} onmouseenter={() => (board.hoverCert = cert)} onmouseleave={() => (board.hoverCert = null)} title={inst?.name}><i class="dot" style="background:{seriesColor(i)}"></i>{inst ? shortBankName(inst.name) : cert}</button>
					<button type="button" class="x" aria-label="Remove {inst ? shortBankName(inst.name) : cert}" onclick={() => board.removeCert(cert)}>×</button>
				</span>
			{/each}
			<button type="button" class="chip add" onclick={() => toggle('banks')}>{board.selectedCerts.length ? '+' : '+ Add a bank'}</button>
		</div>
		{#if open === 'banks'}
			<div class="pop panel">
				<input class="in" placeholder="Name, city, state, or certificate" bind:value={bankQuery} aria-label="Find a bank" />
				<div class="list">
					{#each bankResults as b}
						<button type="button" class="row" disabled={board.selectedCerts.includes(b.cert)} onclick={() => { board.addCert(b.cert); bankQuery = ''; }}>
							<span>{shortBankName(b.name)}</span><span class="sub">{b.city}{b.state ? `, ${b.state}` : ''} · {usdThousands(b.total_assets)}</span>
						</button>
					{/each}
					{#if bankQuery.trim().length >= 2 && !bankResults.length}<div class="sub" style="padding:6px 0">No match in the FDIC directory</div>{/if}
				</div>
				{#if board.data.cohort.length}
					<div class="cap" style="margin-top:10px">From the cohort</div>
					<div class="list">
						{#each board.data.cohort.filter((c) => !board.selectedCerts.includes(c)).slice(0, 6) as cert}
							<button type="button" class="row" onclick={() => board.addCert(cert)}><span>{shortBankName(board.data.institutions[cert]?.name ?? String(cert))}</span><span class="sub">{board.data.institutions[cert]?.state} · {usdThousands(board.data.institutions[cert]?.total_assets)}</span></button>
						{/each}
					</div>
				{/if}
				<div class="hint">Up to ten. Click a bank to make it the focus.</div>
			</div>
		{/if}
	</div>

	<div class="anchor" class:open={open === 'cohort'}>
		<button type="button" class="lab" onclick={() => toggle('cohort')}>Cohort</button>
		<div class="val">
			<button type="button" class="chip" onclick={() => toggle('cohort')}>{cohortLabel}</button>
			<span class="count mono">{board.data.cohort.length ? `${count(board.data.cohort.length)} of ${count(board.data.cohortTotal)}` : board.data.pending ? 'loading' : ''}{board.state.excludedCerts.length ? ` · ${board.state.excludedCerts.length} excluded` : ''}</span>
		</div>
		{#if open === 'cohort'}
			<div class="pop panel wide">
				<div class="rule-row"><span class="rl">Universe</span><div class="seg"><button type="button" aria-pressed={recipe.active === 'active'} onclick={() => board.setPeerRecipe({ ...recipe, basis: 'custom', active: 'active' })}>Active filers</button><button type="button" aria-pressed={recipe.active === 'any'} onclick={() => board.setPeerRecipe({ ...recipe, basis: 'custom', active: 'any' })}>Include inactive</button></div></div>
				<div class="rule-row"><span class="rl">Headquarters</span><div class="chips">{#each recipe.states as s}<button type="button" class="chip on" onclick={() => setStates(recipe.states.filter((x) => x !== s))}>{s} ×</button>{/each}<input class="in small" placeholder="+ state" bind:value={stateInput} onkeydown={(e) => e.key === 'Enter' && addState()} aria-label="Add a state" /></div></div>
				<div class="rule-row"><span class="rl">Total assets</span><div class="seg wrap">{#each ASSET_BANDS as band}<button type="button" aria-pressed={recipe.assetRange.min === band.min && recipe.assetRange.max === band.max} onclick={() => setBand(band.min, band.max)}>{band.label}</button>{/each}</div></div>
				<div class="rule-row"><span class="rl">Conditions</span><div class="conds">
					{#each recipe.metricConditions as c, i}
						<div class="cond">
							<select class="in" value={c.metric} onchange={(e) => setCondition(i, { metric: e.currentTarget.value })}>{#each SCREEN_METRICS as m}<option value={m.id}>{m.label}</option>{/each}</select>
							<select class="in" value={c.operator} onchange={(e) => setCondition(i, { operator: e.currentTarget.value as MetricCondition['operator'] })}><option value="gte">≥</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="lt">&lt;</option></select>
							<input class="in" type="number" step="0.1" value={c.value} onchange={(e) => setCondition(i, { value: Number(e.currentTarget.value) })} aria-label="Value" />
							<button type="button" class="btn sm quiet" onclick={() => removeCondition(i)} aria-label="Remove condition">×</button>
						</div>
					{/each}
					<button type="button" class="btn sm" onclick={addCondition}>+ Condition</button>
				</div></div>
				<div class="rule-row"><span class="rl">Members</span><div class="seg">{#each [25, 50, 100, 200] as n}<button type="button" aria-pressed={recipe.maximumPeers === n} onclick={() => board.setPeerRecipe({ ...recipe, maximumPeers: n })}>{n} largest</button>{/each}</div></div>
				{#if board.state.excludedCerts.length}
					<div class="rule-row"><span class="rl">Excluded</span><div class="chips">{#each board.state.excludedCerts as cert}<button type="button" class="chip strike" onclick={() => board.setExcluded(board.state.excludedCerts.filter((x) => x !== cert))}>{shortBankName(board.data.institutions[cert]?.name ?? String(cert))} ×</button>{/each}</div></div>
				{/if}
				<div class="hint">{count(board.data.cohortTotal)} institutions match these rules; members are recomputed on each release.</div>
			</div>
		{/if}
	</div>

	<div class="anchor" class:open={open === 'measures'}>
		<button type="button" class="lab" onclick={() => toggle('measures')}>Measures</button>
		<div class="val">
			{#each board.metrics as m}
				<button type="button" class="chip metric" aria-pressed={board.activeMetric === m} onclick={() => board.setActiveMetric(m)} title={RESEARCH_METRICS.find((x) => x.id === m)?.label}>{RESEARCH_METRICS.find((x) => x.id === m)?.shortLabel ?? m}</button>
			{/each}
			<button type="button" class="chip add" onclick={() => toggle('measures')}>+</button>
		</div>
		{#if open === 'measures'}
			<div class="pop panel wide">
				{#each RESEARCH_METRIC_CATEGORIES as cat}
					<div class="cap" style="margin-top:8px">{RESEARCH_METRIC_CATEGORY_LABELS[cat]}</div>
					<div class="chips">
						{#each RESEARCH_METRICS.filter((m) => m.category === cat) as m}
							<button type="button" class="chip" class:on={board.metrics.includes(m.id)} disabled={!board.metrics.includes(m.id) && board.metrics.length >= 6} onclick={() => board.setMetrics(board.metrics.includes(m.id) ? board.metrics.filter((x) => x !== m.id) : [...board.metrics, m.id as ResearchMetric])} title={m.description}>{m.label}</button>
						{/each}
					</div>
				{/each}
				<div class="hint">Up to six on the board. Focus opens more.</div>
			</div>
		{/if}
	</div>

	<div class="anchor time" class:open={open === 'time'}>
		<button type="button" class="lab" onclick={() => toggle('time')}>Time</button>
		<div class="val">
			{#if board.eventTime}
				<button type="button" class="chip" onclick={() => toggle('time')}>Event time · t−{board.eventTime.quartersBefore} → t0</button>
			{:else}
				<button type="button" class="chip" onclick={() => toggle('time')}><b>{quarterLabel(board.asOf)}</b><span class="vs">vs {quarterLabel(board.compareWith)}</span></button>
				<span class="count mono">{historyLength}Q</span>
			{/if}
		</div>
		{#if open === 'time'}
			<div class="pop panel">
				<div class="rule-row"><span class="rl">As of</span><select class="in" value={board.asOf} onchange={(e) => board.setAsOf(e.currentTarget.value)}>{#each allQuarters as q}<option value={q}>{quarterLabel(q, 'long')}</option>{/each}</select></div>
				<div class="rule-row"><span class="rl">Compare with</span><div class="seg"><button type="button" aria-pressed={board.state.comparison.mode === 'prior-quarter'} onclick={() => board.setComparison('prior-quarter')}>Prior quarter</button><button type="button" aria-pressed={board.state.comparison.mode === 'year-ago'} onclick={() => board.setComparison('year-ago')}>Year ago</button><button type="button" aria-pressed={board.state.comparison.mode === 'range-start'} onclick={() => board.setComparison('range-start')}>Start of history</button></div></div>
				<div class="rule-row"><span class="rl">History</span><div class="seg">{#each [8, 20, 40, 80] as n}<button type="button" aria-pressed={historyLength === n} onclick={() => setHistoryLength(n)}>{n}Q</button>{/each}</div></div>
				<div class="rule-row"><span class="rl">Axis</span><div class="seg"><button type="button" aria-pressed={!board.eventTime} onclick={() => board.useCalendar()}>Calendar</button><button type="button" aria-pressed={!!board.eventTime} disabled={!board.eventTimeAvailable} title={board.eventTimeAvailable ? '' : 'Available once a failure analysis is on the board'} onclick={() => board.useEventTime()}>Event time</button></div></div>
				<div class="hint">Event time aligns institutions on their last filing before failure.</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.deck { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr); gap: 0 18px; padding: 10px 14px; position: relative; z-index: 20; }
	.anchor { display: grid; grid-template-columns: 68px 1fr; gap: 10px; align-items: start; position: relative; min-width: 0; padding-right: 18px; border-right: 1px solid var(--rule-2); }
	.anchor:last-child { border-right: 0; padding-right: 0; }
	.lab { border: 0; background: none; padding: 4px 0; cursor: pointer; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-2); text-align: left; }
	.anchor.open .lab, .lab:hover { color: var(--accent); }
	.val { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 26px; min-width: 0; }
	.chip.bank { padding: 0; gap: 0; overflow: hidden; }
	.chip.bank .pick { display: inline-flex; align-items: center; gap: 6px; height: 100%; padding: 0 8px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
	.chip.bank .x { border: 0; border-left: 1px solid var(--rule); background: none; color: var(--ink-3); font: inherit; height: 100%; padding: 0 7px; cursor: pointer; }
	.chip.bank .x:hover { color: var(--adverse); background: var(--surface-3); }
	.chip.bank.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
	.chip b { font-weight: 600; }
	.chip .vs { color: var(--ink-2); font-weight: 400; margin-left: 6px; }
	.count { font-size: 11.5px; color: var(--ink-3); }
	.panel { position: absolute; left: 0; top: calc(100% + 8px); width: min(440px, 92vw); font-size: 12.5px; padding: 12px; }
	.panel.wide { width: min(620px, 92vw); }
	.in { width: 100%; }
	.in.small { width: 92px; height: 26px; font-size: 12px; }
	.list { display: grid; gap: 1px; margin-top: 8px; max-height: 260px; overflow: auto; }
	.row { display: grid; gap: 1px; text-align: left; border: 0; background: none; padding: 6px 8px; cursor: pointer; color: var(--ink); font: inherit; font-weight: 500; border-radius: 4px; }
	.row:hover { background: var(--surface-2); }
	.row[disabled] { opacity: .45; cursor: default; }
	.sub { color: var(--ink-3); font-size: 11.5px; font-weight: 400; }
	.hint { color: var(--ink-3); font-size: 11.5px; margin-top: 10px; }
	.rule-row { display: grid; grid-template-columns: 104px 1fr; gap: 12px; align-items: start; padding: 8px 0; border-top: 1px solid var(--rule-2); }
	.rule-row:first-child { border-top: 0; padding-top: 0; }
	.rl { color: var(--ink-2); font-size: 12px; font-weight: 500; padding-top: 5px; }
	.seg.wrap { flex-wrap: wrap; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.chip.strike { text-decoration: line-through; color: var(--ink-3); }
	.chip[disabled] { opacity: .4; cursor: default; }
	.conds { display: grid; gap: 6px; }
	.cond { display: flex; gap: 6px; align-items: center; }
	.cond .in { width: auto; }
	.cond input.in { width: 76px; font-family: var(--font-mono); }
	@media (max-width: 1100px) { .deck { grid-template-columns: 1fr 1fr; gap: 10px 18px; } .anchor:nth-child(2) { border-right: 0; padding-right: 0; } }
	@media (max-width: 640px) {
		.deck { grid-template-columns: 1fr; gap: 8px; padding: 10px 12px; }
		.anchor { border-right: 0; padding-right: 0; grid-template-columns: 64px 1fr; }
		.val { flex-wrap: wrap; }
		.panel { position: fixed; left: 8px; right: 8px; top: auto; bottom: 8px; width: auto; max-height: 70vh; overflow: auto; z-index: 70; }
		.rule-row { grid-template-columns: 1fr; gap: 4px; }
	}
</style>
