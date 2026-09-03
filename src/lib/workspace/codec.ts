import {
	WORKSPACE_SCHEMA_VERSION,
	type ResearchBoardAnchorConfiguration,
	type ResearchBoardBlock,
	type WorkspaceState
} from './types';
import { createDefaultWorkspaceState } from './state';
import { WorkspaceValidationError, normalizePeriod, normalizeWorkspaceState } from './validation';

export const WORKSPACE_SEARCH_VERSION_PARAM = 'wv';
export const WORKSPACE_SEARCH_STATE_PARAM = 'ws';
export const WORKSPACE_SEARCH_META_PARAM = 'wm';

/** Hard browser/history budget for an encoded workspace query string. */
export const WORKSPACE_SHARE_MAX_ENCODED_LENGTH = 6_144;
export const WORKSPACE_SHARE_FINDING_SUMMARY_LENGTH = 96;
export const WORKSPACE_SHARE_FINDING_SOURCE_LENGTH = 160;

export interface WorkspaceShareMetadata {
	version: 1;
	maxEncodedLength: number;
	encodedLength: number;
	findingNotesTruncated: number;
	omittedNoteCharacters: number;
	findingSourcesTruncated: number;
	omittedSourceCharacters: number;
}

export class WorkspaceShareBudgetError extends Error {
	readonly direction: 'inbound' | 'outbound';
	readonly encodedLength: number;
	readonly maxEncodedLength: number;
	readonly metadata: WorkspaceShareMetadata;

	constructor(direction: 'inbound' | 'outbound', metadata: WorkspaceShareMetadata) {
		super(
			`Workspace share ${direction} state is ${metadata.encodedLength} encoded characters; ` +
			`the safe limit is ${metadata.maxEncodedLength}`
		);
		this.name = 'WorkspaceShareBudgetError';
		this.direction = direction;
		this.encodedLength = metadata.encodedLength;
		this.maxEncodedLength = metadata.maxEncodedLength;
		this.metadata = metadata;
	}
}

export type WorkspaceShareSerializationResult =
	| { ok: true; params: URLSearchParams; search: string; metadata: WorkspaceShareMetadata }
	| { ok: false; error: WorkspaceShareBudgetError; metadata: WorkspaceShareMetadata };

export interface DeserializedWorkspaceShare {
	state: WorkspaceState;
	metadata: WorkspaceShareMetadata;
}

type CompactWorkspaceV4 = [
	number,
	string,
	unknown,
	unknown,
	number | null,
	number[],
	number[],
	unknown,
	unknown,
	unknown[],
	string,
	unknown,
	unknown[],
	unknown[],
	string,
	string | null,
	unknown,
	unknown,
	unknown
];

function compactAnchorConfiguration(configuration: ResearchBoardAnchorConfiguration | undefined): unknown[] | null {
	if (!configuration) return null;
	return [
		configuration.bankSource === 'workspace' ? 'w' : 'f',
		configuration.certs ?? null,
		configuration.metricSource === 'workspace' ? 'w' : 'f',
		configuration.metrics ?? null,
		configuration.periodSource === 'workspace' ? 'w' : 'f',
		configuration.asOf ?? null,
		configuration.compareWith ?? null,
		configuration.historyFrom ?? null,
		configuration.historyTo ?? null
	];
}

interface ShareSanitization {
	findingNotesTruncated: number;
	omittedNoteCharacters: number;
	findingSourcesTruncated: number;
	omittedSourceCharacters: number;
}

function truncatePublicText(value: string, limit: number): { value: string; omitted: number } {
	const characters = Array.from(value);
	if (characters.length <= limit) return { value, omitted: 0 };
	return {
		value: `${characters.slice(0, limit - 1).join('')}…`,
		omitted: characters.length - (limit - 1)
	};
}

function compactBoardBlock(block: ResearchBoardBlock): unknown[] {
	switch (block.kind) {
		case 'history':
			return [
				'h', block.id, block.title, block.span, block.binding.certs, block.binding.metrics,
				block.binding.from, block.binding.to, block.binding.chartKind, block.binding.scale,
				compactAnchorConfiguration(block.anchorConfig)
			];
		case 'exact_table':
			return [
				't', block.id, block.title, block.span, block.binding.certs, block.binding.metrics,
				block.binding.from, block.binding.to, block.binding.followCurrent,
				compactAnchorConfiguration(block.anchorConfig)
			];
		case 'analysis':
			return ['a', block.id, block.title, block.span, block.binding.resultRef, block.binding.view];
		case 'workspace_view':
			return ['w', block.id, block.title, block.span, block.binding.view, compactAnchorConfiguration(block.anchorConfig)];
		case 'takeaway':
			return ['n', block.id, block.title, block.span, block.text, block.referenceBlockIds];
	}
}

function compact(state: WorkspaceState): { payload: CompactWorkspaceV4; sanitization: ShareSanitization } {
	const sanitization: ShareSanitization = {
		findingNotesTruncated: 0,
		omittedNoteCharacters: 0,
		findingSourcesTruncated: 0,
		omittedSourceCharacters: 0
	};
	const findings = state.findings.map((finding) => {
		const note = truncatePublicText(finding.note, WORKSPACE_SHARE_FINDING_SUMMARY_LENGTH);
		const source = finding.source === null
			? { value: null, omitted: 0 }
			: truncatePublicText(finding.source, WORKSPACE_SHARE_FINDING_SOURCE_LENGTH);
		if (note.omitted > 0) sanitization.findingNotesTruncated += 1;
		if (source.omitted > 0) sanitization.findingSourcesTruncated += 1;
		sanitization.omittedNoteCharacters += note.omitted;
		sanitization.omittedSourceCharacters += source.omitted;
		return [
			finding.id,
			finding.title,
			note.value,
			finding.certs,
			finding.metrics,
			finding.period,
			source.value,
			finding.provenance ?? null
		];
	});

	return { payload: [
		state.revision,
		state.question,
		[
			state.filters.query,
			state.filters.states,
			[state.filters.assetRange.min, state.filters.assetRange.max],
			state.filters.active,
			state.filters.metricConditions.map((condition) => [
				condition.metric,
				condition.operator,
				condition.value,
				condition.upperValue
			])
		],
		[
			state.results.total,
			state.results.returned,
			state.results.latestQuarter,
			state.results.refreshedAt,
			state.results.queryRevision,
			state.results.truncated
		],
		state.activeBank,
		state.selectedCerts,
		state.excludedCerts,
		[
			state.peerRecipe.name,
			state.peerRecipe.basis,
			state.peerRecipe.states,
			[state.peerRecipe.assetRange.min, state.peerRecipe.assetRange.max],
			state.peerRecipe.active,
			state.peerRecipe.metricConditions.map((condition) => [
				condition.metric,
				condition.operator,
				condition.value,
				condition.upperValue
			]),
			state.peerRecipe.minimumPeers,
			state.peerRecipe.maximumPeers
		],
		state.period.kind === 'quarter'
			? ['q', state.period.quarter]
			: ['r', state.period.from, state.period.to],
		state.charts.map((chart) => [
			chart.id,
			chart.title,
			chart.kind,
			chart.metrics,
			chart.certs,
			chart.scale,
			chart.stacked,
			chart.visible
		]),
		state.activePanel,
		[state.mapSelection.states, state.mapSelection.certs],
		findings,
		state.watchlistDesired.map((entry) => [entry.cert, entry.watched]),
		state.depth,
		state.activeMetric,
		[state.screenView.sort, state.screenView.order],
		[
			state.asOfQuarter,
			state.comparison.mode,
			state.comparison.rangeStartQuarter,
			state.comparison.customQuarter,
			state.comparison.resolvedQuarter,
			state.chartHistory.from,
			state.chartHistory.to
		],
		[state.board.focusedBlockId, state.board.blocks.map(compactBoardBlock)]
	], sanitization };
}

function at(value: unknown, index: number, path: string): unknown {
	if (!Array.isArray(value)) throw new WorkspaceValidationError({ path, message: 'must be an array' });
	return value[index];
}

function expandCondition(value: unknown, path: string): unknown {
	return {
		metric: at(value, 0, path),
		operator: at(value, 1, path),
		value: at(value, 2, path),
		upperValue: at(value, 3, path)
	};
}

function expandV1(value: unknown): WorkspaceState {
	if (!Array.isArray(value) || (value.length !== 14 && value.length !== 15 && value.length !== 16 && value.length !== 17)) {
		throw new WorkspaceValidationError({ path: 'search.ws', message: 'must be a 14-, 15-, 16-, or 17-item version 1 payload' });
	}
	const filters = at(value, 2, 'search.ws[2]');
	const results = at(value, 3, 'search.ws[3]');
	const peer = at(value, 7, 'search.ws[7]');
	const period = at(value, 8, 'search.ws[8]');
	const map = at(value, 11, 'search.ws[11]');
	const conditionValues = at(filters, 4, 'search.ws[2][4]');
	const peerConditionValues = at(peer, 5, 'search.ws[7][5]');
	const chartValues = at(value, 9, 'search.ws[9]');
	const findingValues = at(value, 12, 'search.ws[12]');
	const watchlistValues = at(value, 13, 'search.ws[13]');
	const screenView = value.length < 17 ? ['assets', 'desc'] : at(value, 16, 'search.ws[16]');
	if (!Array.isArray(conditionValues)) throw new WorkspaceValidationError({ path: 'search.ws[2][4]', message: 'must be an array' });
	if (!Array.isArray(peerConditionValues)) throw new WorkspaceValidationError({ path: 'search.ws[7][5]', message: 'must be an array' });
	if (!Array.isArray(chartValues)) throw new WorkspaceValidationError({ path: 'search.ws[9]', message: 'must be an array' });
	if (!Array.isArray(findingValues)) throw new WorkspaceValidationError({ path: 'search.ws[12]', message: 'must be an array' });
	if (!Array.isArray(watchlistValues)) throw new WorkspaceValidationError({ path: 'search.ws[13]', message: 'must be an array' });
	const periodKind = at(period, 0, 'search.ws[8]');
	if (periodKind !== 'q' && periodKind !== 'r') {
		throw new WorkspaceValidationError({ path: 'search.ws[8][0]', message: 'must be q or r' });
	}

	return migrateWorkspaceState({
		version: 1,
		revision: value[0],
		question: value[1],
		filters: {
			query: at(filters, 0, 'search.ws[2]'),
			states: at(filters, 1, 'search.ws[2]'),
			assetRange: { min: at(at(filters, 2, 'search.ws[2]'), 0, 'search.ws[2][2]'), max: at(at(filters, 2, 'search.ws[2]'), 1, 'search.ws[2][2]') },
			active: at(filters, 3, 'search.ws[2]'),
			metricConditions: conditionValues.map((condition, index) => expandCondition(condition, `search.ws[2][4][${index}]`))
		},
		screenView: {
			sort: at(screenView, 0, 'search.ws[16]'),
			order: at(screenView, 1, 'search.ws[16]')
		},
		results: {
			total: at(results, 0, 'search.ws[3]'),
			returned: at(results, 1, 'search.ws[3]'),
			latestQuarter: at(results, 2, 'search.ws[3]'),
			refreshedAt: at(results, 3, 'search.ws[3]'),
			queryRevision: at(results, 4, 'search.ws[3]'),
			truncated: at(results, 5, 'search.ws[3]')
		},
		activeBank: value[4],
		selectedCerts: value[5],
		excludedCerts: value[6],
		peerRecipe: {
			name: at(peer, 0, 'search.ws[7]'),
			basis: at(peer, 1, 'search.ws[7]'),
			states: at(peer, 2, 'search.ws[7]'),
			assetRange: { min: at(at(peer, 3, 'search.ws[7]'), 0, 'search.ws[7][3]'), max: at(at(peer, 3, 'search.ws[7]'), 1, 'search.ws[7][3]') },
			active: at(peer, 4, 'search.ws[7]'),
			metricConditions: peerConditionValues.map((condition, index) => expandCondition(condition, `search.ws[7][5][${index}]`)),
			minimumPeers: at(peer, 6, 'search.ws[7]'),
			maximumPeers: at(peer, 7, 'search.ws[7]')
		},
		period: periodKind === 'q'
			? { kind: 'quarter', quarter: at(period, 1, 'search.ws[8]') }
			: { kind: 'range', from: at(period, 1, 'search.ws[8]'), to: at(period, 2, 'search.ws[8]') },
		charts: chartValues.map((chart) => ({
			id: at(chart, 0, 'search.ws[9][]'),
			title: at(chart, 1, 'search.ws[9][]'),
			kind: at(chart, 2, 'search.ws[9][]'),
			metrics: at(chart, 3, 'search.ws[9][]'),
			certs: at(chart, 4, 'search.ws[9][]'),
			scale: at(chart, 5, 'search.ws[9][]'),
			stacked: at(chart, 6, 'search.ws[9][]'),
			visible: at(chart, 7, 'search.ws[9][]')
		})),
		activePanel: value[10],
		depth: value.length === 14 ? 'guided' : value[14],
		activeMetric: value.length < 16 ? null : value[15],
		mapSelection: { states: at(map, 0, 'search.ws[11]'), certs: at(map, 1, 'search.ws[11]') },
		findings: findingValues.map((finding) => ({
			id: at(finding, 0, 'search.ws[12][]'),
			title: at(finding, 1, 'search.ws[12][]'),
			note: at(finding, 2, 'search.ws[12][]'),
			certs: at(finding, 3, 'search.ws[12][]'),
			metrics: at(finding, 4, 'search.ws[12][]'),
			period: at(finding, 5, 'search.ws[12][]'),
			source: at(finding, 6, 'search.ws[12][]'),
			provenance: at(finding, 7, 'search.ws[12][]') ?? null
		})),
		watchlistDesired: watchlistValues.map((entry) => ({
			cert: at(entry, 0, 'search.ws[13][]'),
			watched: at(entry, 1, 'search.ws[13][]')
		}))
	}).state;
}

function expandV2(value: unknown): WorkspaceState {
	if (!Array.isArray(value) || value.length !== 18) {
		throw new WorkspaceValidationError({
			path: 'search.ws',
			message: 'must be an 18-item version 2 payload'
		});
	}
	const base = expandV1(value.slice(0, 17));
	const periods = at(value, 17, 'search.ws[17]');
	if (!Array.isArray(periods) || periods.length !== 7) {
		throw new WorkspaceValidationError({
			path: 'search.ws[17]',
			message: 'must be a seven-item period payload'
		});
	}
	return normalizeWorkspaceState({
		...base,
		version: WORKSPACE_SCHEMA_VERSION,
		asOfQuarter: at(periods, 0, 'search.ws[17]'),
		comparison: {
			mode: at(periods, 1, 'search.ws[17]'),
			rangeStartQuarter: at(periods, 2, 'search.ws[17]'),
			customQuarter: at(periods, 3, 'search.ws[17]'),
			resolvedQuarter: at(periods, 4, 'search.ws[17]')
		},
		chartHistory: {
			from: at(periods, 5, 'search.ws[17]'),
			to: at(periods, 6, 'search.ws[17]')
		},
		board: { focusedBlockId: null, blocks: [] }
	});
}

function expandAnchorConfiguration(value: unknown, path: string): unknown {
	if (value === null) return undefined;
	if (!Array.isArray(value) || value.length !== 9) {
		throw new WorkspaceValidationError({ path, message: 'must be a nine-item anchor configuration or null' });
	}
	const bankSource = at(value, 0, path) === 'w' ? 'workspace' : at(value, 0, path) === 'f' ? 'fixed' : null;
	const metricSource = at(value, 2, path) === 'w' ? 'workspace' : at(value, 2, path) === 'f' ? 'fixed' : null;
	const periodSource = at(value, 4, path) === 'w' ? 'workspace' : at(value, 4, path) === 'f' ? 'fixed' : null;
	if (!bankSource) throw new WorkspaceValidationError({ path: `${path}[0]`, message: 'must be w or f' });
	if (!metricSource) throw new WorkspaceValidationError({ path: `${path}[2]`, message: 'must be w or f' });
	if (!periodSource) throw new WorkspaceValidationError({ path: `${path}[4]`, message: 'must be w or f' });
	return {
		bankSource,
		metricSource,
		periodSource,
		...(bankSource === 'fixed' ? { certs: at(value, 1, path) } : {}),
		...(metricSource === 'fixed' ? { metrics: at(value, 3, path) } : {}),
		...(periodSource === 'fixed' ? {
			asOf: at(value, 5, path),
			compareWith: at(value, 6, path),
			historyFrom: at(value, 7, path),
			historyTo: at(value, 8, path)
		} : {})
	};
}

function expandBoardBlock(value: unknown, path: string, version: 3 | 4): unknown {
	if (!Array.isArray(value)) {
		throw new WorkspaceValidationError({ path, message: 'must be an array' });
	}
	const tag = at(value, 0, path);
	if (tag === 'h') {
		const expected = version === 3 ? 10 : 11;
		if (value.length !== expected) throw new WorkspaceValidationError({ path, message: `must be a ${expected}-item history block` });
		const anchorConfig = version === 4 ? expandAnchorConfiguration(at(value, 10, path), `${path}[10]`) : undefined;
		return {
			kind: 'history',
			id: at(value, 1, path),
			title: at(value, 2, path),
			span: at(value, 3, path),
			binding: {
				certs: at(value, 4, path),
				metrics: at(value, 5, path),
				from: at(value, 6, path),
				to: at(value, 7, path),
				chartKind: at(value, 8, path),
				scale: at(value, 9, path)
			},
			...(anchorConfig === undefined ? {} : { anchorConfig })
		};
	}
	if (tag === 't') {
		const expected = version === 3 ? 9 : 10;
		if (value.length !== expected) throw new WorkspaceValidationError({ path, message: `must be a ${expected}-item exact-table block` });
		const anchorConfig = version === 4 ? expandAnchorConfiguration(at(value, 9, path), `${path}[9]`) : undefined;
		return {
			kind: 'exact_table',
			id: at(value, 1, path),
			title: at(value, 2, path),
			span: at(value, 3, path),
			binding: {
				certs: at(value, 4, path),
				metrics: at(value, 5, path),
				from: at(value, 6, path),
				to: at(value, 7, path),
				followCurrent: at(value, 8, path)
			},
			...(anchorConfig === undefined ? {} : { anchorConfig })
		};
	}
	if (tag === 'a') {
		if (value.length !== 6) throw new WorkspaceValidationError({ path, message: 'must be a six-item analysis block' });
		return {
			kind: 'analysis',
			id: at(value, 1, path),
			title: at(value, 2, path),
			span: at(value, 3, path),
			binding: { resultRef: at(value, 4, path), view: at(value, 5, path) }
		};
	}
	if (tag === 'w') {
		const expected = version === 3 ? 5 : 6;
		if (value.length !== expected) throw new WorkspaceValidationError({ path, message: `must be a ${expected}-item workspace-view block` });
		const anchorConfig = version === 4 ? expandAnchorConfiguration(at(value, 5, path), `${path}[5]`) : undefined;
		return {
			kind: 'workspace_view',
			id: at(value, 1, path),
			title: at(value, 2, path),
			span: at(value, 3, path),
			binding: { view: at(value, 4, path) },
			...(anchorConfig === undefined ? {} : { anchorConfig })
		};
	}
	if (tag === 'n') {
		if (value.length !== 6) throw new WorkspaceValidationError({ path, message: 'must be a six-item takeaway block' });
		return {
			kind: 'takeaway',
			id: at(value, 1, path),
			title: at(value, 2, path),
			span: at(value, 3, path),
			text: at(value, 4, path),
			referenceBlockIds: at(value, 5, path)
		};
	}
	throw new WorkspaceValidationError({ path: `${path}[0]`, message: 'must be h, t, a, w, or n' });
}

function expandBoardWorkspace(value: unknown, version: 3 | 4): WorkspaceState {
	if (!Array.isArray(value) || value.length !== 19) {
		throw new WorkspaceValidationError({
			path: 'search.ws',
			message: `must be a 19-item version ${version} payload`
		});
	}
	const base = expandV2(value.slice(0, 18));
	const board = at(value, 18, 'search.ws[18]');
	if (!Array.isArray(board) || board.length !== 2) {
		throw new WorkspaceValidationError({
			path: 'search.ws[18]',
			message: 'must be a two-item research-board payload'
		});
	}
	const blockValues = at(board, 1, 'search.ws[18][1]');
	if (!Array.isArray(blockValues)) {
		throw new WorkspaceValidationError({ path: 'search.ws[18][1]', message: 'must be an array' });
	}
	return normalizeWorkspaceState({
		...base,
		version: WORKSPACE_SCHEMA_VERSION,
		board: {
			focusedBlockId: at(board, 0, 'search.ws[18][0]'),
			blocks: blockValues.map((block, index) => expandBoardBlock(block, `search.ws[18][1][${index}]`, version))
		}
	});
}

function expandV3(value: unknown): WorkspaceState {
	return expandBoardWorkspace(value, 3);
}

function expandV4(value: unknown): WorkspaceState {
	return expandBoardWorkspace(value, 4);
}

function parseJson(text: string, path: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new WorkspaceValidationError({ path, message: 'must contain valid JSON' });
	}
}

function metadata(
	encodedLength: number,
	sanitization: ShareSanitization = {
		findingNotesTruncated: 0,
		omittedNoteCharacters: 0,
		findingSourcesTruncated: 0,
		omittedSourceCharacters: 0
	}
): WorkspaceShareMetadata {
	return {
		version: 1,
		maxEncodedLength: WORKSPACE_SHARE_MAX_ENCODED_LENGTH,
		encodedLength,
		...sanitization
	};
}

function buildWorkspaceShare(state: WorkspaceState): {
	params: URLSearchParams;
	search: string;
	metadata: WorkspaceShareMetadata;
} {
	const normalized = normalizeWorkspaceState(state);
	const { payload, sanitization } = compact(normalized);
	const params = new URLSearchParams();
	params.set(WORKSPACE_SEARCH_VERSION_PARAM, String(WORKSPACE_SCHEMA_VERSION));
	params.set(WORKSPACE_SEARCH_STATE_PARAM, JSON.stringify(payload));
	if (sanitization.findingNotesTruncated > 0 || sanitization.findingSourcesTruncated > 0) {
		params.set(WORKSPACE_SEARCH_META_PARAM, JSON.stringify([
			1,
			sanitization.findingNotesTruncated,
			sanitization.omittedNoteCharacters,
			sanitization.findingSourcesTruncated,
			sanitization.omittedSourceCharacters
		]));
	}
	const search = params.toString();
	const shareMetadata = metadata(search.length, sanitization);
	if (search.length > WORKSPACE_SHARE_MAX_ENCODED_LENGTH) {
		throw new WorkspaceShareBudgetError('outbound', shareMetadata);
	}
	return { params, search, metadata: shareMetadata };
}

function parseNonNegativeInteger(value: unknown, path: string, maximum: number): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
		throw new WorkspaceValidationError({ path, message: `must be an integer from 0 to ${maximum}` });
	}
	return value as number;
}

function parseShareMetadata(params: URLSearchParams, encodedLength: number): WorkspaceShareMetadata {
	const encoded = params.get(WORKSPACE_SEARCH_META_PARAM);
	if (encoded === null) return metadata(encodedLength);
	const value = parseJson(encoded, `search.${WORKSPACE_SEARCH_META_PARAM}`);
	if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1) {
		throw new WorkspaceValidationError({
			path: `search.${WORKSPACE_SEARCH_META_PARAM}`,
			message: 'must be a version 1 five-item metadata payload'
		});
	}
	return metadata(encodedLength, {
		findingNotesTruncated: parseNonNegativeInteger(value[1], `search.${WORKSPACE_SEARCH_META_PARAM}[1]`, 20),
		omittedNoteCharacters: parseNonNegativeInteger(value[2], `search.${WORKSPACE_SEARCH_META_PARAM}[2]`, 80_000),
		findingSourcesTruncated: parseNonNegativeInteger(value[3], `search.${WORKSPACE_SEARCH_META_PARAM}[3]`, 20),
		omittedSourceCharacters: parseNonNegativeInteger(value[4], `search.${WORKSPACE_SEARCH_META_PARAM}[4]`, 10_000)
	});
}

function inboundParams(input: string | URLSearchParams): { params: URLSearchParams; encodedLength: number } {
	if (typeof input === 'string') {
		const search = input.startsWith('?') ? input.slice(1) : input;
		if (search.length > WORKSPACE_SHARE_MAX_ENCODED_LENGTH) {
			throw new WorkspaceShareBudgetError('inbound', metadata(search.length));
		}
		return { params: new URLSearchParams(search), encodedLength: search.length };
	}
	const search = input.toString();
	if (search.length > WORKSPACE_SHARE_MAX_ENCODED_LENGTH) {
		throw new WorkspaceShareBudgetError('inbound', metadata(search.length));
	}
	return { params: input, encodedLength: search.length };
}

export function serializeWorkspaceSearchParams(state: WorkspaceState): URLSearchParams {
	return buildWorkspaceShare(state).params;
}

export function serializeWorkspaceSearch(state: WorkspaceState): string {
	return buildWorkspaceShare(state).search;
}

/**
 * Non-throwing budget variant for UI/WebMCP callers. Invalid state still raises
 * WorkspaceValidationError; only browser-budget failure is returned.
 */
export function trySerializeWorkspaceSearch(state: WorkspaceState): WorkspaceShareSerializationResult {
	try {
		const result = buildWorkspaceShare(state);
		return { ok: true, ...result };
	} catch (error) {
		if (error instanceof WorkspaceShareBudgetError) {
			return { ok: false, error, metadata: error.metadata };
		}
		throw error;
	}
}

/** Returns decoded state plus URL sanitization/truncation disclosure. */
export function deserializeWorkspaceShare(
	input: string | URLSearchParams,
	options: { empty?: 'default' | 'error' } = {}
): DeserializedWorkspaceShare {
	const { params, encodedLength } = inboundParams(input);
	const encoded = params.get(WORKSPACE_SEARCH_STATE_PARAM);
	const version = params.get(WORKSPACE_SEARCH_VERSION_PARAM);
	const shareMetadata = parseShareMetadata(params, encodedLength);
	if (encoded === null && version === null && options.empty !== 'error') {
		return { state: createDefaultWorkspaceState(), metadata: shareMetadata };
	}
	if (version !== '1' && version !== '2' && version !== '3' && version !== String(WORKSPACE_SCHEMA_VERSION)) {
		throw new WorkspaceValidationError({
			path: `search.${WORKSPACE_SEARCH_VERSION_PARAM}`,
			message: `uses unsupported workspace version ${version ?? '(missing)'}`
		});
	}
	if (encoded === null) {
		throw new WorkspaceValidationError({ path: `search.${WORKSPACE_SEARCH_STATE_PARAM}`, message: 'is required' });
	}
	return {
		state: version === '1'
			? expandV1(parseJson(encoded, `search.${WORKSPACE_SEARCH_STATE_PARAM}`))
			: version === '2'
				? expandV2(parseJson(encoded, `search.${WORKSPACE_SEARCH_STATE_PARAM}`))
				: version === '3'
					? expandV3(parseJson(encoded, `search.${WORKSPACE_SEARCH_STATE_PARAM}`))
					: expandV4(parseJson(encoded, `search.${WORKSPACE_SEARCH_STATE_PARAM}`)),
		metadata: shareMetadata
	};
}

export function deserializeWorkspaceSearchParams(
	input: string | URLSearchParams,
	options: { empty?: 'default' | 'error' } = {}
): WorkspaceState {
	return deserializeWorkspaceShare(input, options).state;
}

function canonicalPeriodsFromLegacy(periodValue: unknown): Pick<
	WorkspaceState,
	'asOfQuarter' | 'comparison' | 'chartHistory' | 'period'
> {
	const period = normalizePeriod(periodValue, 'workspace.period');
	if (period.kind === 'range') {
		return {
			asOfQuarter: period.to,
			comparison: {
				mode: 'range-start',
				rangeStartQuarter: period.from,
				customQuarter: null,
				resolvedQuarter: period.from
			},
			chartHistory: { from: period.from, to: period.to },
			period
		};
	}
	return {
		asOfQuarter: period.quarter,
		comparison: {
			mode: 'prior-quarter',
			rangeStartQuarter: null,
			customQuarter: null,
			resolvedQuarter: null
		},
		chartHistory: { from: null, to: null },
		period
	};
}

/**
 * Migration entry point for local state. Version 0 was an unversioned/full object;
 * missing fields receive current defaults before strict validation.
 */
export function migrateWorkspaceState(value: unknown): { state: WorkspaceState; migrated: boolean } {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new WorkspaceValidationError({ path: 'workspace', message: 'must be an object' });
	}
	const source = value as Record<string, unknown>;
	if (source.version === WORKSPACE_SCHEMA_VERSION) {
		const missingDepth = source.depth === undefined;
		const missingActiveMetric = source.activeMetric === undefined;
		const missingScreenView = source.screenView === undefined;
		const missingCanonicalPeriods = source.asOfQuarter === undefined
			|| source.comparison === undefined
			|| source.chartHistory === undefined;
		const missingBoard = source.board === undefined;
		const legacyPeriods = missingCanonicalPeriods
			? canonicalPeriodsFromLegacy(source.period)
			: null;
		return {
			state: normalizeWorkspaceState({
				...source,
				...(missingDepth ? { depth: 'guided' } : {}),
				...(missingActiveMetric ? { activeMetric: null } : {}),
				...(missingScreenView ? { screenView: { sort: 'assets', order: 'desc' } } : {}),
				...(missingBoard ? { board: { focusedBlockId: null, blocks: [] } } : {}),
				...(legacyPeriods ?? {})
			}),
			migrated: missingDepth || missingActiveMetric || missingScreenView || missingCanonicalPeriods || missingBoard
		};
	}
	if (source.version === 3) {
		return {
			state: normalizeWorkspaceState({ ...source, version: WORKSPACE_SCHEMA_VERSION }),
			migrated: true
		};
	}
	if (source.version !== undefined && source.version !== 0 && source.version !== 1 && source.version !== 2 && source.version !== 3) {
		throw new WorkspaceValidationError({
			path: 'workspace.version',
			message: `uses unsupported workspace version ${String(source.version)}`
		});
	}
	const defaults = createDefaultWorkspaceState();
	const legacyPeriod = source.period ?? (source.selectedQuarter
		? { kind: 'quarter', quarter: source.selectedQuarter }
		: defaults.period);
	const canonicalPeriods = canonicalPeriodsFromLegacy(legacyPeriod);
	const state = normalizeWorkspaceState({
		...defaults,
		...source,
		version: WORKSPACE_SCHEMA_VERSION,
		revision: source.revision ?? 0,
		question: source.question ?? source.researchQuestion ?? defaults.question,
		filters: { ...defaults.filters, ...(source.filters as object | undefined) },
		screenView: source.screenView ?? defaults.screenView,
		results: { ...defaults.results, ...(source.results as object | undefined) },
		peerRecipe: { ...defaults.peerRecipe, ...(source.peerRecipe as object | undefined) },
		...canonicalPeriods,
		charts: source.charts ?? source.chartSpecs ?? defaults.charts,
		activePanel: source.activePanel ?? source.panel ?? defaults.activePanel,
		depth: source.depth === undefined ? defaults.depth : source.depth,
		activeMetric: source.activeMetric === undefined ? defaults.activeMetric : source.activeMetric,
		board: source.board ?? defaults.board,
		mapSelection: source.mapSelection ?? source.map ?? defaults.mapSelection,
		findings: source.findings ?? source.notes ?? defaults.findings,
		watchlistDesired: source.watchlistDesired ?? defaults.watchlistDesired
	});
	return { state, migrated: true };
}

export function parseWorkspaceJson(text: string): { state: WorkspaceState; migrated: boolean } {
	const parsed = parseJson(text, 'persisted workspace');
	if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'state' in parsed) {
		const envelope = parsed as { version?: unknown; state: unknown };
		if (
			envelope.version !== undefined
			&& envelope.version !== 1
			&& envelope.version !== 2
			&& envelope.version !== 3
			&& envelope.version !== WORKSPACE_SCHEMA_VERSION
		) {
			throw new WorkspaceValidationError({
				path: 'persisted workspace.version',
				message: `uses unsupported persistence version ${String(envelope.version)}`
			});
		}
		return migrateWorkspaceState(envelope.state);
	}
	return migrateWorkspaceState(parsed);
}
