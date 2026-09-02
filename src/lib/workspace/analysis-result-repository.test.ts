import { describe, expect, it } from 'vitest';
import type { WorkspaceAnalysisResult } from './types.js';
import {
	AnalysisResultReferenceError,
	AnalysisResultRepository,
	AnalysisResultRepositoryUnavailableError,
	InMemoryAnalysisResultAdapter,
	IndexedDbAnalysisResultAdapter,
	analysisResultContentHash,
	analysisResultSections,
	createAnalysisResultRef,
	createBrowserAnalysisResultRepository,
	stableAnalysisResultJson
} from './analysis-result-repository.js';

const population = {
	membershipBasis: 'current_workspace_members' as const,
	analyzedCount: 3,
	definitionHash: 'definition:one',
	cohortHash: 'cohort:one',
	peerRecipe: {
		name: 'Current screen',
		basis: 'screen' as const,
		states: [],
		assetRange: { min: null, max: null },
		active: 'active' as const,
		metricConditions: [],
		minimumPeers: 1,
		maximumPeers: 100
	},
	excludedCount: 2
};

const lineage = {
	sourceMode: 'live' as const,
	sourceAsOf: '20260630',
	retrievedAt: '2026-08-30T00:00:00.000Z',
	release: '20260630',
	releaseGeneration: 'generation-7'
};

function cohortResult(): WorkspaceAnalysisResult {
	return {
		id: 'cohort-change-one',
		kind: 'cohort_change',
		basedOnRevision: 4,
		publishedRevision: 5,
		title: 'How the cohort changed',
		population,
		lineage,
		spec: {
			from: '20250331',
			to: '20260331',
			metrics: ['asset', 'dep'],
			groupBy: 'state'
		},
		transition: {
			period: { opening: '20250331', closing: '20260331' },
			cohort: { definition: 'caller_supplied_exact_entities', count: 3 },
			metrics: [
				{ metric: 'asset', marker: 'first' },
				{ metric: 'dep', marker: 'second' },
				{ metric: 'lnlsnet', marker: 'third' }
			],
			groups: [
				{ key: 'CA', label: 'California', cohort: 2, metrics: [] },
				{ key: 'NY', label: 'New York', cohort: 1, metrics: [] }
			]
		}
	} as unknown as WorkspaceAnalysisResult;
}

function temporalResult(): WorkspaceAnalysisResult {
	return {
		id: 'temporal-one',
		kind: 'temporal_pattern',
		basedOnRevision: 5,
		publishedRevision: 6,
		title: 'Repeated deposit growth',
		population,
		lineage,
		spec: {
			metrics: ['dep'],
			periodWindow: { startPeriod: '20250331', endPeriod: '20260331' },
			requiredPeriods: [],
			minimumObservations: 4,
			gapPolicy: 'allow_missing',
			tolerance: 0,
			pattern: { kind: 'direction_count', direction: 'increase', atLeast: 3 }
		},
		counts: { cohort: 3, matched: 2, notMatched: 1, insufficientData: 0 },
		rows: [
			{ cert: 1, name: 'One', state: 'CA', evaluations: [] },
			{ cert: 2, name: 'Two', state: 'NY', evaluations: [] },
			{ cert: 3, name: 'Three', state: 'CA', evaluations: [] }
		]
	} as WorkspaceAnalysisResult;
}

function compositionResult(): WorkspaceAnalysisResult {
	return {
		id: 'composition-one',
		kind: 'financial_composition',
		basedOnRevision: 6,
		publishedRevision: 7,
		title: 'Funding mix',
		population,
		lineage,
		spec: {
			composition: 'funding_mix',
			scope: 'selected_banks',
			cert: null,
			period: '20260630',
			compareFrom: null
		},
		scopeLabel: 'Selected banks',
		memberCerts: [3, 1, 2],
		analysis: {
			id: 'funding_mix',
			components: [
				{ id: 'deposits', label: 'Deposits' },
				{ id: 'equity', label: 'Equity' }
			]
		}
	} as unknown as WorkspaceAnalysisResult;
}

function failureResult(): WorkspaceAnalysisResult {
	const analogue = (rank: number) => ({
		rank,
		cert: 7000 + rank,
		name: `Analogue ${rank}`,
		city: 'Sample',
		state: 'PA',
		asOf: '20260630',
		distance: rank / 10,
		coverageAdjustedDistance: rank / 10,
		coverage: {
			observedCells: 16,
			referenceCells: 16,
			expectedCells: 16,
			missingBankCells: 0,
			unavailableReferenceCells: 0,
			ratio: 1
		},
		featureContributions: [
			{
				metric: 'roa',
				label: 'Return on assets',
				observedPeriods: 8,
				expectedPeriods: 8,
				coverage: 1,
				rmsStandardizedDistance: 0.4,
				squaredDistanceShare: 0.7,
				observations: [{ relativeQuarter: -1, bankValue: 0.2, patternMedian: -0.1, standardizedDifference: 0.3 }]
			},
			{
				metric: 'noncurrent_loan_ratio',
				label: 'Noncurrent loan ratio',
				observedPeriods: 8,
				expectedPeriods: 8,
				coverage: 1,
				rmsStandardizedDistance: 0.2,
				squaredDistanceShare: 0.3,
				observations: [{ relativeQuarter: -1, bankValue: 1.2, patternMedian: 1.1, standardizedDifference: 0.1 }]
			}
		]
	});
	return {
		id: 'failure-one',
		kind: 'failure_pattern',
		basedOnRevision: 7,
		publishedRevision: 8,
		title: 'Historical failure paths',
		population,
		lineage,
		spec: { startYear: 2007, endYear: 2012, quarters: 8, limit: 25 },
		result: {
			historicalCohort: { members: [{ cert: 1 }] },
			eventStudy: { series: [{ metric: 'roa', points: [] }] },
			currentAnalogues: { data: [analogue(1), analogue(2)] }
		}
	} as unknown as WorkspaceAnalysisResult;
}

describe('analysis result identity', () => {
	it('normalizes object keys and produces the standard SHA-256 identity', () => {
		expect(stableAnalysisResultJson({ z: 1, nested: { b: 2, a: 1 }, omitted: undefined }))
			.toBe('{"nested":{"a":1,"b":2},"z":1}');
		expect(analysisResultContentHash('')).toBe(
			'sha256:12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126'
		);
		expect(analysisResultContentHash({ b: 2, a: 1 }))
			.toBe(analysisResultContentHash({ a: 1, b: 2 }));
	});

	it('includes exact release, scope, and normalized query identity in a ref', () => {
		const result = cohortResult();
		const ref = createAnalysisResultRef(result);
		expect(ref).toMatchObject({
			version: 1,
			kind: 'cohort_change',
			resultId: 'cohort-change-one',
			release: {
				sourceMode: 'live',
				sourceAsOf: '20260630',
				release: '20260630',
				releaseGeneration: 'generation-7'
			},
			scope: {
				membershipBasis: 'current_workspace_members',
				analyzedCount: 3,
				definitionHash: 'definition:one',
				cohortHash: 'cohort:one',
				excludedCount: 2
			},
			query: {
				kind: 'cohort_change',
				spec: result.spec
			}
		});
		expect(ref.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(ref.query.queryHash).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});

describe('AnalysisResultRepository', () => {
	it('puts, gets, isolates, and deletes a content-addressed result', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const result = cohortResult();
		const firstRef = await repository.put(result);
		const secondRef = await repository.put(cohortResult());
		expect(secondRef).toEqual(firstRef);

		const fetched = await repository.get(firstRef);
		expect(fetched).toEqual(result);
		if (fetched) fetched.title = 'Mutated outside storage';
		expect((await repository.get(firstRef))?.title).toBe('How the cohort changed');

		const wrongRef = { ...firstRef, resultId: 'some-other-result' };
		expect(await repository.get(wrongRef)).toBeNull();
		expect(await repository.delete(wrongRef)).toBe(false);
		expect(await repository.delete(firstRef)).toBe(true);
		expect(await repository.get(firstRef)).toBeNull();
	});

	it('pages known cohort sections with stable cursors and offsets', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const ref = await repository.put(cohortResult());
		expect(analysisResultSections(cohortResult())).toEqual(['metrics', 'groups']);

		const first = await repository.readPage(ref, 'metrics', { pageSize: 2 });
		expect(first).toMatchObject({ total: 3, offset: 0, pageSize: 2, nextOffset: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).toMatch(/^v1:[a-f0-9]{16}:metrics:2$/);

		const second = await repository.readPage(ref, 'metrics', {
			pageSize: 2,
			cursor: first.nextCursor!
		});
		expect(second).toMatchObject({ total: 3, offset: 2, nextOffset: null, nextCursor: null });
		expect(second.items).toEqual([{ metric: 'lnlsnet', marker: 'third' }]);

		const offsetPage = await repository.readPage(ref, 'groups', { pageSize: 1, offset: 1 });
		expect(offsetPage.items).toEqual([{ key: 'NY', label: 'New York', cohort: 1, metrics: [] }]);
	});

	it('returns a plain page when the caller passes a reactive proxy reference', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const ref = await repository.put(cohortResult());
		const reactiveRef = new Proxy(ref, {});

		const page = await repository.readPage(reactiveRef, 'metrics', { pageSize: 1 });

		expect(page.ref).toEqual(ref);
		expect(page.items).toEqual([{ metric: 'asset', marker: 'first' }]);
		expect(() => structuredClone(page)).not.toThrow();
	});

	it('exposes temporal rows and composition members/components', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const temporalRef = await repository.put(temporalResult());
		expect(analysisResultSections(temporalResult())).toEqual(['rows']);
		expect((await repository.readPage(temporalRef, 'rows')).total).toBe(3);

		const compositionRef = await repository.put(compositionResult());
		expect(analysisResultSections(compositionResult())).toEqual(['members', 'components']);
		expect((await repository.readPage(compositionRef, 'members')).items).toEqual([3, 1, 2]);
		expect((await repository.readPage(compositionRef, 'components')).items).toHaveLength(2);
	});

	it('keeps failure analogue rankings compact while preserving complete drill-down evidence', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const result = failureResult();
		const ref = await repository.put(result);
		expect(analysisResultSections(result)).toEqual(['members', 'series', 'analogues', 'analogue_details']);

		const ranking = await repository.readPage(ref, 'analogues', { pageSize: 20 });
		expect(ranking.items).toHaveLength(2);
		expect(ranking.items[0]).toMatchObject({ rank: 1, cert: 7001 });
		expect((ranking.items[0] as { topDrivers: unknown[] }).topDrivers).toEqual(expect.arrayContaining([
			expect.objectContaining({ metric: 'roa', squaredDistanceShare: 0.7 })
		]));
		expect(ranking.items[0]).not.toHaveProperty('featureContributions');

		const details = await repository.readPage(ref, 'analogue_details', { pageSize: 1 });
		expect(details.items[0]).toMatchObject({ cert: 7001 });
		const detail = details.items[0] as { featureMatrices: Array<{ relativeQuarters: number[]; bankValues: Array<number | null>; patternMedians: Array<number | null> }> };
		expect(detail.featureMatrices[0]).toEqual(expect.objectContaining({
			relativeQuarters: [-1], bankValues: [0.2], patternMedians: [-0.1]
		}));
	});

	it('rejects invalid limits, unavailable sections, and foreign cursors', async () => {
		const repository = new AnalysisResultRepository(new InMemoryAnalysisResultAdapter());
		const cohortRef = await repository.put(cohortResult());
		const temporalRef = await repository.put(temporalResult());

		await expect(repository.readPage(cohortRef, 'metrics', { pageSize: 0 })).rejects.toThrow(RangeError);
		await expect(repository.readPage(cohortRef, 'metrics', { pageSize: 101 })).rejects.toThrow(RangeError);
		await expect(repository.readPage(cohortRef, 'rows')).rejects.toThrow(AnalysisResultReferenceError);
		const temporalPage = await repository.readPage(temporalRef, 'rows', { pageSize: 1 });
		await expect(repository.readPage(cohortRef, 'metrics', {
			cursor: temporalPage.nextCursor!
		})).rejects.toThrow(AnalysisResultReferenceError);
	});
});

describe('browser repository selection', () => {
	it('is SSR safe and falls back to a session-only in-memory adapter', async () => {
		const indexedDb = new IndexedDbAnalysisResultAdapter({
			databaseName: `bankgraph-test-${Math.random()}`
		});
		expect(await indexedDb.isAvailable()).toBe(false);
		const repository = await createBrowserAnalysisResultRepository();
		expect(repository.adapter).toBeInstanceOf(InMemoryAnalysisResultAdapter);
		expect(await repository.isAvailable()).toBe(true);
	});

	it('can fail explicitly when persistence is required', async () => {
		await expect(createBrowserAnalysisResultRepository({ fallbackToMemory: false }))
			.rejects.toThrow(AnalysisResultRepositoryUnavailableError);
	});
});
