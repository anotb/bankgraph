import { describe, expect, it } from 'vitest';
import {
	deriveCohortTransition,
	type CohortTransitionEntity
} from './cohort-transition';

const OPENING = '20250331';
const CLOSING = '20250630';

function entity(
	id: number,
	opening: Record<string, number | null>,
	closing: Record<string, number | null>,
	group?: { key: string; label: string } | null
): CohortTransitionEntity {
	return {
		id,
		name: `Bank ${id}`,
		state: id % 2 ? 'CA' : 'TX',
		...(group !== undefined ? { group } : {}),
		rows: [
			{ period: OPENING, values: opening },
			{ period: '20250415', values: { asset: 9_999 } },
			{ period: CLOSING, values: closing }
		]
	} as CohortTransitionEntity;
}

describe('deriveCohortTransition', () => {
	it('derives additive breadth, matched totals, gross movement, and symmetric contributors', () => {
		const result = deriveCohortTransition({
			openingPeriod: OPENING,
			closingPeriod: CLOSING,
			metrics: ['asset'],
			entities: [
				entity(1, { asset: 100 }, { asset: 120 }),
				entity(2, { asset: 200 }, { asset: 180 }),
				entity(3, { asset: 0 }, { asset: 10 }),
				entity(4, { asset: 50 }, { asset: 50 })
			]
		});
		const asset = result.metrics[0];

		expect(asset.coverage).toMatchObject({ paired: 4, primaryChangeEligible: 3 });
		expect(asset.breadth).toMatchObject({
			increasing: 2, decreasing: 1, unchanged: 1,
			increasingShare: 50, decreasingShare: 25, unchangedShare: 25,
			equality: 'exact_endpoint_value'
		});
		expect(asset.distribution.primaryChange.median).toBe(0);
		expect(asset.additiveMatchedTotals).toMatchObject({ opening: 350, closing: 360, change: 10 });
		expect(asset.additiveMatchedTotals?.percentChange).toBeCloseTo(2.857142857);
		expect(asset.movement).toMatchObject({ positive: 30, negativeAbsolute: 20, grossAbsolute: 50, net: 10 });
		expect(asset.topMovers.increases.map((mover) => mover.id)).toEqual([1, 3]);
		expect(asset.topMovers.increases.map((mover) => mover.shareOfGrossMovement)).toEqual([40, 20]);
		expect(asset.topMovers.decreases[0]).toMatchObject({ id: 2, shareOfGrossMovement: 40 });
		expect(asset.movement.concentration).toEqual({ top1Share: 40, top5Share: 100, top10Share: 100 });
	});

	it('keeps distribution-only metrics unsummed and uses linear interpolation quantiles', () => {
		const result = deriveCohortTransition({
			openingPeriod: OPENING,
			closingPeriod: CLOSING,
			metrics: ['roa'],
			entities: [0, 10, 20, 30].map((change, index) =>
				entity(index + 1, { roa: 1 }, { roa: 1 + change })
			)
		});
		const roa = result.metrics[0];

		expect(roa.additiveMatchedTotals).toBeNull();
		expect(roa.distribution.primaryChange).toMatchObject({ p25: 7.5, median: 15, p75: 22.5 });
		expect(roa.movement.grossAbsolute).toBe(60);
	});

	it('uses per-metric denominators and classifies exact equality without tolerance', () => {
		const result = deriveCohortTransition({
			openingPeriod: OPENING,
			closingPeriod: CLOSING,
			metrics: ['asset', 'roa'],
			entities: [
				entity(1, { asset: 100, roa: null }, { asset: 100, roa: 2 }),
				entity(2, { asset: null, roa: 1 }, { asset: 200, roa: 1 }),
				entity(3, { asset: 50, roa: 3 }, { asset: 50 + 1e-12, roa: 4 })
			]
		});
		const [asset, roa] = result.metrics;

		expect(asset.coverage).toMatchObject({ paired: 2, openingOnly: 0, closingOnly: 1, neither: 0 });
		expect(roa.coverage).toMatchObject({ paired: 2, openingOnly: 0, closingOnly: 1, neither: 0 });
		expect(asset.breadth).toMatchObject({ increasing: 1, decreasing: 0, unchanged: 1 });
		expect(roa.breadth).toMatchObject({ increasing: 1, decreasing: 0, unchanged: 1 });
	});

	it('reconciles group gross movement and additive net change to the metric summary', () => {
		const result = deriveCohortTransition({
			openingPeriod: OPENING,
			closingPeriod: CLOSING,
			metrics: ['asset', 'roa'],
			entities: [
				entity(1, { asset: 100, roa: 1 }, { asset: 140, roa: 2 }, { key: 'west', label: 'West' }),
				entity(2, { asset: 200, roa: 2 }, { asset: 180, roa: 1 }, { key: 'south', label: 'South' }),
				entity(3, { asset: 50, roa: 3 }, { asset: 50, roa: 3 }, null)
			]
		});
		const asset = result.metrics[0];
		const assetGroups = result.groups.map((group) => group.metrics.find((metric) => metric.metric === 'asset')!);

		expect(result.groups.map((group) => group.key)).toEqual(['south', 'ungrouped', 'west']);
		expect(assetGroups.reduce((total, group) => total + group.grossMovement, 0)).toBe(asset.movement.grossAbsolute);
		expect(assetGroups.reduce((total, group) => total + group.additiveNetChange!, 0)).toBe(asset.additiveMatchedTotals?.change);
		expect(assetGroups.reduce((total, group) => total + group.shareOfMetricGrossMovement, 0)).toBeCloseTo(100);
		expect(result.groups.every((group) => group.metrics.find((metric) => metric.metric === 'roa')?.additiveNetChange === null)).toBe(true);
	});

	it('is deterministic, does not mutate callers, and ignores unrelated periods', () => {
		const entities = [
			entity(10, { asset: 100 }, { asset: 110 }),
			entity(2, { asset: 100 }, { asset: 110 })
		];
		const before = structuredClone(entities);
		const forward = deriveCohortTransition({
			openingPeriod: OPENING, closingPeriod: CLOSING, metrics: ['asset'], entities
		});
		const reversed = deriveCohortTransition({
			openingPeriod: OPENING, closingPeriod: CLOSING, metrics: ['asset'], entities: [...entities].reverse()
		});

		expect(entities).toEqual(before);
		expect(forward.metrics[0].additiveMatchedTotals?.closing).toBe(220);
		expect(forward.metrics[0].topMovers.increases.map((mover) => mover.id)).toEqual([2, 10]);
		expect(reversed.metrics[0].topMovers).toEqual(forward.metrics[0].topMovers);
	});

	it('returns bounded empty statistics and rejects ambiguous identities or endpoint rows', () => {
		const empty = deriveCohortTransition({
			openingPeriod: OPENING, closingPeriod: CLOSING, metrics: ['asset'], entities: []
		}).metrics[0];
		expect(empty.coverage.paired).toBe(0);
		expect(empty.distribution.primaryChange.median).toBeNull();
		expect(empty.movement).toMatchObject({ grossAbsolute: 0, net: 0 });
		expect(empty.movement.concentration.top10Share).toBe(0);

		const duplicate = entity(1, { asset: 1 }, { asset: 2 });
		expect(() => deriveCohortTransition({
			openingPeriod: OPENING, closingPeriod: CLOSING, metrics: ['asset'], entities: [duplicate, duplicate]
		})).toThrow('Duplicate cohort entity');
		const duplicatePeriod = structuredClone(duplicate);
		duplicatePeriod.rows.push({ period: OPENING, values: { asset: 3 } });
		expect(() => deriveCohortTransition({
			openingPeriod: OPENING, closingPeriod: CLOSING, metrics: ['asset'], entities: [duplicatePeriod]
		})).toThrow('Duplicate period');
	});
});
