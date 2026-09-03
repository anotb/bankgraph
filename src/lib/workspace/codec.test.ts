import { describe, expect, it } from 'vitest';
import {
	deserializeWorkspaceShare,
	deserializeWorkspaceSearchParams,
	migrateWorkspaceState,
	parseWorkspaceJson,
	serializeWorkspaceSearch,
	trySerializeWorkspaceSearch,
	WORKSPACE_SHARE_FINDING_SUMMARY_LENGTH,
	WORKSPACE_SHARE_MAX_ENCODED_LENGTH,
	WorkspaceShareBudgetError
} from './codec';
import { applyWorkspaceCommand, createDefaultWorkspaceState, workspaceCommands } from './state';
import { WorkspaceValidationError } from './validation';

function populatedState() {
	let state = createDefaultWorkspaceState();
	state = applyWorkspaceCommand(state, workspaceCommands.setQuestion('Compare crédit quality & ROA')).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setFilters({
		query: 'First Bank',
		states: ['TX', 'NY'],
		assetRange: { min: 1_000, max: 2_000_000 },
		active: 'active',
		metricConditions: [{ metric: 'roa', operator: 'gte', value: 0.8, upperValue: null }]
	})).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setResults({
		total: 42,
		returned: 10,
		latestQuarter: '20250331',
		refreshedAt: '2026-08-30T12:00:00Z',
		queryRevision: 'fdic-2025q1',
		truncated: true
	})).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setSelectedCerts([100, 200])).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setExcludedCerts([300])).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setPeriod({ kind: 'range', from: '20240331', to: '20250331' })).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setMapSelection({ states: ['CA'], certs: [100] })).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setScreenView({ sort: 'roa', order: 'asc' })).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setDepth('pro')).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setActiveMetric('roa')).state;
	state = applyWorkspaceCommand(state, workspaceCommands.setWatchlistDesired(100, true)).state;
	return state;
}

function version1Params(state = populatedState()): URLSearchParams {
	const params = new URLSearchParams(serializeWorkspaceSearch(state));
	const payload = JSON.parse(params.get('ws')!) as unknown[];
	payload.splice(17);
	params.set('wv', '1');
	params.set('ws', JSON.stringify(payload));
	return params;
}

describe('workspace URL codec', () => {
	it('roundtrips every state field and revision through compact versioned search params', () => {
		const input = populatedState();
		const encoded = serializeWorkspaceSearch(input);
		expect(encoded).toContain('wv=4');
		expect(encoded).toContain('ws=');
		expect(deserializeWorkspaceSearchParams(encoded)).toEqual(input);
	});

	it('accepts a leading question mark and uses defaults for empty params', () => {
		const encoded = `?${serializeWorkspaceSearch(populatedState())}`;
		expect(deserializeWorkspaceSearchParams(encoded)).toEqual(populatedState());
		expect(deserializeWorkspaceSearchParams('')).toEqual(createDefaultWorkspaceState());
	});

	it('parses legacy version 1 URLs without depth as guided', () => {
		const params = version1Params();
		const payload = JSON.parse(params.get('ws')!) as unknown[];
		payload.pop();
		payload.pop();
		payload.pop();
		params.set('ws', JSON.stringify(payload));
		expect(deserializeWorkspaceSearchParams(params).depth).toBe('guided');
		expect(deserializeWorkspaceSearchParams(params).activeMetric).toBeNull();
		expect(deserializeWorkspaceSearchParams(params).screenView).toEqual({ sort: 'assets', order: 'desc' });
	});

	it('parses URLs created before activeMetric with a null focus', () => {
		const params = version1Params();
		const payload = JSON.parse(params.get('ws')!) as unknown[];
		payload.pop();
		payload.pop();
		params.set('ws', JSON.stringify(payload));
		expect(deserializeWorkspaceSearchParams(params)).toMatchObject({
			depth: 'pro',
			activeMetric: null,
			screenView: { sort: 'assets', order: 'desc' }
		});
	});

	it('parses URLs created before screen ordering with the visible legacy default', () => {
		const params = version1Params();
		const payload = JSON.parse(params.get('ws')!) as unknown[];
		payload.pop();
		params.set('ws', JSON.stringify(payload));
		expect(deserializeWorkspaceSearchParams(params)).toMatchObject({
			depth: 'pro',
			activeMetric: 'roa',
			screenView: { sort: 'assets', order: 'desc' }
		});
	});

	it('rejects malformed JSON, unsupported versions, and structurally invalid payloads', () => {
		expect(() => deserializeWorkspaceSearchParams('wv=1&ws=%7Bbad'))
			.toThrowError(/valid JSON/);
		expect(() => deserializeWorkspaceSearchParams('wv=99&ws=%5B%5D'))
			.toThrowError(/unsupported workspace version 99/);
		expect(() => deserializeWorkspaceSearchParams('wv=1&ws=%5B%5D'))
			.toThrowError(/14-, 15-, 16-, or 17-item version 1 payload/);
	});

	it('shares bounded public finding summaries with explicit truncation metadata', () => {
		const privateSuffix = 'DO-NOT-SHARE-THIS-PRIVATE-SUFFIX';
		const note = `${'Public analytical summary. '.repeat(20)}${privateSuffix}`;
		const state = applyWorkspaceCommand(populatedState(), workspaceCommands.setFindings([{
			id: 'f1',
			title: 'ROA finding',
			note,
			certs: [100],
			metrics: ['roa'],
			period: '20250331',
			source: `https://example.test/${'source/'.repeat(30)}`
		}])).state;
		const result = trySerializeWorkspaceSearch(state);
		expect(result.ok).toBe(true);
		if (!result.ok) throw result.error;
		expect(result.search.length).toBeLessThanOrEqual(WORKSPACE_SHARE_MAX_ENCODED_LENGTH);
		expect(decodeURIComponent(result.search)).not.toContain(privateSuffix);
		expect(result.search).toContain('wm=');
		expect(result.metadata).toMatchObject({
			findingNotesTruncated: 1,
			findingSourcesTruncated: 1
		});
		const decoded = deserializeWorkspaceShare(result.search);
		expect(Array.from(decoded.state.findings[0].note)).toHaveLength(WORKSPACE_SHARE_FINDING_SUMMARY_LENGTH);
		expect(decoded.state.findings[0].note.endsWith('…')).toBe(true);
		expect(decoded.state.findings[0].title).toBe('ROA finding');
		expect(decoded.metadata.findingNotesTruncated).toBe(1);
	});

	it('round-trips exact finding lineage in a public workspace', () => {
		const state = applyWorkspaceCommand(populatedState(), workspaceCommands.setFindings([{
			id: 'lineage-finding',
			title: 'ROA evidence',
			note: 'Reported ROA for the selected quarter.',
			certs: [100],
			metrics: ['roa'],
			period: '20250331',
			source: '/workspace?bank=100',
			provenance: {
				source: 'FDIC BankFind Financials',
				source_url: 'https://api.fdic.gov/banks/docs/',
				source_as_of: '20250331',
				retrieved_at: '2025-05-01T12:00:00.000Z',
				release: '20250331',
				release_generation: 'generation-42',
				source_fields: { roa: ['ROA'] },
				formulas: { roa: 'Net Income / Average Total Assets' },
				cohort_hash: 'fnv1a32:0123abcd'
			}
		}])).state;
		const decoded = deserializeWorkspaceShare(serializeWorkspaceSearch(state));

		expect(decoded.state.findings[0].provenance).toEqual({
			source: 'FDIC BankFind Financials',
			source_url: 'https://api.fdic.gov/banks/docs/',
			source_as_of: '20250331',
			retrieved_at: '2025-05-01T12:00:00.000Z',
			release: '20250331',
			release_generation: 'generation-42',
			source_fields: { roa: ['ROA'] },
			formulas: { roa: 'Net Income / Average Total Assets' },
			cohort_hash: 'fnv1a32:0123abcd'
		});
	});

	it('returns a typed safe result for adversarial max findings with Unicode notes', () => {
		const findings = Array.from({ length: 20 }, (_, index) => ({
			id: `unicode-${index}`,
			title: `Finding ${index}`,
			note: '😀'.repeat(2_000),
			certs: [100],
			metrics: ['roa'],
			period: '20250331',
			source: `/banks/100?finding=${index}`
		}));
		const state = applyWorkspaceCommand(populatedState(), workspaceCommands.setFindings(findings)).state;
		const result = trySerializeWorkspaceSearch(state);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected an over-budget result');
		expect(result.error).toBeInstanceOf(WorkspaceShareBudgetError);
		expect(result.metadata).toMatchObject({
			maxEncodedLength: WORKSPACE_SHARE_MAX_ENCODED_LENGTH,
			findingNotesTruncated: 20
		});
		expect(result.metadata.encodedLength).toBeGreaterThan(WORKSPACE_SHARE_MAX_ENCODED_LENGTH);
		expect(() => serializeWorkspaceSearch(state)).toThrowError(WorkspaceShareBudgetError);
	});

	it('fits 20 maximum-length ASCII notes by sharing summaries rather than note bodies', () => {
		const findings = Array.from({ length: 20 }, (_, index) => ({
			id: `ascii-${index}`,
			title: `F${index}`,
			note: 'n'.repeat(4_000),
			certs: [],
			metrics: [],
			period: null,
			source: `/finding/${index}`
		}));
		const state = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setFindings(findings)).state;
		const result = trySerializeWorkspaceSearch(state);
		expect(result.ok).toBe(true);
		if (!result.ok) throw result.error;
		expect(result.search.length).toBeLessThanOrEqual(WORKSPACE_SHARE_MAX_ENCODED_LENGTH);
		expect(result.metadata).toMatchObject({ findingNotesTruncated: 20 });
		expect(deserializeWorkspaceSearchParams(result.search).findings).toHaveLength(20);
	});

	it('rejects oversized inbound state before attempting JSON parsing', () => {
		const oversized = `wv=1&ws=${'not-json'.repeat(1_000)}`;
		try {
			deserializeWorkspaceSearchParams(oversized);
			throw new Error('expected an inbound budget error');
		} catch (error) {
			expect(error).toBeInstanceOf(WorkspaceShareBudgetError);
			expect(error).toMatchObject({ direction: 'inbound' });
		}
	});
});

describe('workspace migrations', () => {
	it('migrates an unversioned legacy full state without guessing unsafe values', () => {
		const migrated = migrateWorkspaceState({
			researchQuestion: 'Legacy question',
			selectedQuarter: '20241231',
			selectedCerts: [200, 100]
		});
		expect(migrated.migrated).toBe(true);
		expect(migrated.state).toMatchObject({
			version: 4,
			question: 'Legacy question',
			asOfQuarter: '20241231',
			comparison: {
				mode: 'prior-quarter',
				resolvedQuarter: '20240930'
			},
			chartHistory: { from: null, to: null },
			period: { kind: 'quarter', quarter: '20241231' },
			selectedCerts: [100, 200]
		});
	});

	it('parses persisted envelopes and rejects future versions clearly', () => {
		const state = populatedState();
		expect(parseWorkspaceJson(JSON.stringify({ version: 4, state })).state).toEqual(state);
		const {
			asOfQuarter: _asOfQuarter,
			comparison: _comparison,
			chartHistory: _chartHistory,
			...legacyState
		} = state;
		expect(parseWorkspaceJson(JSON.stringify({
			version: 1,
			state: { ...legacyState, version: 1 }
		}))).toMatchObject({
			migrated: true,
			state: {
				version: 4,
				asOfQuarter: '20250331',
				comparison: { mode: 'range-start', resolvedQuarter: '20240331' },
				chartHistory: { from: '20240331', to: '20250331' }
			}
		});
		expect(() => parseWorkspaceJson(JSON.stringify({ version: 7, state })))
			.toThrowError(/unsupported persistence version 7/);
		expect(() => migrateWorkspaceState({ version: 7 })).toThrowError(WorkspaceValidationError);
		expect(() => migrateWorkspaceState({ version: 7 })).toThrowError(/unsupported workspace version 7/);
	});

	it('migrates stored version 1 state created before depth and screen ordering existed', () => {
		const {
			depth: _depth,
			activeMetric: _activeMetric,
			screenView: _screenView,
			...legacy
		} = populatedState();
		const migrated = migrateWorkspaceState(legacy);
		expect(migrated).toMatchObject({
			migrated: true,
			state: {
				depth: 'guided',
				activeMetric: null,
				screenView: { sort: 'assets', order: 'desc' }
			}
		});
	});
});
