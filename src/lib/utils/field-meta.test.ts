import { describe, it, expect } from 'vitest';
import {
	fieldDefs,
	categoryLabels,
	categoryOrder,
	getFieldDef,
	getFieldLabel,
	getFieldDescription,
	getRegulatorName,
	getCharterClassName,
	getFieldLabelWithMdrm,
	getFieldMdrm
} from './field-meta';

describe('getFieldLabel', () => {
	it('returns label for known fields', () => {
		expect(getFieldLabel('asset')).toBe('Total Assets');
		expect(getFieldLabel('dep')).toBe('Total Deposits');
		expect(getFieldLabel('roa')).toBe('Return on Assets (ROA)');
		expect(getFieldLabel('nimy')).toBe('Net Interest Margin (NIM)');
	});

	it('returns the field key itself for unknown fields', () => {
		expect(getFieldLabel('unknown_field')).toBe('unknown_field');
		expect(getFieldLabel('')).toBe('');
	});
});

describe('getFieldDescription', () => {
	it('returns description for known fields', () => {
		expect(getFieldDescription('asset')).toBe(
			'Total assets reported in thousands of dollars.'
		);
	});

	it('returns empty string for unknown fields', () => {
		expect(getFieldDescription('nonexistent')).toBe('');
	});
});

describe('getFieldDef', () => {
	it('returns full definition for known fields', () => {
		const def = getFieldDef('roa');
		expect(def).toBeDefined();
		expect(def!.label).toBe('Return on Assets (ROA)');
		expect(def!.category).toBe('ratios');
		expect(def!.formula).toBe('Net Income / Average Total Assets');
		expect(def!.mdrm).toBe('UBPR2170');
	});

	it('returns undefined for unknown fields', () => {
		expect(getFieldDef('nonexistent')).toBeUndefined();
	});
});

describe('getRegulatorName', () => {
	it('returns full name for known codes', () => {
		expect(getRegulatorName('OCC')).toBe('Office of the Comptroller of the Currency');
		expect(getRegulatorName('FDIC')).toBe('Federal Deposit Insurance Corporation');
		expect(getRegulatorName('FRB')).toBe('Federal Reserve Board');
	});

	it('returns code itself for unknown codes', () => {
		expect(getRegulatorName('UNKNOWN')).toBe('UNKNOWN');
		expect(getRegulatorName('')).toBe('');
	});
});

describe('getCharterClassName', () => {
	it('returns full name for known codes', () => {
		expect(getCharterClassName('N')).toBe('National Bank');
		expect(getCharterClassName('NM')).toBe('State Non-Member Bank');
		expect(getCharterClassName('SB')).toBe('Savings Bank');
		expect(getCharterClassName('SM')).toBe('State Member Bank');
		expect(getCharterClassName('SA')).toBe('Savings Association');
		expect(getCharterClassName('OI')).toBe('Other Institution');
	});

	it('returns code itself for unknown codes', () => {
		expect(getCharterClassName('XX')).toBe('XX');
	});
});

describe('getFieldLabelWithMdrm', () => {
	it('returns label with MDRM code when present', () => {
		expect(getFieldLabelWithMdrm('roa')).toBe('Return on Assets (ROA) (UBPR2170)');
	});

	it('returns just label when no MDRM code', () => {
		expect(getFieldLabelWithMdrm('asset')).toBe('Total Assets');
	});

	it('returns field key for unknown fields', () => {
		expect(getFieldLabelWithMdrm('nonexistent')).toBe('nonexistent');
	});
});

describe('getFieldMdrm', () => {
	it('returns MDRM code for fields that have one', () => {
		expect(getFieldMdrm('roa')).toBe('UBPR2170');
		expect(getFieldMdrm('roe')).toBe('UBPR2180');
	});

	it('returns undefined for fields without MDRM', () => {
		expect(getFieldMdrm('asset')).toBeUndefined();
	});

	it('returns undefined for unknown fields', () => {
		expect(getFieldMdrm('nonexistent')).toBeUndefined();
	});
});

describe('fieldDefs structure', () => {
	it('has entries for all expected fields', () => {
		const expectedFields = [
			'asset', 'dep', 'eq', 'lnlsnet', 'netinc', 'roa', 'roe',
			'nimy', 'eeffr', 'rbcrwaj', 'nclnlsr', 'lnlsdepr', 'numemp'
		];
		for (const field of expectedFields) {
			expect(fieldDefs[field]).toBeDefined();
			expect(fieldDefs[field].label).toBeTruthy();
			expect(fieldDefs[field].description).toBeTruthy();
			expect(fieldDefs[field].category).toBeTruthy();
		}
	});

	it('every field has a valid category', () => {
		const validCategories = new Set(categoryOrder);
		for (const [key, def] of Object.entries(fieldDefs)) {
			expect(validCategories.has(def.category), `${key} has invalid category: ${def.category}`).toBe(true);
		}
	});
});

describe('categoryLabels', () => {
	it('has labels for all categories in categoryOrder', () => {
		for (const cat of categoryOrder) {
			expect(categoryLabels[cat]).toBeTruthy();
		}
	});

	it('has expected label values', () => {
		expect(categoryLabels.balance_sheet).toBe('Balance Sheet');
		expect(categoryLabels.income).toBe('Income Statement');
		expect(categoryLabels.ratios).toBe('Performance Ratios');
	});
});

describe('categoryOrder', () => {
	it('has 7 categories', () => {
		expect(categoryOrder).toHaveLength(7);
	});

	it('starts with balance_sheet and ends with general', () => {
		expect(categoryOrder[0]).toBe('balance_sheet');
		expect(categoryOrder[categoryOrder.length - 1]).toBe('general');
	});
});
