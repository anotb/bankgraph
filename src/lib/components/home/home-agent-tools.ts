import { buildWorkspaceHref } from './workspace-links';
import { inputObject, integer, stringValue } from '$lib/webmcp/runtime';
import type { WebMcpToolDefinition } from '$lib/webmcp';

type SearchFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HomeAgentToolDependencies {
	fetch: SearchFetch;
	openWorkspace: (href: string) => void | Promise<void>;
}

export function createHomeAgentTools(dependencies: HomeAgentToolDependencies): WebMcpToolDefinition[] {
	return [
		{
			name: 'bankgraph.search_banks',
			title: 'Search the FDIC institution directory',
			description: 'Find active or historical U.S. banking institutions by name, headquarters city, state code, or exact FDIC certificate. Returns up to eight ranked matches from Bankgraph’s published institution directory.',
			inputSchema: {
				type: 'object', additionalProperties: false,
				properties: {
					query: { type: 'string', minLength: 1, maxLength: 100, description: 'Institution name, city, two-letter state code, or FDIC certificate.' },
					limit: { type: 'integer', minimum: 1, maximum: 8, description: 'Maximum matches to return.' }
				}, required: ['query']
			},
			annotations: { readOnlyHint: true, untrustedContentHint: true },
			controller: async (raw, context) => {
				const input = inputObject(raw, ['query', 'limit']);
				const query = stringValue(input.query, 'query', { min: 1, max: 100 });
				const limit = input.limit === undefined ? 8 : integer(input.limit, 'limit', 1, 8);
				const response = await dependencies.fetch(`/api/v1/banks?q=${encodeURIComponent(query)}&active=all&limit=${limit}`, { signal: context.signal });
				if (!response.ok) throw new Error(`Institution directory returned ${response.status}`);
				const payload = await response.json() as { data?: Array<Record<string, unknown>>; total?: number };
				const matches = (payload.data ?? []).slice(0, limit).map((bank) => ({
					cert: bank.cert, name: bank.name, city: bank.city, state: bank.state,
					active: bank.active, totalAssets: bank.total_assets
				}));
				return { summary: `Found ${matches.length} institution${matches.length === 1 ? '' : 's'} for “${query}”.`, data: { query, matches, returned: matches.length, totalMatches: payload.total ?? matches.length } };
			}
		},
		{
			name: 'bankgraph.start_research',
			title: 'Start a Bankgraph research workspace',
			description: 'Open Bankgraph’s shared research workspace around a bounded question. The human can see and continue from the same workspace immediately.',
			inputSchema: {
				type: 'object', additionalProperties: false,
				properties: { question: { type: 'string', minLength: 3, maxLength: 500, description: 'A clear research question about U.S. banks or the banking system.' } },
				required: ['question']
			},
			annotations: { readOnlyHint: false, untrustedContentHint: false },
			controller: async (raw) => {
				const input = inputObject(raw, ['question']);
				const question = stringValue(input.question, 'question', { min: 3, max: 500 });
				const href = buildWorkspaceHref({ question, panel: 'screen' });
				await dependencies.openWorkspace(href);
				return { summary: 'Opened a Bankgraph research workspace.', data: { question, href } };
			}
		}
	];
}
