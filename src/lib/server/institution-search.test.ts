import { describe, expect, it } from 'vitest';
import { buildInstitutionSearchSql } from './institution-search';

describe('buildInstitutionSearchSql', () => {
	it('searches certificate, name, city, and state with bounded parameters', () => {
		const search = buildInstitutionSearchSql('  628  ');

		expect(search.condition).toContain('CAST(cert AS TEXT) = ?');
		expect(search.condition).toContain('LOWER(name)');
		expect(search.condition).toContain("LOWER(COALESCE(city, ''))");
		expect(search.condition).toContain("LOWER(COALESCE(state, ''))");
		expect(search.conditionParams).toEqual(['628', '628', '628', '628']);
	});

	it('ranks exact certificate and name matches before broader matches', () => {
		const search = buildInstitutionSearchSql('JPMorgan Chase');

		expect(search.orderPrefix.indexOf('CAST(cert AS TEXT)')).toBeLessThan(
			search.orderPrefix.indexOf('LOWER(name) = LOWER(?)')
		);
		expect(search.orderPrefix).toContain('active DESC');
		expect(search.orderParams).toHaveLength(7);
	});
});
