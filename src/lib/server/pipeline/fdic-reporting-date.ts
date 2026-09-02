const FDIC_QUARTER_END = /^\d{4}(0331|0630|0930|1231)$/;

/** Require an exact FDIC calendar-quarter end before storing or exporting it. */
export function parseFdicReportingDate(value: unknown, field = 'REPDTE'): string {
	const reportingDate = typeof value === 'string' || typeof value === 'number'
		? String(value).trim()
		: '';
	if (!FDIC_QUARTER_END.test(reportingDate)) {
		throw new Error(`${field} must be an FDIC quarter end in YYYYMMDD format`);
	}
	return reportingDate;
}

export function isFdicReportingDate(value: unknown): value is string {
	return typeof value === 'string' && FDIC_QUARTER_END.test(value);
}
