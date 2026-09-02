import type { ResearchBoardBlock } from '$lib/workspace/types';
import type { Board } from '../board.svelte';
import { metricValue, quartersBetween, type ResearchMetric } from '$lib/atlas/engine/metrics';

/** Anchors a view actually uses: the board's, unless the view pins its own. */
export function effective(board: Board, block: ResearchBoardBlock) {
	const override = board.overrides[block.id];
	const pins = override?.pins ?? {};
	let certs = pins.certs?.length ? pins.certs : board.selectedCerts;
	let metrics = (pins.metrics?.length ? pins.metrics : board.metrics) as ResearchMetric[];
	let from = board.historyFrom, to = board.historyTo;
	if (block.kind === 'history' && override?.followWorkspace !== true) {
		certs = pins.certs?.length ? pins.certs : block.binding.certs.length ? block.binding.certs : certs;
		metrics = (pins.metrics?.length ? pins.metrics : block.binding.metrics) as ResearchMetric[];
		from = block.binding.from; to = block.binding.to;
	}
	if (block.kind === 'exact_table' && override?.followWorkspace !== true) {
		certs = pins.certs?.length ? pins.certs : block.binding.certs.length ? block.binding.certs : certs;
		metrics = (pins.metrics?.length ? pins.metrics : block.binding.metrics) as ResearchMetric[];
		if (!block.binding.followCurrent && block.binding.from && block.binding.to) { from = block.binding.from; to = block.binding.to; }
	}
	const asOf = pins.asOf ?? board.asOf;
	const compareWith = pins.compareWith ?? board.compareWith;
	const quarters = quartersBetween(from, to < asOf ? asOf : to);
	return { certs, metrics, asOf, compareWith, from, to, quarters, pinned: Boolean(pins.asOf || pins.certs?.length || pins.metrics?.length) };
}

export function cohortBand(board: Board, metric: ResearchMetric, quarters: readonly string[]): { lo: (number | null)[]; hi: (number | null)[]; median: (number | null)[] } | null {
	const members = board.data.cohort;
	if (members.length < 5) return null;
	const lo: (number | null)[] = [], hi: (number | null)[] = [], med: (number | null)[] = [];
	for (const q of quarters) {
		const vals: number[] = [];
		for (const cert of members) { const v = metricValue(metric, board.data.rows[cert], q, board.data.institutions[cert]); if (v != null) vals.push(v); }
		if (vals.length < 5) { lo.push(null); hi.push(null); med.push(null); continue; }
		vals.sort((a, b) => a - b);
		const at = (p: number) => { const i = (vals.length - 1) * p, l = Math.floor(i), h = Math.ceil(i); return vals[l] + (vals[h] - vals[l]) * (i - l); };
		lo.push(at(0.25)); hi.push(at(0.75)); med.push(at(0.5));
	}
	return { lo, hi, median: med };
}

export function cohortValues(board: Board, metric: ResearchMetric, quarter: string): Array<{ cert: number; value: number }> {
	const out: Array<{ cert: number; value: number }> = [];
	for (const cert of board.data.cohort) { const v = metricValue(metric, board.data.rows[cert], quarter, board.data.institutions[cert]); if (v != null) out.push({ cert, value: v }); }
	return out;
}

export function percentileOf(values: number[], v: number, higherIsBetter = true): number | null {
	if (!values.length) return null;
	const below = values.filter((x) => (higherIsBetter ? x < v : x > v)).length;
	return Math.round((below / values.length) * 100);
}
