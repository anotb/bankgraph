<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock } from '$lib/workspace/types';
	import Waterfall from '$lib/atlas/charts/Waterfall.svelte';
	import { effective } from './util';
	import { quarterLabel, shortBankName, usdThousands } from '$lib/atlas/format';

	interface Bridge { metric: string; unit: string; from: { repdte: string; value: number }; to: { repdte: string; value: number }; totalChange: number; contributions: Array<{ key: string; label: string; change: number; availability: string }>; residual: number; dataCoverage: number; method: string; reconciliation: string }
	interface Brief { bank: { name: string }; comparison: { status: string; isConsecutiveQuarter: boolean; message: string | null }; bridges: Record<string, Bridge> | null }

	let { block, span }: { block: ResearchBoardBlock; span: number } = $props();
	const board = Board.use();
	let e = $derived(effective(board, block));
	let cert = $derived(board.state.activeBank && e.certs.includes(board.state.activeBank) ? board.state.activeBank : e.certs[0] ?? null);
	let which = $derived(board.overrides[block.id]?.attributionMode ?? 'assets');
	let brief = $state<Brief | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	const cache = new Map<string, Brief>();

	$effect(() => {
		const c = cert, from = e.compareWith, to = e.asOf;
		if (!c) { brief = null; return; }
		const key = `${c}:${from}:${to}`;
		if (cache.has(key)) { brief = cache.get(key)!; return; }
		const controller = new AbortController();
		loading = true; error = null;
		fetch(`/api/v1/banks/${c}/quarter-brief?from=${from}&to=${to}`, { signal: controller.signal })
			.then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = (await r.json()) as Brief; cache.set(key, b); brief = b; })
			.catch((err) => { if (err.name !== 'AbortError') error = 'Attribution is unavailable for this pair of quarters.'; })
			.finally(() => (loading = false));
		return () => controller.abort();
	});
	let bridge = $derived(brief?.bridges?.[which] ?? null);
	let reported = $derived((bridge?.contributions ?? []).filter((c) => c.availability === 'reported').sort((a, b) => Math.abs(b.change) - Math.abs(a.change)));
	/** A true waterfall is only honest when the components reconcile to the reported total. */
	let reconciled = $derived(Boolean(bridge && bridge.reconciliation === 'reconciled' && Math.abs(bridge.residual) < Math.max(1, Math.abs(bridge.totalChange) * 0.001)));
	let maxAbs = $derived(Math.max(1, ...reported.map((c) => Math.abs(c.change)), Math.abs(bridge?.residual ?? 0)));
	const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${usdThousands(Math.abs(v))}`;
	const LABELS = { assets: 'Total assets', funding: 'Deposits and funding', quarterlyNetIncome: 'Quarterly net income', loanToDeposit: 'Loans to deposits' } as const;
</script>

{#if !cert}
	<div class="empty">Add a bank to see what moved.</div>
{:else}
	<div class="hd">
		<div class="seg">{#each Object.entries(LABELS) as [k, l]}{#if brief?.bridges?.[k] || k === 'assets'}<button type="button" aria-pressed={which === k} onclick={() => board.setOverride(block.id, { attributionMode: k as typeof which })}>{l}</button>{/if}{/each}</div>
		<span class="dim">{shortBankName(board.data.institutions[cert]?.name ?? String(cert))} · {quarterLabel(e.compareWith)} → {quarterLabel(e.asOf)}</span>
	</div>
	{#if loading && !bridge}
		<div class="empty">Loading components…</div>
	{:else if error}
		<div class="empty">{error}</div>
	{:else if bridge}
		<div class="total"><span class="mono">{usdThousands(bridge.from.value)} → {usdThousands(bridge.to.value)}</span><b class="mono {bridge.totalChange >= 0 ? 'up' : 'down'}">{fmt(bridge.totalChange)}</b>{#if reconciled}<span class="dim">reconciles to the reported total</span>{:else}<span class="dim">coverage {Math.round(bridge.dataCoverage * 100)}% · residual {fmt(bridge.residual)}</span>{/if}</div>
		{#if !reported.length}
			<div class="empty">No component bridge is reported for this measure{bridge.method ? ` (${bridge.method.replace(/_/g, ' ')})` : ''}.</div>
		{:else if reconciled}
			<Waterfall start={{ label: quarterLabel(bridge.from.repdte), value: bridge.from.value }} end={{ label: quarterLabel(bridge.to.repdte), value: bridge.to.value }} steps={reported.map((c) => ({ label: c.label, code: c.key.toUpperCase(), value: c.change }))} format={(v) => usdThousands(v, 3)} formatDelta={fmt} height={span >= 8 ? 220 : 200} />
		{:else}
			<div class="scroll">
				<table class="atlas contrib">
					<thead><tr><th>Component</th><th>Change</th><th class="bar-h">Contribution</th><th>Source</th></tr></thead>
					<tbody>
						{#each reported as c}
							<tr><td class="n">{c.label}</td><td class={c.change >= 0 ? 'up' : 'down'}>{fmt(c.change)}</td><td class="bar-c"><span class="bar" class:neg={c.change < 0} style="--w:{Math.round((Math.abs(c.change) / maxAbs) * 100)}%"><i></i></span></td><td class="mono dim">{c.key.toUpperCase()}</td></tr>
						{/each}
						{#if bridge.residual}
							<tr class="residual"><td class="n">Residual <span class="dim">reported total − sum of components</span></td><td>{fmt(bridge.residual)}</td><td class="bar-c"><span class="bar faint" class:neg={bridge.residual < 0} style="--w:{Math.round((Math.abs(bridge.residual) / maxAbs) * 100)}%"><i></i></span></td><td class="mono dim">—</td></tr>
						{/if}
					</tbody>
				</table>
			</div>
		{/if}
		{#if brief && !brief.comparison.isConsecutiveQuarter}<div class="readout"><span class="warn">These quarters are not consecutive; the bridge spans more than one filing.</span></div>{/if}
	{:else}
		<div class="empty">{brief?.comparison.message ?? 'No bridge is reported for this measure.'}</div>
	{/if}
{/if}

<style>
	.hd { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
	.dim { color: var(--ink-3); font-size: 12px; }
	.total { display: flex; align-items: baseline; gap: 12px; font-size: 12.5px; color: var(--ink-2); margin-bottom: 8px; flex-wrap: wrap; }
	.total b { font-size: 15px; font-weight: 600; }
	.warn { color: var(--caution); }
	.contrib th.bar-h { text-align: left; }
	.contrib td.bar-c { text-align: left; min-width: 160px; }
	.bar { display: inline-block; width: 100%; height: 8px; position: relative; }
	.bar i { position: absolute; top: 0; bottom: 0; left: 0; width: var(--w); background: var(--accent); border-radius: 2px; }
	.bar.neg i { background: var(--adverse); }
	.bar.faint i { background: var(--ink-4); }
	.residual td { color: var(--ink-2); border-top: 2px solid var(--rule); }
</style>
