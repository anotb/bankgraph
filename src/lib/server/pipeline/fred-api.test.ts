import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSeriesObservations, fetchSeriesInfo, delay } from './fred-api';

// Helper to build a mock Response
function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body))
	} as Response;
}

const API_KEY = 'test-key';
const SERIES_ID = 'DFF';

describe('fetchWithRetry (via fetchSeriesObservations)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('succeeds on first try', async () => {
		const body = {
			observations: [{ date: '2024-01-01', value: '5.33' }]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ date: '2024-01-01', value: 5.33 }]);
	});

	it('retries on 429 and succeeds', async () => {
		const body = {
			observations: [{ date: '2024-01-01', value: '5.33' }]
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({ error: 'rate limited' }, 429))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);

		// First attempt fails with 429, wait for backoff (500ms)
		await vi.advanceTimersByTimeAsync(500);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ date: '2024-01-01', value: 5.33 }]);
	});

	it('retries on 500 and succeeds', async () => {
		const body = {
			observations: [{ date: '2024-03-01', value: '2.50' }]
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({ error: 'server error' }, 500))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		await vi.advanceTimersByTimeAsync(500);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ date: '2024-03-01', value: 2.5 }]);
	});

	it('retries on 503 and succeeds', async () => {
		const body = {
			observations: [{ date: '2024-03-01', value: '1.00' }]
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({}, 503))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		await vi.advanceTimersByTimeAsync(500);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ date: '2024-03-01', value: 1.0 }]);
	});

	it('throws on 4xx (not 429) after exhausting retries', async () => {
		// Note: the throw inside the try is caught by the catch block, so
		// 4xx errors still go through all retry attempts with backoff.
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({ error: 'bad request' }, 400))
			.mockResolvedValueOnce(mockResponse({ error: 'bad request' }, 400))
			.mockResolvedValueOnce(mockResponse({ error: 'bad request' }, 400));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		// Prevent unhandled rejection warning while timers advance
		promise.catch(() => {});

		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).rejects.toThrow('FRED API returned 400');
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('recovers from 404 on retry if server heals', async () => {
		const body = {
			observations: [{ date: '2024-01-01', value: '3.00' }]
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({ error: 'not found' }, 404))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		await vi.advanceTimersByTimeAsync(500);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ date: '2024-01-01', value: 3.0 }]);
	});

	it('gives up after max retries (3 attempts)', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({}, 500))
			.mockResolvedValueOnce(mockResponse({}, 500))
			.mockResolvedValueOnce(mockResponse({}, 500));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		promise.catch(() => {});

		// Backoff: attempt 0 -> 500ms, attempt 1 -> 1000ms
		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).rejects.toThrow('FRED API returned 500');
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('uses exponential backoff timing', async () => {
		const body = {
			observations: [{ date: '2024-01-01', value: '3.00' }]
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({}, 429))
			.mockResolvedValueOnce(mockResponse({}, 429))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);

		// After first failure: backoff = 500 * 2^0 = 500ms
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(499);
		// Should not have retried yet
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		// Now at 500ms, second attempt fires
		expect(fetch).toHaveBeenCalledTimes(2);

		// After second failure: backoff = 500 * 2^1 = 1000ms
		await vi.advanceTimersByTimeAsync(999);
		expect(fetch).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);
		// Now at 1000ms, third attempt fires
		expect(fetch).toHaveBeenCalledTimes(3);

		const result = await promise;
		expect(result).toEqual([{ date: '2024-01-01', value: 3.0 }]);
	});

	it('retries on network error (fetch throws)', async () => {
		const body = {
			observations: [{ date: '2024-01-01', value: '4.00' }]
		};
		vi.mocked(fetch)
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		await vi.advanceTimersByTimeAsync(500);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ date: '2024-01-01', value: 4.0 }]);
	});

	it('throws network error after max retries', async () => {
		vi.mocked(fetch)
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockRejectedValueOnce(new TypeError('fetch failed'));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		promise.catch(() => {});

		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).rejects.toThrow('fetch failed');
		expect(fetch).toHaveBeenCalledTimes(3);
	});
});

describe('fetchSeriesObservations', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('transforms API response correctly', async () => {
		const body = {
			observations: [
				{ date: '2024-01-01', value: '5.33' },
				{ date: '2024-02-01', value: '5.34' },
				{ date: '2024-03-01', value: '5.35' }
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);

		expect(result).toEqual([
			{ date: '2024-01-01', value: 5.33 },
			{ date: '2024-02-01', value: 5.34 },
			{ date: '2024-03-01', value: 5.35 }
		]);
	});

	it('filters out "." values (FRED missing data)', async () => {
		const body = {
			observations: [
				{ date: '2024-01-01', value: '5.33' },
				{ date: '2024-02-01', value: '.' },
				{ date: '2024-03-01', value: '5.35' }
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);

		expect(result).toEqual([
			{ date: '2024-01-01', value: 5.33 },
			{ date: '2024-03-01', value: 5.35 }
		]);
		// The "." entry should be excluded entirely
		expect(result).toHaveLength(2);
	});

	it('filters out NaN values', async () => {
		const body = {
			observations: [
				{ date: '2024-01-01', value: '5.33' },
				{ date: '2024-02-01', value: 'not-a-number' },
				{ date: '2024-03-01', value: '' }
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);

		expect(result).toEqual([{ date: '2024-01-01', value: 5.33 }]);
	});

	it('handles empty observations array', async () => {
		const body = { observations: [] };
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);
		expect(result).toEqual([]);
	});

	it('handles missing observations key (returns empty)', async () => {
		const body = {};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);
		expect(result).toEqual([]);
	});

	it('constructs URL with startDate when provided', async () => {
		const body = { observations: [{ date: '2024-06-01', value: '5.50' }] };
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		await fetchSeriesObservations(API_KEY, SERIES_ID, '2024-06-01');

		const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(calledUrl).toContain('observation_start=2024-06-01');
		expect(calledUrl).toContain(`series_id=${SERIES_ID}`);
		expect(calledUrl).toContain(`api_key=${API_KEY}`);
	});

	it('constructs URL without startDate when omitted', async () => {
		const body = { observations: [] };
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		await fetchSeriesObservations(API_KEY, SERIES_ID);

		const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(calledUrl).not.toContain('observation_start');
	});

	it('handles all "." values (entire series missing)', async () => {
		const body = {
			observations: [
				{ date: '2024-01-01', value: '.' },
				{ date: '2024-02-01', value: '.' },
				{ date: '2024-03-01', value: '.' }
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesObservations(API_KEY, SERIES_ID);
		expect(result).toEqual([]);
	});
});

describe('fetchSeriesInfo', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('transforms API response correctly', async () => {
		const body = {
			seriess: [
				{
					title: 'Federal Funds Effective Rate',
					frequency: 'Daily',
					units: 'Percent'
				}
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesInfo(API_KEY, SERIES_ID);

		expect(result).toEqual({
			title: 'Federal Funds Effective Rate',
			frequency: 'Daily',
			units: 'Percent'
		});
	});

	it('throws when series not found (empty seriess array)', async () => {
		const body = { seriess: [] };
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		await expect(fetchSeriesInfo(API_KEY, SERIES_ID)).rejects.toThrow(
			`FRED series ${SERIES_ID} not found`
		);
	});

	it('throws when seriess key is missing', async () => {
		const body = {};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		await expect(fetchSeriesInfo(API_KEY, SERIES_ID)).rejects.toThrow(
			`FRED series ${SERIES_ID} not found`
		);
	});

	it('constructs correct URL', async () => {
		const body = {
			seriess: [{ title: 'Test', frequency: 'Monthly', units: 'Index' }]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		await fetchSeriesInfo(API_KEY, SERIES_ID);

		const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(calledUrl).toContain('/fred/series?');
		expect(calledUrl).toContain(`series_id=${SERIES_ID}`);
		expect(calledUrl).toContain(`api_key=${API_KEY}`);
		expect(calledUrl).toContain('file_type=json');
	});

	it('returns only title, frequency, and units (no extra fields)', async () => {
		const body = {
			seriess: [
				{
					id: 'DFF',
					title: 'Federal Funds Effective Rate',
					frequency: 'Daily',
					units: 'Percent',
					seasonal_adjustment: 'Not Seasonally Adjusted',
					last_updated: '2024-01-02'
				}
			]
		};
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

		const result = await fetchSeriesInfo(API_KEY, SERIES_ID);

		expect(Object.keys(result)).toEqual(['title', 'frequency', 'units']);
	});
});

describe('delay', () => {
	it('resolves after the given ms', async () => {
		vi.useFakeTimers();
		const p = delay(100);

		let resolved = false;
		p.then(() => {
			resolved = true;
		});

		await vi.advanceTimersByTimeAsync(50);
		expect(resolved).toBe(false);

		await vi.advanceTimersByTimeAsync(51);
		expect(resolved).toBe(true);

		vi.useRealTimers();
	});

	it('resolves with undefined', async () => {
		vi.useFakeTimers();
		const p = delay(10);
		vi.advanceTimersByTime(10);
		const result = await p;
		expect(result).toBeUndefined();
		vi.useRealTimers();
	});
});

describe('edge cases', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('handles invalid JSON from response', async () => {
		const badResponse = {
			ok: true,
			status: 200,
			json: () => Promise.reject(new SyntaxError('Unexpected token')),
			text: () => Promise.resolve('not json')
		} as unknown as Response;

		vi.mocked(fetch).mockResolvedValueOnce(badResponse);

		await expect(fetchSeriesObservations(API_KEY, SERIES_ID)).rejects.toThrow(
			'Unexpected token'
		);
	});

	it('handles non-Error thrown by fetch', async () => {
		vi.useFakeTimers();

		vi.mocked(fetch)
			.mockRejectedValueOnce('string error')
			.mockRejectedValueOnce(42)
			.mockRejectedValueOnce(null);

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);
		promise.catch(() => {});

		await vi.advanceTimersByTimeAsync(500);
		await vi.advanceTimersByTimeAsync(1000);

		// Should wrap non-Error values via String()
		await expect(promise).rejects.toThrow();
		expect(fetch).toHaveBeenCalledTimes(3);

		vi.useRealTimers();
	});

	it('mixed retry scenario: network error then 429 then success', async () => {
		vi.useFakeTimers();

		const body = {
			observations: [{ date: '2024-01-01', value: '1.00' }]
		};
		vi.mocked(fetch)
			.mockRejectedValueOnce(new Error('ECONNRESET'))
			.mockResolvedValueOnce(mockResponse({}, 429))
			.mockResolvedValueOnce(mockResponse(body));

		const promise = fetchSeriesObservations(API_KEY, SERIES_ID);

		// After network error: backoff 500ms
		await vi.advanceTimersByTimeAsync(500);
		// After 429: backoff 1000ms
		await vi.advanceTimersByTimeAsync(1000);

		const result = await promise;
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(result).toEqual([{ date: '2024-01-01', value: 1.0 }]);

		vi.useRealTimers();
	});
});
