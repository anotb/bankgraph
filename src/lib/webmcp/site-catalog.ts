import { BANK_SCREEN_SORTS, type BankScreenSort } from '$lib/bank-screen.js';
import { BOARD_TEMPLATES } from '$lib/atlas/templates.js';
import {
	arrayValue,
	cert,
	enumValue,
	inputObject,
	integer,
	optionalNumber,
	optionalString,
	reportingPeriod,
	stateCode,
	stringValue,
	unique,
	WebMcpInputError
} from './runtime.js';
import type {
	WebMcpBankSearchRequest,
	WebMcpBankSearchResult
} from './catalog.js';
import type {
	TightJsonSchema,
	TightObjectSchema,
	WebMcpControllerContext,
	WebMcpToolDefinition
} from './types.js';

const ACTIVE_VALUES = ['any', 'active', 'inactive'] as const;
const ORDER_VALUES = ['asc', 'desc'] as const;
const APPEARANCES = ['light', 'dark'] as const;
const DESTINATIONS = ['home', 'research', 'institutions', 'economy', 'methods', 'bank'] as const;
const TEMPLATE_IDS = ['blank', ...BOARD_TEMPLATES.map((template) => template.id)] as const;

const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true } as const;
const LOCAL_ACTION = { readOnlyHint: false, untrustedContentHint: true } as const;

const STRING = (maxLength: number, description?: string, minLength?: number): TightJsonSchema => ({
	type: 'string',
	maxLength,
	...(minLength === undefined ? {} : { minLength }),
	...(description ? { description } : {})
});
const ENUM = (values: readonly string[], description?: string): TightJsonSchema => ({
	type: 'string',
	maxLength: Math.max(...values.map((value) => value.length)),
	enum: values,
	...(description ? { description } : {})
});
const NUMBER = (minimum: number, maximum: number, description?: string): TightJsonSchema => ({
	type: 'number',
	minimum,
	maximum,
	...(description ? { description } : {})
});
const INTEGER = (minimum: number, maximum: number, description?: string): TightJsonSchema => ({
	type: 'integer',
	minimum,
	maximum,
	...(description ? { description } : {})
});
const ARRAY = (items: TightJsonSchema, maxItems: number, description?: string): TightJsonSchema => ({
	type: 'array',
	items,
	maxItems,
	uniqueItems: true,
	...(description ? { description } : {})
});
const OBJECT = (
	properties: Record<string, TightJsonSchema>,
	required: readonly string[] = []
): TightObjectSchema => ({
	type: 'object',
	properties,
	...(required.length ? { required } : {}),
	additionalProperties: false
});

export interface SiteWebMcpContext {
	path: string;
	latestQuarter: string | null;
	activeBankCount: number;
	liveDataState: 'live' | 'unavailable';
}

export interface SiteWebMcpDependencies {
	context(): SiteWebMcpContext;
	searchBanks(request: WebMcpBankSearchRequest, context: WebMcpControllerContext): Promise<WebMcpBankSearchResult>;
	open(path: string): void;
	appearance(): 'light' | 'dark';
	setAppearance(theme: 'light' | 'dark'): boolean;
}

export interface SiteNavigationDependencies {
	open(path: string): void;
}

function parseStates(value: unknown): string[] {
	if (value === undefined) return [];
	return unique(arrayValue(value, 'states', { max: 10, map: (item, index) => stateCode(item, `states[${index}]`) }), 'states');
}

function parseCerts(value: unknown): number[] {
	if (value === undefined) return [];
	return unique(arrayValue(value, 'certs', { max: 10, map: (item, index) => cert(item, `certs[${index}]`) }), 'certs');
}

function delayedOpen(deps: SiteNavigationDependencies, path: string): void {
	deps.open(path);
}

/** One cross-route capability that remains useful on every Bankgraph page. */
export function createSiteNavigationTool(deps: SiteNavigationDependencies): WebMcpToolDefinition {
	return {
		name: 'bankgraph.navigate',
		title: 'Navigate Bankgraph',
		description: 'Move this tab to any Bankgraph surface: the system homepage, research board, institution directory, economy, methodology, or a bank profile. A research destination can carry a question, layout, banks, states, asset range, and reporting quarter into the full board toolset.',
		inputSchema: OBJECT({
			destination: ENUM(DESTINATIONS),
			question: STRING(500, 'Research question to place on the board.'),
			template: ENUM(TEMPLATE_IDS, 'Optional research layout. Use blank when the agent should compose the board.'),
			cert: INTEGER(1, 99_999_999, 'FDIC certificate number when destination is bank.'),
			certs: ARRAY(INTEGER(1, 99_999_999), 10, 'FDIC certificate numbers to select on a research board.'),
			states: ARRAY(STRING(2, 'Two-letter state code.', 2), 10),
			assetMin: NUMBER(0, 100_000_000_000_000, 'Minimum assets in FDIC USD thousands.'),
			assetMax: NUMBER(0, 100_000_000_000_000, 'Maximum assets in FDIC USD thousands.'),
			asOf: STRING(8, 'Quarter-end YYYYMMDD or YYYQn.', 6)
		}, ['destination']),
		annotations: LOCAL_ACTION,
		controller: (input) => {
			const source = inputObject(input, ['destination', 'question', 'template', 'cert', 'certs', 'states', 'assetMin', 'assetMax', 'asOf']);
			const destination = enumValue(source.destination, 'destination', DESTINATIONS);
			let path: string;
			if (destination === 'bank') {
				if (source.cert === undefined) throw new WebMcpInputError('cert is required when destination is bank');
				path = `/bank/${cert(source.cert, 'cert')}`;
			} else if (destination === 'research') {
				const question = optionalString(source.question, 'question', { max: 500 });
				const template = source.template === undefined ? undefined : enumValue(source.template, 'template', TEMPLATE_IDS);
				const certs = parseCerts(source.certs);
				const states = parseStates(source.states);
				const assetMin = optionalNumber(source.assetMin, 'assetMin', 0, 1e14);
				const assetMax = optionalNumber(source.assetMax, 'assetMax', 0, 1e14);
				if (assetMin !== undefined && assetMax !== undefined && assetMin > assetMax) throw new WebMcpInputError('assetMin must not exceed assetMax');
				const asOf = source.asOf === undefined ? undefined : reportingPeriod(source.asOf, 'asOf');
				const params = new URLSearchParams();
				if (question) params.set('q', question);
				if (template && template !== 'blank') params.set('template', template);
				if (certs.length) params.set('certs', certs.join(','));
				if (states.length) params.set('states', states.join(','));
				if (assetMin !== undefined) params.set('asset_min', String(assetMin));
				if (assetMax !== undefined) params.set('asset_max', String(assetMax));
				if (asOf) params.set('asOf', asOf);
				path = `/b${params.size ? `?${params}` : ''}`;
			} else {
				path = ({ home: '/', institutions: '/banks', economy: '/economy', methods: '/methods' } as const)[destination];
			}
			delayedOpen(deps, path);
			return {
				summary: `Opening Bankgraph ${destination}.`,
				data: {
					destination,
					path,
					nextAction: destination === 'research' || destination === 'bank'
						? 'After the page changes, call bankgraph.get_context and continue with the full board tools.'
						: 'Continue with the tools registered by the destination page.'
				}
			};
		}
	};
}

export function createSiteWebMcpTools(deps: SiteWebMcpDependencies): WebMcpToolDefinition[] {
	const getSiteContext: WebMcpToolDefinition = {
		name: 'bankgraph.get_site_context',
		title: 'Read Bankgraph context',
		description: 'Read the current Bankgraph page, published FDIC quarter, available research layouts, and the actions an agent can take before entering the research board.',
		inputSchema: OBJECT({}),
		annotations: READ_ONLY,
		maxResultChars: 32_768,
		controller: (input) => {
			inputObject(input, []);
			const context = deps.context();
			return {
				summary: `Bankgraph is showing ${context.path || '/'} with data through ${context.latestQuarter ?? 'an unavailable reporting period'}.`,
				data: {
					...context,
					appearance: deps.appearance(),
					researchLayouts: BOARD_TEMPLATES.map((template) => ({
						id: template.id,
						name: template.name,
						description: template.description,
						startingQuestion: template.start?.question ?? null
					})),
					nextAction: 'Use bankgraph.navigate with destination research for analysis; the full analytical toolset registers after the board opens.'
				}
			};
		}
	};

	const searchBanks: WebMcpToolDefinition = {
		name: 'bankgraph.search_banks',
		title: 'Search US banks',
		description: 'Search the current FDIC institution snapshot by name, state, activity, and asset size before opening a bank or starting a research board. Returns up to 50 banks and an offset for the next page.',
		inputSchema: OBJECT({
			query: STRING(120, 'Bank name, city, or FDIC certificate search text.'),
			states: ARRAY(STRING(2, 'Two-letter state code.', 2), 10),
			active: ENUM(ACTIVE_VALUES),
			assetMin: NUMBER(0, 100_000_000_000_000, 'Minimum assets in FDIC USD thousands; 50,000,000 means $50B.'),
			assetMax: NUMBER(0, 100_000_000_000_000, 'Maximum assets in FDIC USD thousands.'),
			sort: ENUM(BANK_SCREEN_SORTS),
			order: ENUM(ORDER_VALUES),
			limit: INTEGER(1, 50),
			offset: INTEGER(0, 100_000)
		}),
		annotations: READ_ONLY,
		maxResultChars: 32_768,
		controller: async (input, context) => {
			const source = inputObject(input, ['query', 'states', 'active', 'assetMin', 'assetMax', 'sort', 'order', 'limit', 'offset']);
			const assetMin = optionalNumber(source.assetMin, 'assetMin', 0, 1e14) ?? null;
			const assetMax = optionalNumber(source.assetMax, 'assetMax', 0, 1e14) ?? null;
			if (assetMin !== null && assetMax !== null && assetMin > assetMax) throw new WebMcpInputError('assetMin must not exceed assetMax');
			const limit = source.limit === undefined ? 25 : integer(source.limit, 'limit', 1, 50);
			const offset = source.offset === undefined ? 0 : integer(source.offset, 'offset', 0, 100_000);
			const request: WebMcpBankSearchRequest = {
				query: optionalString(source.query, 'query', { max: 120 }) ?? '',
				states: parseStates(source.states),
				active: source.active === undefined ? 'active' : enumValue(source.active, 'active', ACTIVE_VALUES),
				assetMin,
				assetMax,
				conditions: [],
				sort: (source.sort === undefined ? 'assets' : enumValue(source.sort, 'sort', BANK_SCREEN_SORTS)) as BankScreenSort,
				order: source.order === undefined ? 'desc' : enumValue(source.order, 'order', ORDER_VALUES),
				limit,
				offset
			};
			const result = await deps.searchBanks(request, context);
			const nextOffset = offset + result.banks.length < result.total ? offset + result.banks.length : null;
			return {
				summary: `Found ${result.total.toLocaleString('en-US')} matching institutions; returned ${result.banks.length}.`,
				data: {
					banks: result.banks.map((bank) => ({
						cert: bank.cert,
						name: bank.name,
						city: bank.city,
						state: bank.state,
						totalAssets: bank.totalAssets,
						latestQuarter: bank.latestQuarter
					})),
					total: result.total,
					offset,
					limit,
					nextOffset,
					asOf: result.asOf,
					sourceMode: result.sourceMode,
					assetUnit: 'usd_thousands',
					truncated: result.truncated
				}
			};
		}
	};

	const setAppearance: WebMcpToolDefinition = {
		name: 'bankgraph.set_appearance',
		title: 'Set appearance',
		description: 'Switch every Bankgraph surface in this browser between the day and night themes.',
		inputSchema: OBJECT({ theme: ENUM(APPEARANCES) }, ['theme']),
		annotations: LOCAL_ACTION,
		controller: (input) => {
			const source = inputObject(input, ['theme']);
			const theme = enumValue(source.theme, 'theme', APPEARANCES);
			const changed = deps.setAppearance(theme);
			return { summary: changed ? `Switched Bankgraph to ${theme}.` : `Bankgraph is already using ${theme}.`, data: { theme, changed } };
		}
	};

	return [getSiteContext, searchBanks, createSiteNavigationTool(deps), setAppearance];
}
