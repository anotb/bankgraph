<script lang="ts">
	import { Board } from '../board.svelte';
	import type { ResearchBoardBlock, WorkspaceAnalysisResult } from '$lib/workspace/types';
	import type { CompositionChange, CompositionSnapshot } from '$lib/analytics/composition';
	import { resolveAnalysis } from './analysis';
	import { count, pct, quarterLabel, signed, usdThousands } from '$lib/atlas/format';

	let { block }: { block: ResearchBoardBlock & { kind: 'analysis' }; span: number } = $props();
	const board = Board.use();
	let result = $state<WorkspaceAnalysisResult | null>(null);
	let missing = $state(false);
	$effect(() => { resolveAnalysis(block.binding.resultRef, board.state.analysisResult).then((r) => { if (r) result = r; else missing = true; }); });

	function value(value: number | null | undefined, unit?: string): string {
		if (value == null) return '—';
		if (unit === 'usd_thousands') return usdThousands(value);
		if (unit === 'percent') return pct(value);
		return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
	}

	function change(value: number | null | undefined, unit?: string): string {
		if (value == null) return '—';
		if (unit === 'usd_thousands') return `${value >= 0 ? '+' : '−'}${usdThousands(Math.abs(value))}`;
		if (unit === 'percent') return signed(value, 2, ' pp');
		return signed(value, 2);
	}

	function isCompositionChange(analysis: CompositionSnapshot | CompositionChange): analysis is CompositionChange {
		return 'from' in analysis;
	}

	function rows(): Array<Record<string, unknown>> {
		if (!result) return [];
		if (result.kind === 'temporal_pattern') return result.rows.map((r) => ({
			institution: r.name,
			state: r.state,
			measures: r.evaluations.length,
			observations: Math.min(...r.evaluations.map((e) => e.coverage.observedPeriodCount)),
			triggers: r.evaluations.reduce((sum, e) => sum + e.totalTriggerCount, 0),
			latest_trigger: [...new Set(r.evaluations.flatMap((e) => e.triggerPeriods))].sort().at(-1) ?? null
		}));
		if (result.kind === 'cohort_change') {
			if (block.binding.view === 'movers' || block.binding.view === 'waterfall') {
				return result.transition.metrics.flatMap((metric) => [
					...metric.topMovers.increases.map((r) => ({ measure: metric.label, institution: r.name, state: r.state, direction: 'increase', change: change(r.primaryChange, metric.unit), gross_share: pct(r.shareOfGrossMovement * 100, 1) })),
					...metric.topMovers.decreases.map((r) => ({ measure: metric.label, institution: r.name, state: r.state, direction: 'decrease', change: change(r.primaryChange, metric.unit), gross_share: pct(r.shareOfGrossMovement * 100, 1) }))
			]).slice(0, 50);
			}
			return result.transition.metrics.map((metric) => ({
				measure: metric.label,
				paired: metric.coverage.paired,
				up: metric.breadth.increasing,
				down: metric.breadth.decreasing,
				unchanged: metric.breadth.unchanged,
				median_change: change(metric.distribution.primaryChange.median, metric.unit),
				net_change: metric.additiveMatchedTotals ? change(metric.additiveMatchedTotals.change, metric.unit) : '—',
				top_5_share: pct(metric.movement.concentration.top5Share * 100, 1)
			}));
		}
		if (result.kind === 'financial_composition') {
			const analysis = result.analysis;
			return isCompositionChange(analysis)
				? analysis.components.map((component) => ({ component: component.label, from: pct(component.fromSharePercent), to: pct(component.toSharePercent), change: signed(component.shareChangePercentagePoints, 2, ' pp') }))
				: analysis.components.map((component) => ({ component: component.label, amount: value(component.value, 'usd_thousands'), share: pct(component.sharePercent), reporters: component.reporterCount }));
		}
		return [];
	}
	let data = $derived(rows());
	let columns = $derived(data.length ? Object.keys(data[0]).filter((k) => typeof data[0][k] !== 'object').slice(0, 8) : []);
	let title = $derived(result?.kind === 'cohort_change' ? 'Cohort movement' : result?.kind === 'temporal_pattern' ? 'Pattern search' : result?.kind === 'financial_composition' ? 'Financial composition' : 'Analysis');
</script>

{#if missing}
	<div class="empty">This analysis isn't stored in this browser. Run it again or ask a connected agent.</div>
{:else if !result}
	<div class="empty">Loading the analysis…</div>
{:else}
	<div class="hd"><span class="cap">{title}</span><span class="dim">{result.title} · {count(result.population.analyzedCount)} institution{result.population.analyzedCount === 1 ? '' : 's'}</span></div>
	{#if result.kind === 'cohort_change'}
		<div class="facts">
			<div><b>{quarterLabel(result.transition.period.opening)}</b><span>opening period</span></div>
			<div><b>{quarterLabel(result.transition.period.closing)}</b><span>closing period</span></div>
			<div><b>{count(result.transition.cohort.count)}</b><span>fixed cohort</span></div>
			<div><b>{count(result.transition.metrics.length)}</b><span>measures</span></div>
		</div>
	{:else if result.kind === 'temporal_pattern'}
		<div class="facts">
			<div><b>{count(result.counts.matched)}</b><span>matched</span></div>
			<div><b>{count(result.counts.notMatched)}</b><span>did not match</span></div>
			<div><b>{count(result.counts.insufficientData)}</b><span>insufficient data</span></div>
			<div><b>{count(result.spec.metrics.length)}</b><span>measures tested</span></div>
		</div>
	{:else if result.kind === 'financial_composition'}
		<div class="facts">
			<div><b>{quarterLabel(result.spec.period)}</b><span>current period</span></div>
			{#if result.spec.compareFrom}<div><b>{quarterLabel(result.spec.compareFrom)}</b><span>comparison period</span></div>{/if}
			<div><b>{count(result.memberCerts.length)}</b><span>reporters in scope</span></div>
			<div><b>{result.analysis.status.replace(/_/g, ' ')}</b><span>coverage</span></div>
		</div>
	{/if}
	{#if data.length}
		<div class="scroll">
			<table class="atlas"><thead><tr>{#each columns as c}<th>{c}</th>{/each}</tr></thead><tbody>{#each data.slice(0, 25) as r}<tr>{#each columns as c}<td class={typeof r[c] === 'string' ? 'n' : ''}>{typeof r[c] === 'number' ? (r[c] as number).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(r[c] ?? '—')}</td>{/each}</tr>{/each}</tbody></table>
		</div>
	{:else if result.kind === 'temporal_pattern'}
		<div class="empty">No institution in this cohort matches the complete pattern.</div>
	{:else}
		<div class="empty">The analysis completed, but there are no comparable rows to show.</div>
	{/if}
	<div class="readout"><span>FDIC BankFind · as of {quarterLabel(result.lineage.sourceAsOf)}</span><span style="margin-left:auto">{block.binding.view.replace(/_/g, ' ')}</span></div>
{/if}

<style>
	.empty { color: var(--ink-3); font-size: 12.5px; padding: 12px 0; }
	.hd { display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px; }
	.dim { color: var(--ink-3); font-size: 11.5px; }
	.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: 1px solid var(--rule); margin: 8px 0; }
	.facts div { min-width: 0; padding: 8px 10px 8px 0; }
	.facts b, .facts span { display: block; }
	.facts b { color: var(--ink); font-family: var(--font-mono); font-size: 13px; font-weight: 600; text-transform: capitalize; }
	.facts span { color: var(--ink-3); font-size: 10.5px; margin-top: 2px; }
	.scroll { max-height: 280px; overflow: auto; }
	@media (max-width: 640px) { .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
