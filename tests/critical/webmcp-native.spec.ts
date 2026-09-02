import { expect, test, type Page } from '@playwright/test';

interface NativeWebMcpEnvelope {
	ok: boolean;
	data?: Record<string, unknown>;
	error?: { code?: string; retryable?: boolean; details?: Record<string, unknown> };
}

interface BoardRead {
	workspaceRevision: number;
	blocks: Array<{ id: string; kind: string; title: string; binding?: { view?: string } }>;
	presentation: {
		presentationRevision: number;
		theme: 'light' | 'dark';
		overrides: Record<string, unknown>;
	};
}

declare global {
	interface Window {
		__bankgraphWebMcpE2E?: {
			names(): string[];
			abortedNames(): string[];
			invoke(name: string, input: Record<string, unknown>): Promise<NativeWebMcpEnvelope>;
		};
	}
}

async function invoke(page: Page, name: string, input: Record<string, unknown> = {}) {
	return page.evaluate(async ({ toolName, toolInput }) => {
		const harness = window.__bankgraphWebMcpE2E;
		if (!harness) throw new Error('WebMCP test harness is unavailable');
		return harness.invoke(toolName, toolInput);
	}, { toolName: name, toolInput: input });
}

async function readBoard(page: Page): Promise<BoardRead> {
	const result = await invoke(page, 'bankgraph.read_research_board');
	if (!result.ok) throw new Error(`read_research_board failed: ${JSON.stringify(result.error)}`);
	return result.data as unknown as BoardRead;
}

async function expectWorkspaceTools(page: Page) {
	const required = [
		'bankgraph.read_research_board',
		'bankgraph.read_board_block',
		'bankgraph.list_board_templates',
		'bankgraph.apply_board_template',
		'bankgraph.configure_board_view',
		'bankgraph.clear_research_board',
		'bankgraph.reset_board_layout',
		'bankgraph.reset_research_board',
		'bankgraph.set_appearance',
		'bankgraph.analyze_failure_patterns'
	];
	await expect.poll(() => page.evaluate(() => window.__bankgraphWebMcpE2E?.names() ?? [])).toEqual(
		expect.arrayContaining(required)
	);
}

const failurePattern = {
	analysis: 'historical_failure_pattern_and_current_similarity',
	semantics: {
		kind: 'descriptive_similarity',
		statement: 'Reported trajectories are mathematically similar.',
		notA: ['failure probability', 'forecast']
	},
	request: {
		startYear: 2007,
		endYear: 2012,
		quarters: 4,
		limit: 25,
		transactionType: 'FAILURE',
		anchorRule: 'latest FDIC quarter strictly before failure date'
	},
	featureSet: [{
		id: 'noncurrent_loan_ratio',
		label: 'Noncurrent loan ratio',
		unit: 'percent',
		sourceFields: ['NCLNLSR'],
		formula: 'FDIC-reported noncurrent loans as a share of loans'
	}],
	historicalCohort: {
		sourceFailureRecords: 1,
		withCertificate: 1,
		withPreFailureAnchor: 1,
		withExactQuarterHistory: 1,
		excludedWithoutCertificate: 0,
		excludedWithoutAnchor: 0,
		excludedForQuarterGaps: 0,
		members: [{
			sourceId: 'failure-1', cert: 100, name: 'Example Failed Bank', city: 'Chicago', state: 'IL',
			failDate: '20120113', anchorRepdte: '20110930'
		}]
	},
	eventStudy: {
		timeBasis: 'quarters before failure',
		series: [{
			metric: 'noncurrent_loan_ratio',
			label: 'Noncurrent loan ratio',
			unit: 'percent',
			points: [-4, -3, -2, -1].map((relativeQuarter, index) => ({
				relativeQuarter,
				median: 1 + index,
				q25: 0.8 + index,
				q75: 1.2 + index,
				count: 1,
				cohortCount: 1,
				coverage: 1,
				referenceScale: 0.25,
				referenceScaleMethod: 'feature_floor'
			}))
		}]
	},
	currentAnalogues: {
		asOf: '20260630',
		activeInstitutionsWithFinancialRows: 2,
		withExactQuarterHistory: 2,
		returned: 0,
		rankingMethod: 'Robust standardized trajectory distance.',
		data: []
	},
	methodology: {
		historicalMembership: 'FDIC failures.',
		quarterCompleteness: 'Exact quarters.',
		referenceCenter: 'Median.',
		referenceScale: 'MAD with a feature floor.',
		missingness: 'Missing values remain null.',
		ranking: 'Descriptive similarity only.',
		controls: 'No probability or forecast.'
	},
	provenance: {
		release: '20260630',
		release_generation: 'ci-smoke-generation',
		source: 'FDIC BankFind Suite',
		sourceUrl: 'https://banks.data.fdic.gov/bankfind-suite',
		datasets: ['Failures & Assistance Transactions', 'Financials', 'Institutions'],
		sourceAsOf: '20260630',
		sourceFields: {}
	}
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.removeItem('bankgraph-workspace-v1');
		localStorage.removeItem('atlas.layout.v1');
		localStorage.setItem('atlas.night', '0');

		type NativeTool = {
			name: string;
			execute(input: Record<string, unknown>, options: { signal: AbortSignal }): Promise<NativeWebMcpEnvelope>;
		};
		const active = new Map<string, NativeTool>();
		const aborted = new Set<string>();
		Object.defineProperty(document, 'modelContext', {
			configurable: true,
			value: {
				async registerTool(tool: NativeTool, options?: { signal?: AbortSignal }) {
					if (active.has(tool.name)) throw new DOMException('duplicate tool', 'InvalidStateError');
					if (options?.signal?.aborted) throw options.signal.reason;
					active.set(tool.name, tool);
					options?.signal?.addEventListener('abort', () => {
						if (active.get(tool.name) === tool) active.delete(tool.name);
						aborted.add(tool.name);
					}, { once: true });
				}
			}
		});
		window.__bankgraphWebMcpE2E = {
			names: () => [...active.keys()].sort(),
			abortedNames: () => [...aborted].sort(),
			async invoke(name, input) {
				const tool = active.get(name);
				if (!tool) throw new Error(`Native tool ${name} is not registered`);
				return tool.execute(input, { signal: new AbortController().signal });
			}
		};
	});
});

test('native WebMCP reads the same chart data and controls the visible board lifecycle', async ({ page }) => {
	await page.goto('/b?template=one_bank&certs=900001');
	await expectWorkspaceTools(page);
	await expect(page.locator('article[data-block]')).toHaveCount(5);

	let board = await readBoard(page);
	const history = board.blocks.find((block) => block.kind === 'history');
	expect(history).toBeTruthy();
	const chartRead = await invoke(page, 'bankgraph.read_board_block', {
		blockId: history!.id,
		pageSize: 100
	});
	expect(chartRead).toMatchObject({
		ok: true,
		data: {
			block: { id: history!.id, kind: 'history' },
			numerical: {
				items: expect.arrayContaining([
					expect.objectContaining({ cert: 900001, period: '20260630' })
				]),
				metadata: { sources: expect.any(Array) }
			}
		}
	});

	const appearance = await invoke(page, 'bankgraph.set_appearance', { theme: 'dark' });
	expect(appearance).toMatchObject({ ok: true, data: { changed: true } });
	await expect(page.locator('html')).toHaveClass(/night/);
	board = await readBoard(page);
	expect(board.presentation.theme).toBe('dark');

	const firstId = board.blocks[0].id;
	const configured = await invoke(page, 'bankgraph.configure_board_view', {
		blockId: firstId,
		width: 'full',
		height: 'tall',
		role: 'lead',
		presentation: 'auto',
		followWorkspace: true,
		ifRevision: board.workspaceRevision,
		ifPresentationRevision: board.presentation.presentationRevision
	});
	expect(configured).toMatchObject({ ok: true, data: { changed: true } });
	await expect(page.locator(`article[data-block="${firstId}"]`)).toHaveClass(/tall/);

	board = await readBoard(page);
	const resetLayout = await invoke(page, 'bankgraph.reset_board_layout', {
		ifRevision: board.workspaceRevision,
		ifPresentationRevision: board.presentation.presentationRevision
	});
	expect(resetLayout).toMatchObject({ ok: true, data: { changed: true } });
	await expect(page.locator(`article[data-block="${firstId}"]`)).not.toHaveClass(/tall/);

	board = await readBoard(page);
	const cleared = await invoke(page, 'bankgraph.clear_research_board', {
		ifRevision: board.workspaceRevision,
		ifPresentationRevision: board.presentation.presentationRevision
	});
	expect(cleared).toMatchObject({ ok: true, data: { changed: true } });
	await expect(page.locator('article[data-block]')).toHaveCount(0);

	board = await readBoard(page);
	const applied = await invoke(page, 'bankgraph.apply_board_template', {
		templateId: 'one_bank',
		mode: 'replace',
		focus: false,
		ifRevision: board.workspaceRevision,
		ifPresentationRevision: board.presentation.presentationRevision
	});
	if (!applied.ok) throw new Error(`apply_board_template failed: ${JSON.stringify(applied.error)}`);
	expect(applied.data).toMatchObject({ changed: true });
	await expect(page.locator('article[data-block]')).toHaveCount(5);

	board = await readBoard(page);
	const reset = await invoke(page, 'bankgraph.reset_research_board', {
		ifRevision: board.workspaceRevision,
		ifPresentationRevision: board.presentation.presentationRevision
	});
	expect(reset).toMatchObject({ ok: true, data: { changed: true } });
	await expect(page.locator('article[data-block]')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Board question' })).toHaveValue('');

	await page.getByRole('link', { name: 'Bankgraph home' }).click();
	await expect(page).toHaveURL('/');
	await expect.poll(() => page.evaluate(() => window.__bankgraphWebMcpE2E?.names() ?? [])).toEqual([]);
	await expect.poll(() => page.evaluate(() => window.__bankgraphWebMcpE2E?.abortedNames() ?? [])).toContain(
		'bankgraph.read_research_board'
	);
});

test('a failure-pattern call publishes a readable analysis into the live board', async ({ page }) => {
	await page.route('**/api/v2/research/failure-patterns?*', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failurePattern) });
	});
	await page.goto('/b');
	await expectWorkspaceTools(page);

	const context = await invoke(page, 'bankgraph.get_context');
	const revision = context.data?.revision;
	expect(typeof revision).toBe('number');
	const analysis = await invoke(page, 'bankgraph.analyze_failure_patterns', {
		startYear: 2007,
		endYear: 2012,
		quarters: 4,
		limit: 25,
		boardBlockId: 'failure-demo',
		boardTitle: 'Before failure',
		boardView: 'event_study',
		boardSpan: 'full',
		boardFocus: false,
		ifRevision: revision
	});
	expect(analysis).toMatchObject({
		ok: true,
		data: {
			kind: 'failure_pattern',
			board: { blockId: 'failure-demo', visible: true },
			workspace: { changed: true }
		}
	});
	await expect(page.locator('article[data-block="failure-demo"]')).toBeVisible();

	const board = await readBoard(page);
	expect(board.blocks).toEqual(expect.arrayContaining([
		expect.objectContaining({ id: 'failure-demo', kind: 'analysis', title: 'Before failure' })
	]));
	const read = await invoke(page, 'bankgraph.read_board_block', {
		blockId: 'failure-demo',
		section: 'series',
		pageSize: 10
	});
	expect(read).toMatchObject({
		ok: true,
		data: {
			block: { id: 'failure-demo', kind: 'analysis' },
			availableSections: expect.arrayContaining(['series', 'analogues']),
			numerical: {
				items: [expect.objectContaining({ metric: 'noncurrent_loan_ratio' })],
				total: 1
			}
		}
	});
});
