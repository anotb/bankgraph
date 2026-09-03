import type {
	ResearchBoardAnchorConfiguration,
	ResearchBoardAnchorSource,
	ResearchBoardBlock
} from '$lib/workspace/types';
import type { Board } from '../board.svelte';
import { metricValue, quartersBetween, type ResearchMetric } from '$lib/atlas/engine/metrics';
import { BOARD_TEMPLATES } from '$lib/atlas/templates';

function isCuratedTemplateBlock(id: string): boolean {
	return BOARD_TEMPLATES.some((template) => {
		const suffix = id.slice(template.id.length + 1);
		return id.startsWith(`${template.id}-`) && /^\d+$/.test(suffix);
	});
}

/**
 * Curated layouts are live views of the board selection. Older saved boards predate
 * the explicit sidecar flag, so recognize their stable template block IDs too.
 * A source-bound history or table starts with its stored selection, but a person or
 * agent can reconnect it to the board or replace that selection at any time.
 */
export function followsWorkspace(board: Board, block: ResearchBoardBlock): boolean {
	if ('anchorConfig' in block && block.anchorConfig) {
		return block.anchorConfig.bankSource === 'workspace'
			&& block.anchorConfig.metricSource === 'workspace'
			&& block.anchorConfig.periodSource === 'workspace';
	}
	const configured = board.overrides[block.id]?.followWorkspace;
	if (configured !== undefined) return configured;
	if (block.kind === 'history' || block.kind === 'exact_table') return isCuratedTemplateBlock(block.id);
	return true;
}

function workspaceAnchorConfiguration(): ResearchBoardAnchorConfiguration {
	return { bankSource: 'workspace', metricSource: 'workspace', periodSource: 'workspace' };
}

/** Resolve old sidecar/source-bound behavior into the new independent policy. */
export function resolveAnchorConfiguration(
	board: Board,
	block: ResearchBoardBlock
): ResearchBoardAnchorConfiguration {
	if ('anchorConfig' in block && block.anchorConfig) return block.anchorConfig;
	const override = board.overrides[block.id];
	const pins = override?.pins ?? {};
	const followWorkspace = followsWorkspace(board, block);
	const fixedBinding = (block.kind === 'history' || block.kind === 'exact_table') && !followWorkspace;
	const bankSource: ResearchBoardAnchorSource = pins.certs?.length || fixedBinding ? 'fixed' : 'workspace';
	const metricSource: ResearchBoardAnchorSource = pins.metrics?.length || fixedBinding ? 'fixed' : 'workspace';
	const fixedBindingPeriods = block.kind === 'history'
		? !followWorkspace
		: block.kind === 'exact_table'
			? !followWorkspace && !block.binding.followCurrent
			: false;
	const periodSource: ResearchBoardAnchorSource = pins.asOf || pins.compareWith || fixedBindingPeriods ? 'fixed' : 'workspace';
	const certs = pins.certs?.length
		? pins.certs
		: fixedBinding && (block.kind === 'history' || block.kind === 'exact_table')
			? block.binding.certs
			: board.selectedCerts;
	const metrics = (pins.metrics?.length
		? pins.metrics
		: fixedBinding && (block.kind === 'history' || block.kind === 'exact_table')
			? block.binding.metrics
			: board.metrics) as ResearchMetric[];
	let historyFrom = board.historyFrom;
	let historyTo = board.historyTo;
	if (fixedBindingPeriods && block.kind === 'history') {
		historyFrom = pins.compareWith ?? block.binding.from;
		historyTo = pins.asOf ?? block.binding.to;
	}
	if (fixedBindingPeriods && block.kind === 'exact_table' && block.binding.from && block.binding.to) {
		historyFrom = pins.compareWith ?? block.binding.from;
		historyTo = pins.asOf ?? block.binding.to;
	}
	const asOf = pins.asOf ?? (periodSource === 'fixed' ? historyTo : board.asOf);
	const compareWith = pins.compareWith ?? (periodSource === 'fixed' ? historyFrom : board.compareWith);
	return {
		bankSource,
		metricSource,
		periodSource,
		...(bankSource === 'fixed' ? { certs: [...certs] } : {}),
		...(metricSource === 'fixed' ? { metrics: [...metrics] } : {}),
		...(periodSource === 'fixed' ? { asOf, compareWith, historyFrom, historyTo } : {})
	};
}

export interface ResearchBoardAnchorEdit {
	followWorkspace?: boolean;
	bankSource?: ResearchBoardAnchorSource;
	metricSource?: ResearchBoardAnchorSource;
	periodSource?: ResearchBoardAnchorSource;
	certs?: number[];
	metrics?: ResearchMetric[];
	asOf?: string;
	compareWith?: string;
	historyFrom?: string;
	historyTo?: string;
}

/** Apply one partial anchor edit without changing unrelated source policies. */
export function configureAnchorConfiguration(
	board: Board,
	block: ResearchBoardBlock,
	edit: ResearchBoardAnchorEdit
): ResearchBoardAnchorConfiguration {
	const scope = effective(board, block);
	let next = resolveAnchorConfiguration(board, block);
	const fixedAll = (): ResearchBoardAnchorConfiguration => ({
		bankSource: 'fixed', metricSource: 'fixed', periodSource: 'fixed',
		certs: [...scope.certs], metrics: [...scope.metrics],
		asOf: scope.asOf, compareWith: scope.compareWith,
		historyFrom: scope.from, historyTo: scope.to
	});
	if (edit.followWorkspace === true) next = workspaceAnchorConfiguration();
	else if (edit.followWorkspace === false) next = fixedAll();

	const setBankSource = (source: ResearchBoardAnchorSource) => {
		next = source === 'workspace'
			? { ...next, bankSource: source, certs: undefined }
			: { ...next, bankSource: source, certs: [...(edit.certs ?? scope.certs)] };
	};
	const setMetricSource = (source: ResearchBoardAnchorSource) => {
		next = source === 'workspace'
			? { ...next, metricSource: source, metrics: undefined }
			: { ...next, metricSource: source, metrics: [...(edit.metrics ?? scope.metrics)] };
	};
	const setPeriodSource = (source: ResearchBoardAnchorSource) => {
		next = source === 'workspace'
			? {
				...next, periodSource: source, asOf: undefined, compareWith: undefined,
				historyFrom: undefined, historyTo: undefined
			}
			: {
				...next, periodSource: source,
				asOf: edit.asOf ?? scope.asOf,
				compareWith: edit.compareWith ?? scope.compareWith,
				historyFrom: edit.historyFrom ?? scope.from,
				historyTo: edit.historyTo ?? scope.to
			};
	};

	if (edit.bankSource !== undefined) setBankSource(edit.bankSource);
	if (edit.certs !== undefined) setBankSource('fixed');
	if (edit.metricSource !== undefined) setMetricSource(edit.metricSource);
	if (edit.metrics !== undefined) setMetricSource('fixed');
	if (edit.periodSource !== undefined) setPeriodSource(edit.periodSource);
	if (edit.asOf !== undefined || edit.compareWith !== undefined || edit.historyFrom !== undefined || edit.historyTo !== undefined) {
		setPeriodSource('fixed');
		next = {
			...next,
			...(edit.asOf === undefined ? {} : { asOf: edit.asOf }),
			...(edit.compareWith === undefined ? {} : { compareWith: edit.compareWith }),
			...(edit.historyFrom === undefined ? {} : { historyFrom: edit.historyFrom }),
			...(edit.historyTo === undefined ? {} : { historyTo: edit.historyTo })
		};
		if (block.kind === 'history' && edit.asOf !== undefined && edit.historyTo === undefined) next = { ...next, historyTo: edit.asOf };
		if (block.kind === 'history' && edit.compareWith !== undefined && edit.historyFrom === undefined) next = { ...next, historyFrom: edit.compareWith };
	}
	return next;
}

/** Anchors a view actually uses after applying its independent source policies. */
export function effective(board: Board, block: ResearchBoardBlock) {
	const configuration = resolveAnchorConfiguration(board, block);
	const certs = configuration.bankSource === 'fixed' ? configuration.certs ?? [] : board.selectedCerts;
	const metrics = (configuration.metricSource === 'fixed' ? configuration.metrics ?? [] : board.metrics) as ResearchMetric[];
	const asOf = configuration.periodSource === 'fixed' ? configuration.asOf! : board.asOf;
	const compareWith = configuration.periodSource === 'fixed' ? configuration.compareWith! : board.compareWith;
	const from = configuration.periodSource === 'fixed' ? configuration.historyFrom! : board.historyFrom;
	const to = configuration.periodSource === 'fixed' ? configuration.historyTo! : board.historyTo;
	const quarters = quartersBetween(from, to < asOf ? asOf : to);
	return {
		certs, metrics, asOf, compareWith, from, to, quarters,
		pinned: configuration.bankSource === 'fixed' || configuration.metricSource === 'fixed' || configuration.periodSource === 'fixed',
		sources: {
			banks: configuration.bankSource,
			metrics: configuration.metricSource,
			periods: configuration.periodSource
		}
	};
}

/** Attach durable policy and refresh legacy binding snapshots for a single read/write truth. */
export function withAnchorConfiguration(
	board: Board,
	block: ResearchBoardBlock,
	anchorConfig: ResearchBoardAnchorConfiguration
): ResearchBoardBlock {
	if (block.kind !== 'history' && block.kind !== 'exact_table' && block.kind !== 'workspace_view') return block;
	const configured = { ...block, anchorConfig } as ResearchBoardBlock;
	const scope = effective(board, configured);
	if (configured.kind === 'history') {
		return {
			...configured,
			binding: {
				...configured.binding,
				certs: [...scope.certs], metrics: [...scope.metrics], from: scope.from, to: scope.to
			}
		};
	}
	if (configured.kind === 'exact_table') {
		return {
			...configured,
			binding: {
				...configured.binding,
				certs: [...scope.certs], metrics: [...scope.metrics],
				from: anchorConfig.periodSource === 'fixed' ? scope.from : null,
				to: anchorConfig.periodSource === 'fixed' ? scope.to : null,
				followCurrent: anchorConfig.periodSource === 'workspace'
			}
		};
	}
	return configured;
}

export function resolveBoardBlock(board: Board, block: ResearchBoardBlock): ResearchBoardBlock {
	return withAnchorConfiguration(board, block, resolveAnchorConfiguration(board, block));
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
