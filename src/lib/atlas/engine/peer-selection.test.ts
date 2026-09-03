import { describe, expect, it } from 'vitest';
import { nearestSizePeerCerts } from './peer-selection';

describe('nearestSizePeerCerts', () => {
	it('keeps the subject first and chooses the closest balance-sheet scales', () => {
		const subject = { cert: 1, total_assets: 1_000 };
		const candidates = [
			{ cert: 2, total_assets: 2_000 },
			{ cert: 3, total_assets: 900 },
			{ cert: 4, total_assets: 1_100 },
			{ cert: 5, total_assets: 400 },
			{ cert: 1, total_assets: 1_000 }
		];

		expect(nearestSizePeerCerts(subject, candidates, 4)).toEqual([1, 4, 3, 2]);
	});
});
