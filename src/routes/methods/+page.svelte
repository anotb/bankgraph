<script lang="ts">
	import { RESEARCH_METRICS, RESEARCH_METRIC_CATEGORIES, RESEARCH_METRIC_CATEGORY_LABELS } from '$lib/research-metrics';
	import { fieldDefs, categoryLabels, categoryOrder } from '$lib/utils/field-meta';

	let { data } = $props();
	let query = $state('');
	let ql = $derived(query.trim().toLowerCase());
	const researchIds = new Set<string>(RESEARCH_METRICS.map((m) => m.id));
	let detail = $derived(Object.entries(fieldDefs).filter(([id]) => !researchIds.has(id)));
	function matches(...parts: Array<string | undefined>) { return !ql || parts.some((p) => p?.toLowerCase().includes(ql)); }
	const CHANGE: Record<string, string> = { percent_change: 'percent change', percentage_points: 'percentage points', absolute_change: 'absolute change' };
</script>

<svelte:head><title>Data and methods · Bankgraph</title><meta name="description" content="Every measure in Bankgraph with its FDIC source field, unit, formula, how change is measured, and whether it can be summed, plus the economic series shown alongside banks." /></svelte:head>

<div class="page">
	<header class="head">
		<div>
			<h1>Data and methods</h1>
			<p class="sub">Money is FDIC USD thousands; ratios are as reported, in percent. Common measures appear on boards; detail fields open in Focus and through the same tools.</p>
		</div>
		<input class="in" placeholder="Filter measures" bind:value={query} aria-label="Filter measures" />
	</header>

	<nav class="toc plate" aria-label="Sections">
		<a href="#common">Common measures <span class="mono">{RESEARCH_METRICS.length}</span></a>
		<a href="#detail">Detail fields <span class="mono">{detail.length}</span></a>
		<a href="#economy">Economic series <span class="mono">{data.macro.length}</span></a>
		<a href="#methods">Methods</a>
	</nav>

	<section id="common" class="plate">
		<h2>Common measures</h2>
		<div class="groups">
			{#each RESEARCH_METRIC_CATEGORIES as cat}
				{@const rows = RESEARCH_METRICS.filter((m) => m.category === cat && matches(m.label, m.id, m.source, m.description))}
				{#if rows.length}
					<div class="group">
						<h3>{RESEARCH_METRIC_CATEGORY_LABELS[cat]}</h3>
						{#each rows as m}
							<div class="m" id={m.id}>
								<div class="m-head"><b>{m.label}</b><span class="mono src">{m.source}</span><span class="unit">{m.displayUnit}</span></div>
								<p>{m.description}</p>
								<div class="tags"><span>{CHANGE[m.change]}</span><span>{m.aggregation === 'additive' ? 'sums across banks' : 'distribution only'}</span>{#if m.direction !== 'neutral'}<span>{m.direction} is better</span>{/if}</div>
							</div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</section>

	<section id="detail" class="plate">
		<h2>Detail fields <span class="dim">Call Report fields behind the common measures</span></h2>
		{#each categoryOrder as cat}
			{@const rows = detail.filter(([, d]) => d.category === cat && matches(d.label, d.sourceField, d.description, d.mdrm))}
			{#if rows.length}
				<h3>{categoryLabels[cat]}</h3>
				<div class="scroll">
					<table class="atlas">
						<thead><tr><th>Field</th><th>Source</th><th>MDRM</th><th>Basis</th><th class="desc">Definition</th></tr></thead>
						<tbody>
							{#each rows as [id, d]}
								<tr id={id}>
									<td class="n"><b>{d.label}</b></td><td class="mono">{d.sourceField ?? '—'}</td><td class="mono">{d.mdrm ?? '—'}</td>
									<td class="n">{d.timeBasis === 'year_to_date' ? 'year to date' : d.timeBasis === 'single_quarter' ? 'single quarter' : 'point in time'}</td>
									<td class="n desc">{d.description}{#if d.formula} <span class="mono src">{d.formula}</span>{/if}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/each}
	</section>

	<section id="economy" class="plate">
		<h2>Economic series <span class="dim">context beside banks, never cause</span></h2>
		<div class="scroll">
			<table class="atlas">
				<thead><tr><th>Series</th><th>ID</th><th>Agency</th><th>Frequency</th><th>Units</th><th>From</th></tr></thead>
				<tbody>
					{#each data.macro.filter((s) => matches(s.title, s.series_id, s.source_agency)) as s}
						<tr id={s.series_id}><td class="n"><b>{s.title}</b></td><td class="mono">{s.series_id}</td><td class="n">{s.source_agency}</td><td class="n">{s.frequency}</td><td class="n">{s.units}</td><td class="mono">{s.source_available_from ?? '—'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section id="methods" class="plate methods">
		<h2>Methods</h2>
		<div class="cols">
			<div><h3>Cohorts</h3><p>A cohort is a rule over the latest institution snapshot: universe, headquarters state, asset bounds, up to twelve conditions, and a member cap. Members are recomputed from the rule on each release, so a shared board resolves to the same institutions for the same quarter. Exclusions travel with the board.</p></div>
			<div><h3>Change</h3><p>Balances change in percent; ratios in percentage points, shown as basis points when small; counts absolutely. Quarterly net income uses the reported single-quarter value or the exact change in year-to-date income within a calendar year.</p></div>
			<div><h3>Attribution</h3><p>Changes in total assets, funding, and quarterly net income are bridged with reported components under an exact difference identity. The residual between the reported total and the sum of components is always shown.</p></div>
			<div><h3>Failure analogues</h3><p>Failed institutions are aligned on their last filing before the FDIC failure date. For each of eleven features and each relative quarter, the reference is the failed-cohort median with a MAD-based scale. Active institutions are ranked by root-mean-square standardized distance divided by observed coverage. This is descriptive similarity, not a probability of failure.</p></div>
		</div>
	</section>
</div>

<style>
	.page { padding: 14px 20px 60px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 1400px; }
	.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
	h1 { font-size: 18px; font-weight: 650; margin: 0 0 4px; letter-spacing: -0.01em; }
	.sub { margin: 0; color: var(--ink-2); font-size: 12.5px; max-width: 720px; line-height: 1.5; }
	.head .in { width: 240px; }
	.toc { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 10px; }
	.toc a { color: var(--ink-2); text-decoration: none; font-size: 12.5px; font-weight: 500; padding: 5px 10px; border-radius: 4px; display: inline-flex; gap: 8px; }
	.toc a:hover { background: var(--surface-2); color: var(--ink); }
	.toc .mono { color: var(--ink-3); font-weight: 400; }
	h2 { font-size: 14px; font-weight: 650; margin: 0 0 12px; display: flex; gap: 10px; align-items: baseline; }
	h2 .dim { font-size: 12.5px; font-weight: 400; }
	h3 { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); font-weight: 600; margin: 14px 0 6px; }
	.groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 28px; }
	.group h3 { margin-top: 4px; }
	.m { padding: 10px 0; border-top: 1px solid var(--rule-2); scroll-margin-top: 60px; }
	.m:target { background: var(--accent-wash); margin: 0 -8px; padding: 10px 8px; border-radius: 4px; }
	.m-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
	.m-head b { font-weight: 600; font-size: 13px; }
	.src { color: var(--ink-3); font-size: 11.5px; }
	.unit { color: var(--ink-3); font-size: 11.5px; margin-left: auto; }
	.m p { margin: 4px 0 6px; font-size: 12.5px; color: var(--ink-2); line-height: 1.45; }
	.tags { display: flex; flex-wrap: wrap; gap: 4px; }
	.tags span { font-size: 11px; color: var(--ink-2); background: var(--surface-2); border-radius: 3px; padding: 1px 6px; }
	td.n b { font-weight: 500; }
	th.desc, td.desc { text-align: left; white-space: normal; font-size: 12px; color: var(--ink-2); min-width: 320px; }
	tr:target td { background: var(--accent-wash); }
	.cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
	.cols h3 { margin-top: 0; }
	.cols p { margin: 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
	@media (max-width: 1100px) { .groups { grid-template-columns: 1fr 1fr; } .cols { grid-template-columns: 1fr 1fr; } }
	@media (max-width: 720px) { .page { padding: 10px 12px 40px; } .head { flex-direction: column; align-items: flex-start; } .head .in { width: 100%; } .groups, .cols { grid-template-columns: 1fr; } }
</style>