import { describe, expect, it } from 'vitest';
import { isFdicReportingDate, parseFdicReportingDate } from './fdic-reporting-date';

describe('FDIC reporting dates', () => {
	it('accepts exact calendar-quarter ends', () => {
		expect(parseFdicReportingDate('20240331')).toBe('20240331');
		expect(parseFdicReportingDate(20241231)).toBe('20241231');
		expect(isFdicReportingDate('20260930')).toBe(true);
	});

	it('rejects missing, malformed, and non-quarter dates', () => {
		for (const value of [undefined, '', '=HYPERLINK("https://example.test")', '20240231', '20240630x']) {
			expect(() => parseFdicReportingDate(value)).toThrow(/FDIC quarter end/);
		}
		expect(isFdicReportingDate('20240231')).toBe(false);
	});
});
