import { describe, expect, it, vi } from 'vitest';
import { createHomeAgentTools } from './home-agent-tools';
import { createWebMcpToolHost, validateToolDefinition } from '$lib/webmcp';

const context = { signal: new AbortController().signal, scope: 'bankgraph-home', toolName: 'test' };

describe('homepage WebMCP tools', () => {
	it('publishes tight schemas and explicit trust annotations', () => {
		const tools = createHomeAgentTools({ fetch: vi.fn(), openWorkspace: vi.fn() });
		expect(tools.map(validateToolDefinition)).toEqual([[], []]);
		expect(tools[0].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
		expect(tools[1].annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false });
	});

	it('registers both homepage tools through the shared host', async () => {
		const registerTool = vi.fn(async () => undefined);
		const host = createWebMcpToolHost({ modelContext: { registerTool } });
		const tools = createHomeAgentTools({ fetch: vi.fn(), openWorkspace: vi.fn() });
		const result = await host.syncScope('bankgraph-home', tools);

		expect(result.registered).toEqual(['bankgraph.search_banks', 'bankgraph.start_research']);
		expect(host.getDiagnostics().registrations.every((item) => item.status === 'registered')).toBe(true);
	});

	it('returns a bounded, ranked directory response', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ cert: 628, name: 'JPMorgan Chase Bank, National Association', city: 'Columbus', state: 'OH', active: 1, total_assets: 4_000_000_000 }], total: 1 }), { status: 200 }));
		const tools = createHomeAgentTools({ fetch: fetcher, openWorkspace: vi.fn() });
		const result = await tools[0].controller({ query: '628', limit: 3 }, context);

		expect(fetcher).toHaveBeenCalledWith('/api/v1/banks?q=628&active=all&limit=3', expect.objectContaining({ signal: context.signal }));
		expect(result.data).toMatchObject({ returned: 1, matches: [{ cert: 628, state: 'OH' }] });
	});

	it('opens a visible workspace with the requested question', async () => {
		const openWorkspace = vi.fn();
		const tools = createHomeAgentTools({ fetch: vi.fn(), openWorkspace });
		const result = await tools[1].controller({ question: 'Which banks are growing loans fastest?' }, context);

		expect(openWorkspace).toHaveBeenCalledOnce();
		expect(String(openWorkspace.mock.calls[0][0])).toContain('/b?');
		expect(result.summary).toContain('Opened');
	});
});
