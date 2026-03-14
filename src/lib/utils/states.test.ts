import { describe, it, expect } from 'vitest';
import { STATE_NAMES, getStateName, STATES_SORTED } from './states';

describe('STATE_NAMES', () => {
	it('contains all 50 US states', () => {
		const fiftyStates = [
			'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
			'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
			'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
			'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
			'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
		];
		for (const abbr of fiftyStates) {
			expect(STATE_NAMES).toHaveProperty(abbr);
		}
	});

	it('contains DC', () => {
		expect(STATE_NAMES['DC']).toBe('District of Columbia');
	});

	it('contains US territories', () => {
		expect(STATE_NAMES['AS']).toBe('American Samoa');
		expect(STATE_NAMES['GU']).toBe('Guam');
		expect(STATE_NAMES['MP']).toBe('Northern Mariana Islands');
		expect(STATE_NAMES['PR']).toBe('Puerto Rico');
		expect(STATE_NAMES['VI']).toBe('Virgin Islands');
	});

	it('has exactly 56 entries (50 states + DC + 5 territories)', () => {
		expect(Object.keys(STATE_NAMES)).toHaveLength(56);
	});

	it('maps known abbreviations to correct full names', () => {
		expect(STATE_NAMES['CA']).toBe('California');
		expect(STATE_NAMES['NY']).toBe('New York');
		expect(STATE_NAMES['TX']).toBe('Texas');
		expect(STATE_NAMES['WV']).toBe('West Virginia');
	});
});

describe('getStateName', () => {
	it('returns full name for known abbreviations', () => {
		expect(getStateName('CA')).toBe('California');
		expect(getStateName('NY')).toBe('New York');
		expect(getStateName('DC')).toBe('District of Columbia');
		expect(getStateName('PR')).toBe('Puerto Rico');
	});

	it('falls back to the abbreviation for unknown codes', () => {
		expect(getStateName('XX')).toBe('XX');
		expect(getStateName('ZZ')).toBe('ZZ');
		expect(getStateName('')).toBe('');
	});

	it('is case-sensitive (lowercase returns the input)', () => {
		expect(getStateName('ca')).toBe('ca');
		expect(getStateName('ny')).toBe('ny');
	});
});

describe('STATES_SORTED', () => {
	it('is sorted alphabetically by full state name', () => {
		for (let i = 1; i < STATES_SORTED.length; i++) {
			const prev = STATE_NAMES[STATES_SORTED[i - 1]];
			const curr = STATE_NAMES[STATES_SORTED[i]];
			expect(prev.localeCompare(curr)).toBeLessThan(0);
		}
	});

	it('contains all entries from STATE_NAMES', () => {
		const allKeys = Object.keys(STATE_NAMES);
		expect(STATES_SORTED).toHaveLength(allKeys.length);
		for (const key of allKeys) {
			expect(STATES_SORTED).toContain(key);
		}
	});

	it('starts with Alabama (AL) and ends with Wyoming (WY)', () => {
		expect(STATES_SORTED[0]).toBe('AL');
		expect(STATES_SORTED[STATES_SORTED.length - 1]).toBe('WY');
	});
});
