import { describe, expect, it, vi } from 'vitest';
import { load } from '../../routes/+page.server';

describe('home page server load', () => {
	it('builds the live system surface from the brief, metadata, and segment histories', async () => {
		const fetch = vi.fn(async (input: string) => {
			if (input === '/api/v2/system-brief') {
				return new Response(JSON.stringify({
					reportingPeriod: { current: '20260630', prior: '20260331' },
					signals: [{ id: 'assets', title: 'Assets', question: 'Where did assets grow?' }],
					changeRadar: {
						population: {
							matchedInstitutions: 4_200,
							currentReportingInstitutions: 4_228,
							priorReportingInstitutions: 4_250
						},
						metrics: []
					},
					macroOverlays: {
						series: [{ seriesId: 'FEDFUNDS', title: 'Federal funds rate', value: 4.5 }]
					},
					release: '20260630'
				}));
			}
			if (input === '/api/v1/meta') {
				return new Response(JSON.stringify({
					active_count: 4_238,
					states: [{ state: 'NC', count: 65 }]
				}));
			}
			if (input.startsWith('/api/v1/industry?')) {
				return new Response(JSON.stringify({
					data: [
						{ repdte: '20260630', metrics: { roa: 1.1 } },
						{ repdte: '20260331', metrics: { roa: 1.0 } }
					]
				}));
			}
			throw new Error(`Unexpected homepage request: ${input}`);
		});

		const result = await load({ fetch } as never);
		if (!result) throw new Error('Home page returned no data');
		const page = result as typeof result & {
			series: Record<string, Array<{ repdte: string }>>;
		};

		expect(fetch.mock.calls.map(([input]) => input)).toEqual([
			'/api/v2/system-brief',
			'/api/v1/meta',
			'/api/v1/industry?segment=all&limit=40',
			'/api/v1/industry?segment=community&limit=40',
			'/api/v1/industry?segment=regional&limit=40',
			'/api/v1/industry?segment=large&limit=40'
		]);
		expect(result).toMatchObject({
			period: { current: '20260630', prior: '20260331' },
			signals: [{ id: 'assets', title: 'Assets' }],
			radar: { population: { matchedInstitutions: 4_200 } },
			macro: [{ seriesId: 'FEDFUNDS', title: 'Federal funds rate', value: 4.5 }],
			states: [{ state: 'NC', count: 65 }],
			activeCount: 4_238
		});
		expect(page.series.all.map((point) => point.repdte)).toEqual(['20260331', '20260630']);
	});
});
