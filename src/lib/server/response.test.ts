import { describe, it, expect } from 'vitest';
import { jsonResponse, errorResponse } from './response';

describe('jsonResponse', () => {
	it('returns a Response with JSON body', async () => {
		const data = { banks: [{ id: 1 }] };
		const res = jsonResponse(data);

		expect(res).toBeInstanceOf(Response);
		expect(await res.json()).toEqual(data);
	});

	it('defaults to status 200', () => {
		const res = jsonResponse({ ok: true });
		expect(res.status).toBe(200);
	});

	it('accepts a custom status code', () => {
		const res = jsonResponse({ created: true }, 201);
		expect(res.status).toBe(201);
	});

	it('sets Content-Type to application/json', () => {
		const res = jsonResponse({});
		expect(res.headers.get('Content-Type')).toBe('application/json');
	});

	it('sets CORS header to allow all origins', () => {
		const res = jsonResponse({});
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('sets Cache-Control header', () => {
		const res = jsonResponse({});
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('serialises arrays', async () => {
		const data = [1, 2, 3];
		const res = jsonResponse(data);
		expect(await res.json()).toEqual([1, 2, 3]);
	});

	it('serialises null', async () => {
		const res = jsonResponse(null);
		expect(await res.json()).toBeNull();
	});
});

describe('errorResponse', () => {
	it('returns a Response with error message', async () => {
		const res = errorResponse('Not found', 404);
		const body = await res.json();

		expect(body).toEqual({ error: 'Not found' });
	});

	it('uses the provided status code', () => {
		expect(errorResponse('Bad request', 400).status).toBe(400);
		expect(errorResponse('Unauthorized', 401).status).toBe(401);
		expect(errorResponse('Forbidden', 403).status).toBe(403);
		expect(errorResponse('Not found', 404).status).toBe(404);
		expect(errorResponse('Server error', 500).status).toBe(500);
	});

	it('keeps JSON and CORS headers but prevents caching errors', () => {
		const res = errorResponse('error', 500);
		expect(res.headers.get('Content-Type')).toBe('application/json');
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});
});
