<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import { effective } from './util';
	import { metricValue, formatMetric, metricChange, researchMetricDefinition } from '$lib/atlas/engine/metrics';
	import { quarterLabel, shortBankName, seriesColor } from '$lib/atlas/format';

	let { block }: { block: ResearchBoardBlock } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let follow = $derived(block.kind !== 'exact_table' || block.binding.followCurrent);
	let oneBank = $derived(e.certs.length === 1 && !follow);
	let sortKey = $state<string | null>(null);
	let sortBasis = $state<'level' | 'change'>('level');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let userSorted = $state(false);
	let configuredSort = $state('');
	$effect(() => {
		const configured = board.overrides[block.id];
		const nextConfiguredSort = JSON.stringify([
			configured?.sortMetric ?? null,
			configured?.sortBasis ?? null,
			configured?.sortDirection ?? null,
		]);
		// A person can sort locally by clicking a header. A later board/agent setting is
		// explicit shared state, so it takes over immediately and remains visible.
		if (configuredSort !== nextConfiguredSort) {
			configuredSort = nextConfiguredSort;
			userSorted = false;
		}
		if (userSorted) return;
		sortKey = configured?.sortMetric ?? board.activeMetric;
		sortBasis = configured?.sortBasis ?? 'level';
		sortDir = configured?.sortDirection ?? 'desc';
	});
	let rows = $derived.by(() => {
		const list = e.certs.map((cert, i) => ({ cert, i, name: shortBankName(board.data.institutions[cert]?.name ?? String(cert)), state: board.data.institutions[cert]?.state ?? '', values: Object.fromEntries(e.metrics.map((m) => [m, metricValue(m, board.data.rows[cert], e.asOf, board.data.institutions[cert])])) as Record<string, number | null> }));
		if (!sortKey) return list;
		return list.sort((a, b) => {
			const value = (row: typeof a) => sortBasis === 'change'
				? metricChange(sortKey! as Parameters<typeof metricChange>[0], row.values[sortKey!], metricValue(sortKey! as Parameters<typeof metricValue>[0], board.data.rows[row.cert], e.compareWith, board.data.institutions[row.cert])).value
				: row.values[sortKey!];
			return ((value(a) ?? -Infinity) - (value(b) ?? -Infinity)) * (sortDir === 'asc' ? 1 : -1);
		});
	});
	function sortBy(m: string) { userSorted = true; sortBasis = 'level'; if (sortKey === m) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortKey = m; sortDir = 'desc'; } }
</script>

{#if !e.certs.length}
	<div class="empty">Add banks to fill the table.</div>
{:else if oneBank}
	<div class="scroll">
		<table class="atlas">
			<thead><tr><th>Quarter</th>{#each e.metrics as m}<th>{researchMetricDefinition(m).shortLabel}</th>{/each}</tr></thead>
			<tbody>
				{#each [...e.quarters].reverse() as q}
					<tr class:focus={q === e.asOf} onclick={() => board.setAsOf(q)}>
						<td class="n mono">{quarterLabel(q, 'long')}</td>
						{#each e.metrics as m}<td>{formatMetric(m, metricValue(m, board.data.rows[e.certs[0]], q, board.data.institutions[e.certs[0]]))}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="scroll">
		<table class="atlas">
			<thead><tr><th>Institution</th><th>HQ</th>{#each e.metrics as m}<th><button type="button" class="sort" onclick={() => sortBy(m)}>{researchMetricDefinition(m).shortLabel}{sortKey === m ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>{/each}</tr></thead>
			<tbody>
				{#each rows as r}
					<tr class:focus={board.state.activeBank === r.cert} onclick={() => board.setActiveBank(r.cert)} onmouseenter={() => (board.hoverCert = r.cert)} onmouseleave={() => (board.hoverCert = null)}>
						<td class="n"><i class="dot" style="background:{seriesColor(r.i)}"></i><a href="/bank/{r.cert}" onclick={(ev) => ev.stopPropagation()}>{r.name}</a><span class="sub">{r.cert}</span></td>
						<td class="mono">{r.state}</td>
						{#each e.metrics as m}
							{@const ch = metricChange(m, r.values[m], metricValue(m, board.data.rows[r.cert], e.compareWith, board.data.institutions[r.cert]))}
							<td>{formatMetric(m, r.values[m])}<span class="chg {ch.favorable === true ? 'up' : ch.favorable === false ? 'down' : ''}">{ch.text}</span></td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
{#if !oneBank}<div class="readout"><span>{quarterLabel(e.asOf)} with change vs {quarterLabel(e.compareWith)}</span></div>{/if}

<style>
	.sort { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 0; }
	.sort:hover { color: var(--ink); }
	.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
	td.n a { color: var(--ink); text-decoration: none; }
	td.n a:hover { color: var(--accent); }
	tr { cursor: pointer; }
</style>
