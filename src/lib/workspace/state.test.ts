import { describe, expect, it } from 'vitest';
import type { ChartSpec, PinnedFinding } from './types';
import {
	WorkspaceRevisionConflictError,
	applyWorkspaceCommand,
	createDefaultWorkspaceState,
	workspaceCommands
} from './state';
import { WorkspaceValidationError, normalizeWorkspaceState } from './validation';
import { getWorkspaceComparisonPair, shiftReportingQuarter } from './periods';

const chart = (id: string, metrics: string[], visible = true): ChartSpec => ({
	id,
	title: id,
	kind: 'line',
	metrics,
	certs: [100, 200],
	scale: 'percent',
	stacked: false,
	visible
});

const finding = (id: string): PinnedFinding => ({
	id,
	title: `Finding ${id}`,
	note: 'Traceable note',
	certs: [100],
	metrics: ['roa'],
	period: '20250331',
	source: '/api/v1/banks/100'
});

describe('workspace command reducer', () => {
	it('creates a valid deterministic default', () => {
		const left = createDefaultWorkspaceState();
		const right = createDefaultWorkspaceState();
		expect(left).toEqual(right);
		expect(normalizeWorkspaceState(left)).toEqual(left);
		expect(left.revision).toBe(0);
	});

	it('never mutates input and increments revision once per material command', () => {
		const input = createDefaultWorkspaceState();
		const result = applyWorkspaceCommand(input, workspaceCommands.setQuestion('  Why did ROA move?  '));
		expect(input.question).toBe('');
		expect(result).toMatchObject({ changed: true, revision: 1 });
		expect(result.state.question).toBe('Why did ROA move?');
	});

	it('absolute setters are idempotent and canonicalize unordered set inputs', () => {
		const first = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setSelectedCerts([300, 100, 300, 200])
		);
		expect(first.state.selectedCerts).toEqual([100, 200, 300]);
		const repeat = applyWorkspaceCommand(first.state, workspaceCommands.setSelectedCerts([200, 300, 100]));
		expect(repeat.changed).toBe(false);
		expect(repeat.revision).toBe(1);
	});

	it('canonicalizes states and multiple metric conditions', () => {
		const state = createDefaultWorkspaceState();
		const result = applyWorkspaceCommand(state, workspaceCommands.setFilters({
			query: '  community ',
			states: ['ny', 'CA', 'NY'],
			assetRange: { min: 100, max: 500 },
			active: 'active',
			metricConditions: [
				{ metric: 'roa', operator: 'gte', value: 1, upperValue: null },
				{ metric: 'npl_ratio', operator: 'between', value: 0, upperValue: 2 }
			]
		}));
		expect(result.state.filters.query).toBe('community');
		expect(result.state.filters.states).toEqual(['CA', 'NY']);
		expect(result.state.filters.metricConditions).toHaveLength(2);
	});

	it('stores screen ordering as an idempotent revisioned command', () => {
		const first = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setScreenView({ sort: 'roa', order: 'asc' }),
			{ ifRevision: 0 }
		);
		expect(first).toMatchObject({
			changed: true,
			revision: 1,
			state: { screenView: { sort: 'roa', order: 'asc' } }
		});
		expect(applyWorkspaceCommand(
			first.state,
			workspaceCommands.setScreenView({ sort: 'roa', order: 'asc' }),
			{ ifRevision: 1 }
		)).toMatchObject({ changed: false, revision: 1 });
		expect(() => applyWorkspaceCommand(
			first.state,
			workspaceCommands.setScreenView({ sort: 'name', order: 'desc' }),
			{ ifRevision: 0 }
		)).toThrowError(WorkspaceRevisionConflictError);
		expect(() => normalizeWorkspaceState({
			...first.state,
			screenView: { sort: 'unsupported', order: 'asc' }
		})).toThrowError(/workspace.screenView.sort must be one of/);
	});

	it('supports optimistic concurrency and reports expected/current revisions', () => {
		const first = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setActivePanel('map'), { ifRevision: 0 });
		expect(() => applyWorkspaceCommand(first.state, workspaceCommands.setActivePanel('charts'), { ifRevision: 0 }))
			.toThrowError(WorkspaceRevisionConflictError);
		try {
			applyWorkspaceCommand(first.state, workspaceCommands.setActivePanel('charts'), { ifRevision: 0 });
		} catch (error) {
			expect(error).toMatchObject({ expected: 0, actual: 1 });
		}
	});

	it('sets workspace depth absolutely, idempotently, and with revision protection', () => {
		const first = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setDepth('pro'),
			{ ifRevision: 0 }
		);
		expect(first.state.depth).toBe('pro');
		expect(first).toMatchObject({ changed: true, revision: 1 });
		const repeat = applyWorkspaceCommand(first.state, workspaceCommands.setDepth('pro'), { ifRevision: 1 });
		expect(repeat).toMatchObject({ changed: false, revision: 1 });
		expect(() => applyWorkspaceCommand(first.state, workspaceCommands.setDepth('guided'), { ifRevision: 0 }))
			.toThrowError(WorkspaceRevisionConflictError);
	});

	it('changes only depth and revision when switching a populated workspace to Pro', () => {
		const input = normalizeWorkspaceState({
			...createDefaultWorkspaceState(),
			revision: 12,
			question: 'How are deposits funding loan growth?',
			filters: {
				...createDefaultWorkspaceState().filters,
				states: ['MA', 'NY'],
				assetRange: { min: 1_000_000, max: 50_000_000 }
			},
			results: {
				total: 87,
				returned: 87,
				latestQuarter: '20260630',
				refreshedAt: null,
				queryRevision: 'live-screen',
				truncated: false
			},
			activeBank: 100,
			selectedCerts: [100, 200],
			period: { kind: 'range', from: '20250331', to: '20260630' },
			charts: [chart('linked-analysis', ['asset', 'dep'])],
			activeMetric: 'dep',
			mapSelection: { states: ['MA'], certs: [100] }
		});
		const result = applyWorkspaceCommand(input, workspaceCommands.setDepth('pro'), {
			ifRevision: 12
		});

		expect(result).toMatchObject({ changed: true, revision: 13 });
		expect({ ...result.state, depth: input.depth, revision: input.revision }).toEqual(input);
	});

	it('shares active metric focus as an absolute, validated state transition', () => {
		const first = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setActiveMetric('npl_ratio'),
			{ ifRevision: 0 }
		);
		expect(first).toMatchObject({ changed: true, revision: 1, state: { activeMetric: 'npl_ratio' } });
		expect(applyWorkspaceCommand(
			first.state,
			workspaceCommands.setActiveMetric('npl_ratio'),
			{ ifRevision: 1 }
		)).toMatchObject({ changed: false, revision: 1 });
		expect(() => applyWorkspaceCommand(
			first.state,
			workspaceCommands.setActiveMetric(null),
			{ ifRevision: 0 }
		)).toThrowError(WorkspaceRevisionConflictError);
		expect(() => normalizeWorkspaceState({ ...first.state, activeMetric: '<script>' }))
			.toThrowError(/workspace.activeMetric contains unsupported characters/);
	});

	it('retains explicit false desired watchlist state and makes retries no-ops', () => {
		const first = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setWatchlistDesired(123, false));
		expect(first.state.watchlistDesired).toEqual([{ cert: 123, watched: false }]);
		const repeat = applyWorkspaceCommand(first.state, workspaceCommands.setWatchlistDesired(123, false));
		expect(repeat.changed).toBe(false);
	});

	it('upserts charts and findings by stable id and removal is idempotent', () => {
		const withChart = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.upsertChart(chart('risk', ['roa'])));
		const updated = applyWorkspaceCommand(withChart.state, workspaceCommands.upsertChart({ ...chart('risk', ['roa']), title: 'Risk trend' }));
		expect(updated.state.charts).toHaveLength(1);
		expect(updated.state.charts[0].title).toBe('Risk trend');

		const withFinding = applyWorkspaceCommand(updated.state, workspaceCommands.upsertFinding(finding('f1')));
		const removed = applyWorkspaceCommand(withFinding.state, workspaceCommands.removeFinding('f1'));
		const repeatedRemoval = applyWorkspaceCommand(removed.state, workspaceCommands.removeFinding('f1'));
		expect(repeatedRemoval.changed).toBe(false);
	});

	it('keeps the as-of quarter, comparison basis, and chart history independent', () => {
		const asOf = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setAsOfQuarter('20260630'),
			{ ifRevision: 0 }
		);
		expect(asOf).toMatchObject({
			changed: true,
			revision: 1,
			state: {
				asOfQuarter: '20260630',
				comparison: { mode: 'prior-quarter', resolvedQuarter: '20260331' },
				chartHistory: { from: null, to: null }
			}
		});

		const history = applyWorkspaceCommand(
			asOf.state,
			workspaceCommands.setChartHistory({ from: '20200331', to: '20260630' }),
			{ ifRevision: 1 }
		);
		expect(history.state.asOfQuarter).toBe('20260630');
		expect(history.state.comparison).toMatchObject({
			mode: 'prior-quarter',
			resolvedQuarter: '20260331'
		});

		const comparison = applyWorkspaceCommand(
			history.state,
			workspaceCommands.setComparison({ mode: 'year-ago', rangeStartQuarter: null, customQuarter: null }),
			{ ifRevision: 2 }
		);
		expect(comparison.state).toMatchObject({
			asOfQuarter: '20260630',
			comparison: { mode: 'year-ago', resolvedQuarter: '20250630' },
			chartHistory: { from: '20200331', to: '20260630' }
		});
		expect(getWorkspaceComparisonPair(comparison.state)).toEqual({
			asOf: '20260630',
			compareWith: '20250630',
			mode: 'year-ago'
		});
	});

	it('resolves every comparison mode to one exact analytical pair', () => {
		let state = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setAsOfQuarter('2026Q2')
		).state;
		expect(getWorkspaceComparisonPair(state)).toEqual({
			asOf: '2026Q2', compareWith: '2026Q1', mode: 'prior-quarter'
		});

		state = applyWorkspaceCommand(
			state,
			workspaceCommands.setChartHistory({ from: '2024Q1', to: '2026Q2' })
		).state;
		state = applyWorkspaceCommand(
			state,
			workspaceCommands.setComparison({
				mode: 'range-start',
				rangeStartQuarter: '2024Q1',
				customQuarter: null
			})
		).state;
		expect(getWorkspaceComparisonPair(state)).toEqual({
			asOf: '2026Q2', compareWith: '2024Q1', mode: 'range-start'
		});
		state = applyWorkspaceCommand(
			state,
			workspaceCommands.setChartHistory({ from: '2025Q1', to: '2026Q2' })
		).state;
		expect(getWorkspaceComparisonPair(state)).toEqual({
			asOf: '2026Q2', compareWith: '2024Q1', mode: 'range-start'
		});

		state = applyWorkspaceCommand(
			state,
			workspaceCommands.setComparison({
				mode: 'custom',
				rangeStartQuarter: null,
				customQuarter: '2025Q3'
			})
		).state;
		expect(getWorkspaceComparisonPair(state)).toEqual({
			asOf: '2026Q2', compareWith: '2025Q3', mode: 'custom'
		});
		expect(shiftReportingQuarter('20260331', -4)).toBe('20250331');
	});

	it('makes absolute period retries no-ops and rejects stale revisions', () => {
		const first = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setAsOfQuarter('20251231'),
			{ ifRevision: 0 }
		);
		expect(applyWorkspaceCommand(
			first.state,
			workspaceCommands.setAsOfQuarter('20251231'),
			{ ifRevision: 1 }
		)).toMatchObject({ changed: false, revision: 1 });
		expect(() => applyWorkspaceCommand(
			first.state,
			workspaceCommands.setComparison({ mode: 'year-ago', rangeStartQuarter: null, customQuarter: null }),
			{ ifRevision: 0 }
		)).toThrowError(WorkspaceRevisionConflictError);
	});
});

describe('workspace invariants and bounds', () => {
	it('limits selected banks to 10', () => {
		expect(() => applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setSelectedCerts(Array.from({ length: 11 }, (_, index) => index + 1))
		)).toThrowError(/at most 10/);
	});

	it('limits distinct metrics across visible chart specs to 6', () => {
		expect(() => applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setCharts([
				chart('one', ['m1', 'm2', 'm3']),
				chart('two', ['m4', 'm5', 'm6', 'm7'])
			])
		)).toThrowError(/at most 6 distinct metrics/);
		const accepted = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setCharts([
				chart('one', ['m1', 'm2', 'm3']),
				chart('draft', ['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'], false)
			])
		);
		expect(accepted.changed).toBe(true);
	});

	it('limits pinned findings to 20', () => {
		expect(() => applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setFindings(Array.from({ length: 21 }, (_, index) => finding(`f${index}`)))
		)).toThrowError(/at most 20/);
	});

	it('rejects overlap between selected and excluded certificates', () => {
		const selected = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setSelectedCerts([100]));
		expect(() => applyWorkspaceCommand(selected.state, workspaceCommands.setExcludedCerts([100, 200])))
			.toThrowError(/cannot be both selected and excluded/);
	});

	it('rejects invalid ranges, conditions, and unsafe untrusted values with paths', () => {
		expect(() => applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setFilters({
			...createDefaultWorkspaceState().filters,
			assetRange: { min: 500, max: 100 }
		}))).toThrowError(/assetRange minimum must not exceed maximum/);
		expect(() => applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setFilters({
			...createDefaultWorkspaceState().filters,
			metricConditions: [{ metric: 'roa', operator: 'between', value: 2, upperValue: null }]
		}))).toThrowError(/upperValue is required/);
		expect(() => normalizeWorkspaceState({ ...createDefaultWorkspaceState(), activeBank: '__proto__' }))
			.toThrowError(WorkspaceValidationError);
		expect(() => normalizeWorkspaceState({ ...createDefaultWorkspaceState(), depth: 'expert' }))
			.toThrowError(/workspace.depth must be one of guided, pro/);
	});
});
