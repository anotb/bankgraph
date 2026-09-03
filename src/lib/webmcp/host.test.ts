import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRevisionConflictError } from '$lib/workspace/index.js';
import { createWebMcpToolHost } from './host.js';
import { MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS } from './envelope.js';
import type {
	ModelContextLike,
	ModelContextRegisterOptions,
	NativeModelContextTool,
	TightObjectSchema,
	WebMcpToolDefinition
} from './types.js';

class FakeModelContext implements ModelContextLike {
	readonly calls: Array<{ tool: NativeModelContextTool; options?: ModelContextRegisterOptions }> = [];
	readonly active = new Map<string, NativeModelContextTool>();
	failName?: string;

	async registerTool(
		tool: NativeModelContextTool,
		options?: ModelContextRegisterOptions
	): Promise<void> {
		this.calls.push({ tool, options });
		if (this.failName === tool.name) throw new DOMException('registration denied', 'NotAllowedError');
		if (this.active.has(tool.name)) throw new DOMException('duplicate', 'InvalidStateError');
		if (options?.signal?.aborted) throw options.signal.reason;
		this.active.set(tool.name, tool);
		options?.signal?.addEventListener(
			'abort',
			() => {
				if (this.active.get(tool.name) === tool) this.active.delete(tool.name);
			},
			{ once: true }
		);
	}
}

const EMPTY_SCHEMA: TightObjectSchema = {
	type: 'object',
	properties: {},
	required: [],
	additionalProperties: false
};

function tool(
	name: string,
	controller: WebMcpToolDefinition['controller'] = async () => ({ summary: 'Done.', data: null })
): WebMcpToolDefinition {
	return {
		name,
		title: `Tool ${name}`,
		description: `Run ${name} for the active route.`,
		inputSchema: EMPTY_SCHEMA,
		annotations: { readOnlyHint: true, untrustedContentHint: false },
		controller
	};
}

describe('createWebMcpToolHost', () => {
	it('feature-detects and safely degrades when modelContext is unavailable', async () => {
		const host = createWebMcpToolHost({ modelContext: null });
		const result = await host.syncScope('route', [tool('bank_search')]);

		expect(result.available).toBe(false);
		expect(result.registered).toEqual([]);
		expect(host.getDiagnostics().feature.reason).toBe('missing-model-context');
		expect(host.getDiagnostics().events.at(-1)?.status).toBe('unavailable');
	});

	it('registers scoped tools and aborts registration on cleanup', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const result = await host.syncScope('banks', [tool('bank_search')]);

		expect(result.registered).toEqual(['bank_search']);
		expect(context.active.has('bank_search')).toBe(true);
		expect(context.calls[0].options?.signal?.aborted).toBe(false);

		host.disposeScope('banks');
		expect(context.calls[0].options?.signal?.aborted).toBe(true);
		expect(context.active.has('bank_search')).toBe(false);
		expect(host.getDiagnostics().registrations[0].status).toBe('removed');
	});

	it('preserves catalog priority while the remaining tools register', async () => {
		let releaseTail: (() => void) | undefined;
		const tailGate = new Promise<void>((resolve) => {
			releaseTail = resolve;
		});
		class GatedModelContext extends FakeModelContext {
			readonly started: string[] = [];

			override async registerTool(
				registeredTool: NativeModelContextTool,
				options?: ModelContextRegisterOptions
			): Promise<void> {
				this.started.push(registeredTool.name);
				if (registeredTool.name !== 'bankgraph.get_context') await tailGate;
				await super.registerTool(registeredTool, options);
			}
		}
		const context = new GatedModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const pending = host.syncScope('board', [
			tool('bankgraph.get_context'),
			tool('bankgraph.z_last'),
			tool('bankgraph.a_later')
		]);

		await vi.waitFor(() => expect(context.calls).toHaveLength(1));
		expect(context.calls[0].tool.name).toBe('bankgraph.get_context');
		expect(context.active.has('bankgraph.get_context')).toBe(true);
		await vi.waitFor(() =>
			expect(context.started).toEqual([
				'bankgraph.get_context',
				'bankgraph.z_last',
				'bankgraph.a_later'
			])
		);
		expect(context.calls).toHaveLength(1);

		releaseTail?.();
		const result = await pending;
		expect(context.calls.map(({ tool: registeredTool }) => registeredTool.name)).toEqual([
			'bankgraph.get_context',
			'bankgraph.z_last',
			'bankgraph.a_later'
		]);
		expect(result.registered).toEqual([
			'bankgraph.get_context',
			'bankgraph.z_last',
			'bankgraph.a_later'
		]);
	});

	it('re-syncs idempotently while refreshing the live controller', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const first = vi.fn(async () => ({ summary: 'First.', data: 1 }));
		const second = vi.fn(async () => ({ summary: 'Second.', data: 2 }));

		await host.syncScope('bank', [tool('bank_summary', first)]);
		const result = await host.syncScope('bank', [tool('bank_summary', second)]);
		const registered = context.active.get('bank_summary');
		const output = await registered?.execute({}, { signal: new AbortController().signal });

		expect(result.unchanged).toEqual(['bank_summary']);
		expect(context.calls).toHaveLength(1);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
		expect(output).toMatchObject({ ok: true, summary: 'Second.', data: 2 });
	});

	it('passes explicit annotations and never invents an outputSchema', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const definition = tool('failure_feed');
		definition.annotations = { readOnlyHint: true, untrustedContentHint: true };

		await host.syncScope('failures', [definition]);
		const native = context.calls[0].tool;

		expect(native.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
		expect(Object.hasOwn(native, 'outputSchema')).toBe(false);
	});

	it('propagates the browser execution signal and rejects cancellation', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		let observedSignal: AbortSignal | undefined;
		const controller = vi.fn(
			(_input: Record<string, unknown>, { signal }: { signal: AbortSignal }) =>
				new Promise<never>((_resolve, reject) => {
					observedSignal = signal;
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		);
		await host.syncScope('risk', [tool('risk_history', controller)]);
		const executionController = new AbortController();
		const pending = context.active
			.get('risk_history')!
			.execute({}, { signal: executionController.signal });

		executionController.abort(new DOMException('agent stopped', 'AbortError'));
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(observedSignal).toBe(executionController.signal);
		expect(host.getDiagnostics().events.at(-1)).toMatchObject({
			phase: 'execution',
			status: 'cancelled'
		});
	});

	it('rejects duplicate names transactionally, including names owned by another scope', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });

		const duplicate = await host.syncScope('compare', [tool('compare_banks'), tool('compare_banks')]);
		expect(duplicate.failed.compare_banks).toContain('duplicate');
		expect(context.calls).toHaveLength(0);

		await host.syncScope('compare', [tool('compare_banks')]);
		const crossScope = await host.syncScope('industry', [tool('compare_banks')]);
		expect(crossScope.failed.compare_banks).toContain('already owned');
		expect(context.calls).toHaveLength(1);
		expect(context.active.has('compare_banks')).toBe(true);
	});

	it('uses an external route signal to clean up every scoped registration', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const routeController = new AbortController();
		await host.syncScope('macro', [tool('macro_series'), tool('macro_snapshot')], {
			signal: routeController.signal
		});

		routeController.abort();
		expect(context.active.size).toBe(0);
		expect(context.calls.every((call) => call.options?.signal?.aborted)).toBe(true);
	});

	it('records registration timing and failures without blocking other tools', async () => {
		const context = new FakeModelContext();
		context.failName = 'denied_tool';
		let clock = 0;
		const host = createWebMcpToolHost({ modelContext: context, now: () => ++clock });
		const result = await host.syncScope('route', [tool('denied_tool'), tool('working_tool')]);

		expect(result.failed.denied_tool).toBe('registration denied');
		expect(result.registered).toEqual(['working_tool']);
		expect(host.getDiagnostics().registrations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ toolName: 'denied_tool', status: 'failed', registrationMs: 2 }),
				expect.objectContaining({ toolName: 'working_tool', status: 'registered', registrationMs: 2 })
			])
		);
	});

	it('rejects unbounded schemas before native registration', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const invalid = tool('wide_search') as WebMcpToolDefinition;
		invalid.inputSchema = {
			type: 'object',
			properties: {
				query: { type: 'string', maxLength: 10_000 }
			},
			required: ['query'],
			additionalProperties: false
		};

		const result = await host.syncScope('search', [invalid]);
		expect(result.failed.wide_search).toContain('maxLength');
		expect(context.calls).toHaveLength(0);
	});

	it('budgets canonical result and error envelopes to at most 1400 characters', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		await host.syncScope('catalog', [
			tool('large_result', async () => ({
				summary: 'Large result',
				data: {
					rows: Array.from({ length: 100 }, (_, index) => ({ index, name: 'x'.repeat(80) })),
					pagination: {
						pageSize: 20,
						nextCursor: 'bg1.large.returned-page-cursor'
					}
				}
			})),
			tool('failing_result', async () => {
				throw new Error('sensitive failure '.repeat(200));
			})
		]);

		const signal = new AbortController().signal;
		const large = await context.active.get('large_result')!.execute(
			{ pageSize: 20, cursor: 'bg1.large.request-page-cursor' },
			{ signal }
		);
		const failure = await context.active.get('failing_result')!.execute({}, { signal });

		expect(JSON.stringify(large).length).toBeLessThanOrEqual(1_400);
		expect(large).toMatchObject({
			ok: false,
			error: {
				code: 'result_too_large',
				retryable: true,
				details: {
					pageSizeParameter: 'pageSize',
					requestedPageSize: 20,
					suggestedPageSize: 10,
					retryCursorParameter: 'cursor',
					retryCursor: 'bg1.large.request-page-cursor',
					nextAction: 'Retry this page with pageSize=10 and the same cursor.'
				}
			},
			meta: { truncated: true }
		});
		expect(JSON.stringify(large)).not.toContain('bg1.large.returned-page-cursor');
		expect(host.getDiagnostics().events.findLast((event) => event.toolName === 'large_result'))
			.toMatchObject({ phase: 'execution', status: 'failure', code: 'result_too_large' });
		expect(JSON.stringify(failure).length).toBeLessThanOrEqual(1_400);
		expect(failure).toMatchObject({ ok: false, error: { code: 'tool_execution_failed' } });
	});

	it('translates workspace revision conflicts into the stable retry envelope', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		await host.syncScope('workspace', [
			tool('stale_mutation', async () => {
				throw new WorkspaceRevisionConflictError(3, 4);
			})
		]);

		const output = await context.active.get('stale_mutation')!.execute(
			{},
			{ signal: new AbortController().signal }
		);

		expect(output).toMatchObject({
			ok: false,
			error: {
				code: 'stale_revision',
				retryable: true,
				details: {
					expectedRevision: 3,
					currentRevision: 4,
					nextAction: 'bankgraph.get_context'
				}
			},
			meta: { truncated: false }
		});
		expect(host.getDiagnostics().events.at(-1)).toMatchObject({
			phase: 'execution',
			status: 'failure',
			code: 'stale_revision'
		});
	});

	it('keeps result-too-large guidance within a small declared envelope', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context, maxResultChars: 420 });
		await host.syncScope('catalog', [
			tool('small_budget', async () => ({
				summary: 'A result that cannot fit.',
				data: {
					rows: Array.from({ length: 20 }, () => 'x'.repeat(100)),
					pagination: { pageSize: 8, nextCursor: 'bg1.small.returned-cursor' }
				}
			}))
		]);

		const output = await context.active.get('small_budget')!.execute(
			{ pageSize: 8 },
			{ signal: new AbortController().signal }
		);

		expect(JSON.stringify(output).length).toBeLessThanOrEqual(420);
		expect(output).toMatchObject({
			ok: false,
			error: {
				code: 'result_too_large',
				details: { suggestedPageSize: 4 }
			}
		});
		expect(JSON.stringify(output)).not.toContain('bg1.small.returned-cursor');
	});

	it('honors a larger result budget only for the tool that declares it', async () => {
		const context = new FakeModelContext();
		const host = createWebMcpToolHost({ modelContext: context });
		const extended = tool('complete_reference', async () => ({
			summary: 'Reference created.',
			data: { payload: 'a'.repeat(20_000) }
		}));
		extended.maxResultChars = MAX_WEBMCP_EXTENDED_ENVELOPE_CHARS;
		await host.syncScope('catalog', [
			extended,
			tool('ordinary_reference', extended.controller)
		]);

		const signal = new AbortController().signal;
		const complete = await context.active.get('complete_reference')!.execute({}, { signal });
		const ordinary = await context.active.get('ordinary_reference')!.execute({}, { signal });

		expect(JSON.stringify(complete).length).toBeLessThanOrEqual(32_768);
		expect(complete).toMatchObject({
			ok: true,
			data: { payload: expect.stringContaining('a'.repeat(20_000)) },
			meta: { truncated: false }
		});
		expect(JSON.stringify(ordinary).length).toBeLessThanOrEqual(1_400);
		expect(ordinary).toMatchObject({
			ok: false,
			error: { code: 'result_too_large', retryable: true },
			meta: { truncated: true }
		});
	});
});
