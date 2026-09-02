import { describe, it, expect } from 'vitest';
import { mapFailure } from './fdic-failures';

describe('mapFailure', () => {
	it('maps a complete FDIC failure record', () => {
		const raw = {
			ID: '4115',
			CERT: '12345',
			NAME: 'Failed National Bank',
			CITYST: 'Springfield, IL',
			FAILDATE: '03/15/2023',
			RESTYPE: 'Failure',
			RESTYPE1: 'PA',
			SAVR: 'DIF',
			BIDNAME: 'Acquiring Bank, Inc.',
			COST: '150000',
			QBFASSET: '500000',
			QBFDEP: '400000'
		};

		const result = mapFailure(raw);

		expect(result.source_id).toBe('4115');
		expect(result.cert).toBe(12345);
		expect(result.name).toBe('Failed National Bank');
		expect(result.city).toBe('Springfield');
		expect(result.state).toBe('IL');
		expect(result.fail_date).toBe('20230315');
		expect(result.transaction_type).toBe('FAILURE');
		expect(result.resolution_type).toBe('PA');
		expect(result.insurance_fund).toBe('DIF');
		expect(result.acquiring_institution).toBe('Acquiring Bank, Inc.');
		expect(result.cost).toBe(150000);
		expect(result.total_assets).toBe(500000);
		expect(result.total_deposits).toBe(400000);
	});

	it('parses city and state from CITYST with comma separator', () => {
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: 'New York, NY' });
		expect(result.city).toBe('New York');
		expect(result.state).toBe('NY');
	});

	it('handles CITYST with multiple commas (city name with comma)', () => {
		// "City Name, More, ST" -> city = "City Name", state = "ST"
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: 'San Jose, CA' });
		expect(result.city).toBe('San Jose');
		expect(result.state).toBe('CA');
	});

	it('handles CITYST with no comma (city only, no state)', () => {
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: 'Springfield' });
		expect(result.city).toBe('Springfield');
		expect(result.state).toBeNull();
	});

	it('handles empty CITYST (empty string is falsy, becomes null)', () => {
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: '' });
		expect(result.city).toBeNull();
		expect(result.state).toBeNull();
	});

	it('handles missing CITYST (defaults to empty string via ?? "")', () => {
		const result = mapFailure({ ID: '1', CERT: '1' });
		expect(result.city).toBeNull();
		expect(result.state).toBeNull();
	});

	it('handles null fields gracefully', () => {
		const raw = {
			ID: '1',
			CERT: '1',
			NAME: null,
			CITYST: null,
			FAILDATE: null,
			RESTYPE: null,
			RESTYPE1: null,
			SAVR: null,
			BIDNAME: null,
			COST: null,
			QBFASSET: null,
			QBFDEP: null
		};

		const result = mapFailure(raw);

		expect(result.cert).toBe(1);
		expect(result.name).toBeNull();
		expect(result.fail_date).toBeNull();
		expect(result.transaction_type).toBeNull();
		expect(result.resolution_type).toBeNull();
		expect(result.insurance_fund).toBeNull();
		expect(result.acquiring_institution).toBeNull();
		expect(result.cost).toBeNull();
		expect(result.total_assets).toBeNull();
		expect(result.total_deposits).toBeNull();
	});

	it('handles string "0" for COST', () => {
		const result = mapFailure({ ID: '1', CERT: '1', COST: '0' });
		expect(result.cost).toBe(0);
	});

	it('distinguishes assistance transactions from failures', () => {
		const result = mapFailure({
			ID: '2441',
			CERT: '3510',
			NAME: 'BANK OF AMERICA N.A.',
			RESTYPE: 'Assistance',
			RESTYPE1: 'A/A',
			SAVR: 'DIF',
			BIDNAME: 'Bank of America, National Association'
		});

		expect(result.transaction_type).toBe('ASSISTANCE');
		expect(result.resolution_type).toBe('A/A');
		expect(result.insurance_fund).toBe('DIF');
		expect(result.acquiring_institution).toBe('Bank of America, National Association');
	});

	it('does not confuse the insurance fund with the winning bidder', () => {
		const result = mapFailure({ ID: '1', CERT: '1', SAVR: 'BIF', BIDNAME: '' });

		expect(result.insurance_fund).toBe('BIF');
		expect(result.acquiring_institution).toBeNull();
	});

	it('splits on ", " (comma-space)', () => {
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: 'Dallas, TX' });
		expect(result.city).toBe('Dallas');
		expect(result.state).toBe('TX');
	});

	it('handles comma without space (no split)', () => {
		// "Dallas,TX" doesn't match ", " so it stays as one piece
		const result = mapFailure({ ID: '1', CERT: '1', CITYST: 'Dallas,TX' });
		expect(result.city).toBe('Dallas,TX');
		expect(result.state).toBeNull();
	});

	it('retains rows with missing and duplicate certificate numbers by source ID', () => {
		const first = mapFailure({ ID: '100', CERT: '', NAME: 'No certificate' });
		const second = mapFailure({ ID: '101', CERT: '77', NAME: 'First transaction' });
		const third = mapFailure({ ID: '102', CERT: '77', NAME: 'Second transaction' });

		expect(first).toMatchObject({ source_id: '100', cert: null });
		expect(second).toMatchObject({ source_id: '101', cert: 77 });
		expect(third).toMatchObject({ source_id: '102', cert: 77 });
	});

	it('rejects a row that has no FDIC source ID', () => {
		expect(() => mapFailure({ CERT: '1' })).toThrow('missing its source ID');
	});
});
