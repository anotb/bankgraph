import { describe, expect, it } from 'vitest';
import { _buildFinancialsCacheKey } from '../../routes/api/v1/banks/[cert]/financials/+server';

describe('buildFinancialsCacheKey', () => {
	it('isolates otherwise identical queries with different limits', () => {
		const shortHistory = _buildFinancialsCacheKey(628, 'cert,repdte,roa', null, null, 4);
		const longHistory = _buildFinancialsCacheKey(628, 'cert,repdte,roa', null, null, 40);

		expect(shortHistory).not.toBe(longHistory);
		expect(shortHistory).toBe('fin:628:cert,repdte,roa:::4');
		expect(longHistory).toBe('fin:628:cert,repdte,roa:::40');
	});
});
