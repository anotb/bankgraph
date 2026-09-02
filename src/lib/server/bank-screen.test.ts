import { describe, expect, it } from 'vitest';
import {
	BankScreenInputError,
	compileBankScreen,
	parseBankScreenRequest
} from './bank-screen';
import {
	BankScreenRecipeError,
	bankScreenRequestFromRecipe,
	bankScreenSearchParams,
	type BankScreenRequest
} from '$lib/bank-screen';

function parse(parameters: Record<string, string>) {
	return parseBankScreenRequest(new URLSearchParams(parameters));
}

describe('bank screen request and compiler', () => {
	it('compiles mixed conditions with allowlisted SQL and bound values', () => {
		const request = parse({
			q: 'community',
			state: 'NC,VA',
			active: 'active',
			asset_min: '100000',
			conditions: JSON.stringify([
				{ metric: 'roa', operator: 'gte', value: 1.2 },
				{ metric: 'noncurrentLoanRatio', operator: 'between', value: 0, upperValue: 2 },
				{ metric: 'employees', operator: 'ne', value: 10 }
			]),
			sort: 'roa',
			order: 'desc',
			limit: '20',
			offset: '30'
		});
		const compiled = compileBankScreen(request);

		expect(compiled.whereSql).toContain('INSTR(LOWER(name), LOWER(?)) > 0');
		expect(compiled.whereSql).toContain('state IN (?, ?)');
		expect(compiled.whereSql).toContain('latest_roa IS NOT NULL AND latest_roa >= ?');
		expect(compiled.whereSql).toContain('latest_npl_ratio IS NOT NULL AND latest_npl_ratio BETWEEN ? AND ?');
		expect(compiled.whereSql).toContain('num_employees IS NOT NULL AND num_employees != ?');
		expect(compiled.params).toEqual(['community', 'NC', 'VA', 1, 100000, 1.2, 0, 2, 10]);
		expect(compiled.sortSql).toBe('latest_roa IS NULL ASC, latest_roa DESC, name ASC, cert ASC');
		expect(compiled.offset).toBe(30);
	});

	it('makes null behavior explicit for every comparison including not-equal', () => {
		const request = parse({
			active: 'any',
			conditions: JSON.stringify([{ metric: 'roe', operator: 'ne', value: 0 }])
		});
		expect(compileBankScreen(request).whereSql).toContain(
			'latest_roe IS NOT NULL AND latest_roe != ?'
		);
	});

	it('rejects condition, value, sort, and result bounds', () => {
		const thirteen = Array.from({ length: 13 }, () => ({ metric: 'roa', operator: 'gt', value: 0 }));
		expect(() => parse({ conditions: JSON.stringify(thirteen) })).toThrow(/at most 12/);
		expect(() => parse({ conditions: JSON.stringify([{ metric: 'employees', operator: 'gt', value: 1.5 }]) }))
			.toThrow(/integer for employees/);
		expect(() => parse({ conditions: JSON.stringify([{ metric: 'deposits', operator: 'gt', value: -1 }]) }))
			.toThrow(/finite number from 0/);
		expect(() => parse({ sort: 'latest_roa' })).toThrow(/sort must be one of/);
		expect(() => parse({ limit: '1001' })).toThrow(/limit must be between 1 and 1000/);
		expect(() => parse({ offset: '100001' })).toThrow(/offset must be between 0 and 100000/);
		expect(() => parse({ q: 'é'.repeat(61) })).toThrow(/UTF-8 bytes/);
	});

	it('rejects SQL-shaped metric and operator names while keeping search text parameterized', () => {
		expect(() => parse({
			conditions: JSON.stringify([{ metric: 'latest_roa) OR 1=1 --', operator: 'gt', value: 0 }])
		})).toThrow(/metric must be one of/);
		expect(() => parse({
			conditions: JSON.stringify([{ metric: 'roa', operator: '>= 0 OR 1=1 --', value: 0 }])
		})).toThrow(/operator must be one of/);

		const attack = `%') OR 1=1 --`;
		const compiled = compileBankScreen(parse({ q: attack }));
		expect(compiled.whereSql).not.toContain(attack);
		expect(compiled.params).toContain(attack);
	});

	it('converts workspace filters and peer recipes into the same URL contract', () => {
		const request = bankScreenRequestFromRecipe({
			query: 'regional',
			states: ['NC'],
			active: 'active',
			assetRange: { min: 1000, max: null },
			metricConditions: [{ metric: 'nimy', operator: 'gte', value: 3, upperValue: null }]
		}, { sort: 'nim', order: 'desc', limit: 40 });
		const params = bankScreenSearchParams(request);

		expect(params.get('q')).toBe('regional');
		expect(params.get('conditions')).toContain('"metric":"nim"');
		expect(parseBankScreenRequest(params)).toEqual(request);

		expect(() => bankScreenRequestFromRecipe({
			states: [], active: 'active', assetRange: { min: null, max: null },
			metricConditions: [{ metric: 'loanGrowth', operator: 'gt', value: 5, upperValue: null }]
		})).toThrowError(BankScreenRecipeError);
	});

	it('maps canonical capital, office, and employee workspace ids to stored screen metrics', () => {
		const request = bankScreenRequestFromRecipe({
			states: [],
			active: 'active',
			assetRange: { min: null, max: null },
			metricConditions: [
				{ metric: 'rbc1rwaj', operator: 'gte', value: 10, upperValue: null },
				{ metric: 'offdom', operator: 'gt', value: 5, upperValue: null },
				{ metric: 'numemp', operator: 'between', value: 100, upperValue: 500 }
			]
		});

		expect(request.conditions).toEqual([
			{ metric: 'tier1Ratio', operator: 'gte', value: 10, upperValue: null },
			{ metric: 'domesticOffices', operator: 'gt', value: 5, upperValue: null },
			{ metric: 'employees', operator: 'between', value: 100, upperValue: 500 }
		]);
		expect(parseBankScreenRequest(bankScreenSearchParams(request)).conditions).toEqual(request.conditions);
	});

	it('validates programmatic service requests as well as URL input', () => {
		const request = parse({});
		expect(() => compileBankScreen({ ...request, states: ['NC', 'NC'] } as BankScreenRequest))
			.toThrowError(new BankScreenInputError('state must not contain duplicate codes'));
	});
});
