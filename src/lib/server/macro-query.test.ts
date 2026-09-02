import { describe, expect, it } from 'vitest';
import { MacroQueryError, parseMacroQuery } from './macro-query';

describe('parseMacroQuery', () => {
	it('normalizes an allowlisted series and accepts a real calendar date', () => {
		expect(parseMacroQuery('ust10y', new URLSearchParams('from=2024-02-29&to=2025-02-28'), '2025-02-28')).toEqual({
			seriesId: 'UST10Y',
			from: '2024-02-29',
			to: '2025-02-28',
			limit: 5000
		});
	});

	it('defaults to a bounded ten-year window', () => {
		expect(parseMacroQuery('BLS_CPI_YOY', new URLSearchParams(), '2026-08-30')).toEqual({
			seriesId: 'BLS_CPI_YOY',
			from: '2016-08-30',
			to: '2026-08-30',
			limit: 5000
		});
	});

	it('rejects cache-key cardinality and date abuse', () => {
		expect(() => parseMacroQuery('NOT_A_SERIES', new URLSearchParams())).toThrowError(
			new MacroQueryError('Unknown macro series')
		);
		expect(() => parseMacroQuery('UST10Y', new URLSearchParams('from=2024-02-31'))).toThrow(/real calendar date/);
		expect(() => parseMacroQuery('UST10Y', new URLSearchParams('from=2024-01-01&from=2024-02-01'))).toThrow(/Duplicate/);
		expect(() => parseMacroQuery('UST10Y', new URLSearchParams('from=2010-01-01&to=2026-01-01'))).toThrow(/10-year/);
		expect(() => parseMacroQuery('UST10Y', new URLSearchParams('limit=5001'))).toThrow(/between/);
	});
});
