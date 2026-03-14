import { test, expect } from '@playwright/test';

test.describe('API endpoints', () => {
	test.describe('GET /api/v1/meta', () => {
		test('returns industry metadata', async ({ request }) => {
			const res = await request.get('/api/v1/meta');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.bank_count).toBeGreaterThan(0);
			expect(data.active_count).toBeGreaterThan(0);
		});
	});

	test.describe('GET /api/v1/banks', () => {
		test('returns paginated bank list', async ({ request }) => {
			const res = await request.get('/api/v1/banks?limit=5');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.data).toHaveLength(5);
			expect(data.data[0]).toHaveProperty('cert');
			expect(data.data[0]).toHaveProperty('name');
		});

		test('search by name returns results', async ({ request }) => {
			const res = await request.get('/api/v1/banks?q=chase&limit=5');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.data.length).toBeGreaterThan(0);
			// At least one result should contain "chase" (case-insensitive)
			const hasChase = data.data.some((b: { name: string }) =>
				b.name.toLowerCase().includes('chase')
			);
			expect(hasChase).toBe(true);
		});

		test('filter by active status', async ({ request }) => {
			const res = await request.get('/api/v1/banks?active=1&limit=3');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.data.length).toBeGreaterThan(0);
		});
	});

	test.describe('GET /api/v1/banks/:cert', () => {
		test('returns bank details for cert 628', async ({ request }) => {
			const res = await request.get('/api/v1/banks/628');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.cert).toBe(628);
			expect(data.name).toBeTruthy();
		});

		test('returns 404 for nonexistent cert', async ({ request }) => {
			const res = await request.get('/api/v1/banks/999999999');
			expect(res.status()).toBe(404);
		});
	});

	test.describe('GET /api/v1/banks/:cert/financials', () => {
		test('returns financial data for cert 628', async ({ request }) => {
			const res = await request.get('/api/v1/banks/628/financials');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('data');
			expect(data).toHaveProperty('cert');
			expect(Array.isArray(data.data)).toBe(true);
			expect(data.data.length).toBeGreaterThan(0);
			expect(data.data[0]).toHaveProperty('repdte');
		});

		test('CSV format returns valid CSV', async ({ request }) => {
			const res = await request.get('/api/v1/banks/628/financials?format=csv');
			expect(res.status()).toBe(200);
			expect(res.headers()['content-type']).toContain('text/csv');
			const body = await res.text();
			expect(body.length).toBeGreaterThan(0);
			expect(body.split('\n')[0]).toContain('repdte');
		});
	});

	test.describe('GET /api/v1/compare', () => {
		test('returns comparison data for two banks', async ({ request }) => {
			const res = await request.get('/api/v1/compare?certs=628,3510&metrics=roa,roe');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.certs).toContain(628);
			expect(data.certs).toContain(3510);
			expect(data.metrics).toContain('roa');
			expect(data.data).toBeTruthy();
		});

		test('rejects missing certs param', async ({ request }) => {
			const res = await request.get('/api/v1/compare');
			expect(res.status()).toBe(400);
		});

		test('rejects invalid metrics', async ({ request }) => {
			const res = await request.get('/api/v1/compare?certs=628&metrics=invalid_metric');
			expect(res.status()).toBe(400);
		});

		test('rejects more than 10 certs', async ({ request }) => {
			const certs = Array.from({ length: 11 }, (_, i) => i + 1).join(',');
			const res = await request.get(`/api/v1/compare?certs=${certs}`);
			expect(res.status()).toBe(400);
		});
	});

	test.describe('GET /api/v1/industry', () => {
		test('returns industry aggregates', async ({ request }) => {
			const res = await request.get('/api/v1/industry?segment=all&limit=5');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.segment).toBe('all');
			expect(data.data.length).toBeGreaterThan(0);
			expect(data.data[0]).toHaveProperty('repdte');
			expect(data.data[0]).toHaveProperty('metrics');
		});

		test('rejects invalid segment', async ({ request }) => {
			const res = await request.get('/api/v1/industry?segment=invalid');
			expect(res.status()).toBe(400);
		});
	});

	test.describe('GET /api/v1/banks/:cert/risk', () => {
		test('returns risk scores for cert 628', async ({ request }) => {
			const res = await request.get('/api/v1/banks/628/risk');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('scores');
			expect(data.scores).toHaveProperty('composite');
			expect(data).toHaveProperty('pca_category');
		});
	});

	test.describe('GET /api/v1/banks/:cert/peers', () => {
		test('returns peer stats for cert 628', async ({ request }) => {
			const res = await request.get('/api/v1/banks/628/peers');
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('cert');
			expect(data).toHaveProperty('metrics');
		});
	});
});
