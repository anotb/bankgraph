import type { JsonValue, WebMcpControllerResult } from './types.js';

export const MAX_WEBMCP_ENVELOPE_CHARS = 1_400;
/** Bounded ceiling for paged analytical results and complete artifact references. */
export const MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS = 32_768;
const MIN_WEBMCP_ENVELOPE_CHARS = 180;

export interface WebMcpSuccessEnvelope {
	ok: true;
	summary: string;
	data: JsonValue;
	meta: { truncated: boolean };
}

export interface WebMcpErrorEnvelope {
	ok: false;
	error: {
		code: string;
		message: string;
		retryable: boolean;
		details?: JsonValue;
	};
	meta: { truncated: boolean };
}

export type WebMcpEnvelope = WebMcpSuccessEnvelope | WebMcpErrorEnvelope;

interface PageSizeGuidance {
	parameter: 'pageSize' | 'limit' | 'groupPageSize';
	requested: number;
	suggested: number;
	cursorParameter?: 'cursor' | 'groupCursor';
	cursor?: string;
}

function clampBudget(maxChars: number): number {
	if (!Number.isFinite(maxChars)) return MAX_WEBMCP_ENVELOPE_CHARS;
	return Math.max(
		MIN_WEBMCP_ENVELOPE_CHARS,
		Math.min(Math.floor(maxChars), MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS)
	);
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
	const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	return (text || fallback).slice(0, maxLength);
}

function toJsonValue(value: unknown): JsonValue {
	if (value === undefined) return null;
	// Track only the current ancestor chain. A result may intentionally reuse a
	// plain array in two places (for example a block binding and its resolved
	// anchors); that is not a cycle and both copies belong in the JSON envelope.
	const ancestors: object[] = [];
	try {
		const serialized = JSON.stringify(value, function (_key, child: unknown) {
			if (typeof child === 'bigint') return child.toString();
			if (typeof child === 'number' && !Number.isFinite(child)) return String(child);
			if (typeof child === 'object' && child !== null) {
				while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
				if (ancestors.includes(child)) return '[Circular]';
				ancestors.push(child);
			}
			return child;
		});
		return serialized === undefined ? null : (JSON.parse(serialized) as JsonValue);
	} catch {
		return '[Unserializable result]';
	}
}

function positiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function pageSizeGuidance(
	input: Readonly<Record<string, unknown>> | undefined,
	data: JsonValue
): PageSizeGuidance | null {
	const candidates = [
		{ parameter: 'pageSize', cursorParameter: 'cursor' },
		{ parameter: 'limit', cursorParameter: 'cursor' },
		{ parameter: 'groupPageSize', cursorParameter: 'groupCursor' }
	] as const;
	for (const candidate of candidates) {
		const requested = positiveInteger(input?.[candidate.parameter]);
		if (requested === null) continue;
		const cursor = input?.[candidate.cursorParameter];
		return {
			...candidate,
			requested,
			suggested: Math.max(1, Math.floor(requested / 2)),
			...(typeof cursor === 'string' && cursor.length <= 128 ? { cursor } : {})
		};
	}

	// Paginated controllers may use their documented default when pageSize is omitted.
	const pagination =
		typeof data === 'object' && data !== null && !Array.isArray(data) &&
		typeof data.pagination === 'object' && data.pagination !== null && !Array.isArray(data.pagination)
			? data.pagination
			: null;
	const requested = positiveInteger(pagination?.pageSize);
	if (requested === null) return null;
	return {
		parameter: 'pageSize',
		requested,
		suggested: Math.max(1, Math.floor(requested / 2))
	};
}

export function createResultEnvelope(
	result: WebMcpControllerResult,
	maxChars = MAX_WEBMCP_ENVELOPE_CHARS,
	input?: Readonly<Record<string, unknown>>
): WebMcpEnvelope {
	const budget = clampBudget(maxChars);
	const summary = cleanText(result.summary, 'Tool completed.', 320);
	const data = toJsonValue(result.data);
	const complete: WebMcpSuccessEnvelope = {
		ok: true,
		summary,
		data,
		meta: { truncated: false }
	};
	const serializedChars = JSON.stringify(complete).length;
	if (serializedChars <= budget) return complete;

	const guidance = pageSizeGuidance(input, data);
	const nextAction = guidance
		? guidance.requested > 1
			? `Retry this page with ${guidance.parameter}=${guidance.suggested}${guidance.cursor ? ` and the same ${guidance.cursorParameter}` : ''}.`
			: `Keep ${guidance.parameter}=1 and narrow the requested fields or items.`
		: 'Retry with fewer requested items or use a narrower read tool.';
	const oversized = createErrorEnvelope(
		new Error('The tool result exceeds its output limit.'),
		{
			code: 'result_too_large',
			retryable: true,
			details: {
				maxChars: budget,
				serializedChars,
				...(guidance
					? {
						pageSizeParameter: guidance.parameter,
						requestedPageSize: guidance.requested,
						suggestedPageSize: guidance.suggested,
						...(guidance.cursorParameter
							? { retryCursorParameter: guidance.cursorParameter }
							: {}),
						...(guidance.cursor ? { retryCursor: guidance.cursor } : {})
					}
					: {}),
				nextAction
			},
			maxChars: budget
		}
	);
	// The controller completed, but its data did not cross the output boundary.
	oversized.meta.truncated = true;
	return oversized;
}

export interface CreateErrorEnvelopeOptions {
	code?: string;
	retryable?: boolean;
	details?: unknown;
	maxChars?: number;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'The tool could not complete the request.';
}

export function createErrorEnvelope(
	error: unknown,
	options: CreateErrorEnvelopeOptions = {}
): WebMcpErrorEnvelope {
	const budget = clampBudget(options.maxChars ?? MAX_WEBMCP_ENVELOPE_CHARS);
	const code = cleanText(options.code, 'tool_execution_failed', 64)
		.toLowerCase()
		.replace(/[^a-z0-9_.-]+/g, '_');
	let message = cleanText(errorMessage(error), 'The tool could not complete the request.', 900);
	let details = options.details === undefined ? undefined : toJsonValue(options.details);
	let truncated = message.length < cleanText(errorMessage(error), '', Number.MAX_SAFE_INTEGER).length;
	const build = (): WebMcpErrorEnvelope => ({
		ok: false,
		error: {
			code,
			message,
			retryable: options.retryable ?? false,
			...(details === undefined ? {} : { details })
		},
		meta: { truncated }
	});

	while (message.length > 0 && JSON.stringify(build()).length > budget) {
		message = message.slice(0, Math.max(0, message.length - 24));
		truncated = true;
	}
	if (JSON.stringify(build()).length > budget) {
		details = undefined;
		truncated = true;
	}
	return build();
}

export function envelopeLength(envelope: WebMcpEnvelope): number {
	return JSON.stringify(envelope).length;
}
