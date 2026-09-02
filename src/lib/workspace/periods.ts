import type {
	WorkspaceComparisonMode,
	WorkspaceComparisonPair,
	WorkspaceComparisonSelection,
	WorkspaceState
} from './types';

const COMPACT_QUARTER = /^(\d{4})Q([1-4])$/;
const DATE_QUARTER = /^(\d{4})(0331|0630|0930|1231)$/;
const QUARTER_ENDS = ['0331', '0630', '0930', '1231'] as const;

interface ParsedQuarter {
	ordinal: number;
	style: 'compact' | 'date';
}

/** Parse the two reporting-quarter formats accepted by workspace state. */
export function parseReportingQuarter(value: string): ParsedQuarter | null {
	const compact = COMPACT_QUARTER.exec(value);
	if (compact) {
		const year = Number(compact[1]);
		const quarterIndex = Number(compact[2]) - 1;
		return { ordinal: year * 4 + quarterIndex, style: 'compact' };
	}
	const date = DATE_QUARTER.exec(value);
	if (!date) return null;
	const year = Number(date[1]);
	const quarterIndex = QUARTER_ENDS.indexOf(date[2] as (typeof QUARTER_ENDS)[number]);
	return { ordinal: year * 4 + quarterIndex, style: 'date' };
}

export function shiftReportingQuarter(value: string, offset: number): string | null {
	const parsed = parseReportingQuarter(value);
	if (!parsed || !Number.isSafeInteger(offset)) return null;
	const ordinal = parsed.ordinal + offset;
	if (ordinal < 0) return null;
	const year = Math.floor(ordinal / 4);
	const quarterIndex = ordinal % 4;
	return parsed.style === 'compact'
		? `${year}Q${quarterIndex + 1}`
		: `${year}${QUARTER_ENDS[quarterIndex]}`;
}

export function compareReportingQuarters(left: string, right: string): number | null {
	const leftQuarter = parseReportingQuarter(left);
	const rightQuarter = parseReportingQuarter(right);
	if (!leftQuarter || !rightQuarter) return null;
	return leftQuarter.ordinal - rightQuarter.ordinal;
}

/**
 * Resolve comparison intent without consulting chart points or network data.
 * A comparison is only valid when it precedes the selected as-of quarter.
 */
export function resolveWorkspaceComparisonQuarter(
	asOfQuarter: string | null,
	comparison: Pick<
		WorkspaceComparisonSelection,
		'mode' | 'rangeStartQuarter' | 'customQuarter'
	>
): string | null {
	if (asOfQuarter === null || !parseReportingQuarter(asOfQuarter)) return null;
	let candidate: string | null;
	switch (comparison.mode) {
		case 'prior-quarter':
			candidate = shiftReportingQuarter(asOfQuarter, -1);
			break;
		case 'year-ago':
			candidate = shiftReportingQuarter(asOfQuarter, -4);
			break;
		case 'range-start':
			candidate = comparison.rangeStartQuarter;
			break;
		case 'custom':
			candidate = comparison.customQuarter;
			break;
	}
	if (candidate === null) return null;
	const order = compareReportingQuarters(candidate, asOfQuarter);
	return order !== null && order < 0 ? candidate : null;
}

export function resolvedWorkspaceComparison(
	asOfQuarter: string | null,
	mode: WorkspaceComparisonMode,
	rangeStartQuarter: string | null,
	customQuarter: string | null
): WorkspaceComparisonSelection {
	const comparison = {
		mode,
		rangeStartQuarter: mode === 'range-start' ? rangeStartQuarter : null,
		customQuarter: mode === 'custom' ? customQuarter : null
	};
	return {
		...comparison,
		resolvedQuarter: resolveWorkspaceComparisonQuarter(asOfQuarter, comparison)
	};
}

/**
 * The sole canonical analytical pair for matrices, evidence, attribution, and
 * WebMCP. Null means the current state does not yet identify two exact quarters.
 */
export function getWorkspaceComparisonPair(
	state: Pick<WorkspaceState, 'asOfQuarter' | 'comparison'>
): WorkspaceComparisonPair | null {
	const compareWith = resolveWorkspaceComparisonQuarter(
		state.asOfQuarter,
		state.comparison
	);
	if (state.asOfQuarter === null || compareWith === null) return null;
	return { asOf: state.asOfQuarter, compareWith, mode: state.comparison.mode };
}
