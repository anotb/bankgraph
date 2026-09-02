import type { Handle, HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { logWarn } from '$lib/server/observability';
import {
	acquirePublishedReadSnapshot,
	validatePublishedReadSnapshot,
	type PublishedReadSnapshot
} from '$lib/server/publication-barrier';

const FALLBACK_CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'"
].join('; ');

export const MAX_FENCED_RESPONSE_BYTES = 16 * 1024 * 1024;

export async function materializeResponse(
	response: Response,
	maxBytes = MAX_FENCED_RESPONSE_BYTES
): Promise<Response | null> {
	if (!response.body) return response;
	const length = Number(response.headers.get('Content-Length'));
	if (Number.isFinite(length) && length > maxBytes) {
		await response.body.cancel('Response exceeds the fenced response limit');
		return null;
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel('Response exceeds the fenced response limit');
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
}

/**
 * Development only: run the UI against a deployed Worker's public API instead of a
 * local D1. The publication fence is skipped here because the remote Worker applies
 * it to every API response we consume.
 */
const REMOTE_API = env.BANKGRAPH_REMOTE_API?.replace(/\/$/, '') ?? null;
let remoteRelease: { release: string | null; generation: string | null; at: number } | null = null;

async function remoteLiveData(fetcher: typeof fetch) {
	if (remoteRelease && Date.now() - remoteRelease.at < 60_000) return remoteRelease;
	try {
		const ready = await fetcher(`${REMOTE_API}/api/v1/ready`).then((r) => r.json()) as {
			liveData?: { release?: string | null };
			checks?: { publicationState?: { generation?: string | null } };
		};
		remoteRelease = {
			release: ready.liveData?.release ?? null,
			generation: ready.checks?.publicationState?.generation ?? null,
			at: Date.now()
		};
	} catch {
		remoteRelease = { release: null, generation: null, at: Date.now() };
	}
	return remoteRelease;
}

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	if (REMOTE_API) {
		const url = new URL(request.url);
		if (url.origin === event.url.origin && url.pathname.startsWith('/api/')) {
			return fetch(new Request(`${REMOTE_API}${url.pathname}${url.search}`, request));
		}
	}
	return fetch(request);
};

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url?.pathname ?? '';
	if (REMOTE_API) {
		const live = await remoteLiveData(fetch);
		event.locals.liveDataRelease = live.release ?? undefined;
		event.locals.liveDataGeneration = live.generation ?? undefined;
		const response = await resolve(event);
		response.headers.set('Permissions-Policy', 'tools=(self)');
		return response;
	}
	const isPipelineControl = path === '/api/v1/ready' || path.startsWith('/api/v1/pipeline/');
	const isImmutableLakeExport = path === '/api/v1/fdic/sod/export';
	const isStaticPolicyRoute = path === '/privacy';
	const isRecordedWorkspace = (path === '/b' || path === '/workspace')
		&& event.url?.searchParams.get('demo') === 'recorded'
		&& (event.platform?.env?.ALLOW_RECORDED_DEMO as string | undefined) === 'true';
	const isApplicationRoute = event.route?.id != null
		&& !isPipelineControl
		&& !isImmutableLakeExport
		&& !isStaticPolicyRoute
		&& !isRecordedWorkspace;
	let db: D1Database | null = null;
	let readSnapshot: PublishedReadSnapshot | null = null;
	let barrierReason: 'publication_barrier_closed' | 'publication_barrier_unavailable' | null = null;
	let responseTooLarge = false;
	if (isApplicationRoute) {
		try {
			db = getDB(event.platform);
			readSnapshot = await acquirePublishedReadSnapshot(db);
			if (readSnapshot) {
				event.locals.liveDataRelease = readSnapshot.release;
				event.locals.liveDataGeneration = readSnapshot.generation;
			} else {
				barrierReason = 'publication_barrier_closed';
			}
		} catch (error) {
			barrierReason = 'publication_barrier_unavailable';
			logWarn('publication_read_admission_failed', {
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	let response: Response;
	if (barrierReason) {
		const body = {
			status: 'degraded',
			ready: false,
			liveData: { state: 'degraded', reason: barrierReason }
		};
		response = path.startsWith('/api/')
			? new Response(JSON.stringify(body), {
				status: 503,
				headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
			})
			: new Response(
				'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bankgraph live data unavailable</title><main><h1>Live data is not ready</h1><p>Bankgraph has paused public data reads until a complete release is published.</p><p><a href="/api/v1/ready">Check readiness</a></p></main></html>',
				{
					status: 503,
					headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
				}
			);
	} else {
		try {
			response = await resolve(event);
			if (db && readSnapshot) {
				try {
					// Finish SSR/API body production before the post-render fence. The
					// separately exempt R2 lake export is immutable and may stay streamed.
					const materialized = await materializeResponse(response);
					if (!materialized) {
						responseTooLarge = true;
					} else {
						response = materialized;
					}
					if (!responseTooLarge && !(await validatePublishedReadSnapshot(db, readSnapshot))) {
						barrierReason = 'publication_barrier_unavailable';
					}
				} catch (error) {
					barrierReason = 'publication_barrier_unavailable';
					logWarn('publication_read_validation_failed', {
						error: error instanceof Error ? error.message : 'Unknown error'
					});
				}
			}
		} finally {
			// No reader lease is written: final generation validation is the fence.
		}
		if (barrierReason) {
			const body = {
				status: 'degraded',
				ready: false,
				liveData: { state: 'degraded', reason: barrierReason }
			};
			response = path.startsWith('/api/')
				? new Response(JSON.stringify(body), {
					status: 503,
					headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
				})
				: new Response(
					'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bankgraph live data unavailable</title><main><h1>Live data is not ready</h1><p>Bankgraph could not validate this response against the active publication. Please retry.</p><p><a href="/api/v1/ready">Check readiness</a></p></main></html>',
					{
						status: 503,
						headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
					}
				);
		} else if (responseTooLarge) {
			const body = {
				status: 'rejected',
				error: 'Response exceeds the 16 MiB dynamic-response limit; request a smaller page or use an immutable export.'
			};
			response = path.startsWith('/api/')
				? new Response(JSON.stringify(body), {
					status: 413,
					headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
				})
				: new Response(body.error, {
					status: 413,
					headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
				});
		}
	}

	response.headers.set('Origin-Agent-Cluster', '?1');
	response.headers.set('Permissions-Policy', 'tools=(self)');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	// SvelteKit supplies a nonce/hash-aware CSP for rendered pages. Keep a safe
	// fallback for API/error responses that do not pass through the page renderer.
	if (!response.headers.has('Content-Security-Policy')) {
		response.headers.set('Content-Security-Policy', FALLBACK_CSP);
	}

	return response;
};
