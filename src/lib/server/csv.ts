const SPREADSHEET_FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

/**
 * Encode one RFC 4180-style CSV cell and neutralize spreadsheet formulas.
 *
 * Only string values receive the protective apostrophe. Numeric values remain
 * numeric, so legitimate negative balances and ratios keep their spreadsheet
 * behavior.
 */
export function encodeCsvCell(value: unknown): string {
	if (value === null || value === undefined) return '';

	let text: string;
	if (typeof value === 'number') {
		text = Number.isFinite(value) ? String(value) : '';
	} else {
		text = String(value);
		if (SPREADSHEET_FORMULA_PREFIX.test(text)) {
			text = `'${text}`;
		}
	}

	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export function encodeCsvRow(values: readonly unknown[]): string {
	return values.map(encodeCsvCell).join(',');
}
