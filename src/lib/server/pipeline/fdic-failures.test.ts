import { describe, it, expect } from 'vitest';
import { mapFailure } from './fdic-failures';

describe('mapFailure', () => {
	it('maps a complete FDIC failure record', () => {
		const raw = {
			CERT: '12345',
			NAME: 'Failed National Bank',
			CITYST: 'Springfield, IL',
			FAILDATE: '03/15/2023',
			SAVR: 'Acquiring Bank, Inc.',
			COST: '150000',
			QBFASSET: '500000',
			QBFDEP: '400000'
		};

		const result = mapFailure(raw);

		expect(result.cert).toBe(12345);
		expect(result.name).toBe('Failed National Bank');
		expect(result.city).toBe('Springfield');
		expect(result.state).toBe('IL');
		expect(result.fail_date).toBe('03/15/2023');
		expect(result.acquiring_institution).toBe('Acquiring Bank, Inc.');
		expect(result.cost).toBe(150000);
		expect(result.total_assets).toBe(500000);
		expect(result.total_deposits).toBe(400000);
	});

	it('parses city and state from CITYST with comma separator', () => {
		const result = mapFailure({ CERT: '1', CITYST: 'New York, NY' });
		expect(result.city).toBe('New York');
		expect(result.state).toBe('NY');
	});

	it('handles CITYST with multiple commas (city name with comma)', () => {
		// "City Name, More, ST" -> city = "City Name", state = "ST"
		const result = mapFailure({ CERT: '1', CITYST: 'San Jose, CA' });
		expect(result.city).toBe('San Jose');
		expect(result.state).toBe('CA');
	});

	it('handles CITYST with no comma (city only, no state)', () => {
		const result = mapFailure({ CERT: '1', CITYST: 'Springfield' });
		expect(result.city).toBe('Springfield');
		expect(result.state).toBeNull();
	});

	it('handles empty CITYST (empty string is falsy, becomes null)', () => {
		const result = mapFailure({ CERT: '1', CITYST: '' });
		expect(result.city).toBeNull();
		expect(result.state).toBeNull();
	});

	it('handles missing CITYST (defaults to empty string via ?? "")', () => {
		const result = mapFailure({ CERT: '1' });
		expect(result.city).toBeNull();
		expect(result.state).toBeNull();
	});

	it('handles null fields gracefully', () => {
		const raw = {
			CERT: '1',
			NAME: null,
			CITYST: null,
			FAILDATE: null,
			SAVR: null,
			COST: null,
			QBFASSET: null,
			QBFDEP: null
		};

		const result = mapFailure(raw);

		expect(result.cert).toBe(1);
		expect(result.name).toBeNull();
		expect(result.fail_date).toBeNull();
		expect(result.acquiring_institution).toBeNull();
		expect(result.cost).toBeNull();
		expect(result.total_assets).toBeNull();
		expect(result.total_deposits).toBeNull();
	});

	it('handles string "0" for COST', () => {
		const result = mapFailure({ CERT: '1', COST: '0' });
		expect(result.cost).toBe(0);
	});

	it('splits on ", " (comma-space)', () => {
		const result = mapFailure({ CERT: '1', CITYST: 'Dallas, TX' });
		expect(result.city).toBe('Dallas');
		expect(result.state).toBe('TX');
	});

	it('handles comma without space (no split)', () => {
		// "Dallas,TX" doesn't match ", " so it stays as one piece
		const result = mapFailure({ CERT: '1', CITYST: 'Dallas,TX' });
		expect(result.city).toBe('Dallas,TX');
		expect(result.state).toBeNull();
	});
});
