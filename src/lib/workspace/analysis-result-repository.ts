import type { WorkspaceAnalysisResult } from './types.js';

export const ANALYSIS_RESULT_REF_VERSION = 1 as const;
export const ANALYSIS_RESULT_PAGE_SIZE = 25 as const;
export const ANALYSIS_RESULT_MAX_PAGE_SIZE = 100 as const;

export type AnalysisResultKind = WorkspaceAnalysisResult['kind'];
export type AnalysisResultSection =
	| 'metrics'
	| 'groups'
	| 'rows'
	| 'members'
	| 'components'
	| 'series'
	| 'analogues'
	| 'analogue_details';

export type NormalizedJson =
	| null
	| boolean
	| number
	| string
	| NormalizedJson[]
	| { [key: string]: NormalizedJson };

export interface AnalysisResultReleaseIdentity {
	sourceMode: 'live' | 'recorded';
	sourceAsOf: string | null;
	release: string | null;
	releaseGeneration: string | null;
}

export interface AnalysisResultScopeIdentity {
	membershipBasis:
		| 'current_workspace_members'
		| 'current_selected_banks'
		| 'current_selected_bank'
		| 'published_failure_and_active_universe';
	analyzedCount: number;
	definitionHash: string;
	cohortHash: string;
	excludedCount: number;
}

export interface AnalysisResultQueryIdentity {
	kind: AnalysisResultKind;
	/** A normalized copy of the exact deterministic query specification. */
	spec: { [key: string]: NormalizedJson };
	queryHash: string;
}

/**
 * A portable pointer to a deterministic analysis payload. The pointer carries
 * enough identity to explain which data release, population, and query created
 * the payload without putting the payload itself in workspace state.
 */
export interface AnalysisResultRef<K extends AnalysisResultKind = AnalysisResultKind> {
	version: typeof ANALYSIS_RESULT_REF_VERSION;
	contentHash: string;
	kind: K;
	resultId: string;
	release: AnalysisResultReleaseIdentity;
	scope: AnalysisResultScopeIdentity;
	query: AnalysisResultQueryIdentity & { kind: K };
}

export interface AnalysisResultStoredRecord<T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult> {
	contentHash: string;
	ref: AnalysisResultRef<T['kind']>;
	result: T;
}

export interface AnalysisResultStorageAdapter<T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult> {
	isAvailable(): Promise<boolean>;
	put(record: AnalysisResultStoredRecord<T>): Promise<void>;
	get(contentHash: string): Promise<AnalysisResultStoredRecord<T> | null>;
	delete(contentHash: string): Promise<boolean>;
}

export interface AnalysisResultPageOptions {
	/** Number of items per page, deliberately bounded for UI and WebMCP consumers. */
	pageSize?: number;
	/** Zero-based item offset. Cannot be combined with cursor. */
	offset?: number;
	/** Opaque cursor returned by a prior page for this exact result and section. */
	cursor?: string;
}

export interface AnalysisResultPage<T = unknown> {
	ref: AnalysisResultRef;
	section: AnalysisResultSection;
	items: T[];
	total: number;
	offset: number;
	pageSize: number;
	nextOffset: number | null;
	nextCursor: string | null;
}

export class AnalysisResultRepositoryUnavailableError extends Error {
	constructor(message = 'The analysis result repository is unavailable in this environment') {
		super(message);
		this.name = 'AnalysisResultRepositoryUnavailableError';
	}
}

export class AnalysisResultReferenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AnalysisResultReferenceError';
	}
}

export class AnalysisResultIntegrityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AnalysisResultIntegrityError';
	}
}

function normalizeJsonValue(value: unknown, inArray = false): NormalizedJson | undefined {
	if (value === null) return null;
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return value;
		case 'number':
			return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
		case 'undefined':
		case 'function':
		case 'symbol':
			return inArray ? null : undefined;
		case 'bigint':
			throw new TypeError('Analysis results must not contain bigint values');
		case 'object': {
			if (Array.isArray(value)) {
				return value.map((item) => normalizeJsonValue(item, true) ?? null);
			}
			const source = value as Record<string, unknown>;
			const normalized: { [key: string]: NormalizedJson } = {};
			for (const key of Object.keys(source).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
				const child = normalizeJsonValue(source[key]);
				if (child !== undefined) normalized[key] = child;
			}
			return normalized;
		}
	}
}

/** Return a deeply normalized, key-sorted JSON value. */
export function normalizeAnalysisResultJson(value: unknown): NormalizedJson {
	const normalized = normalizeJsonValue(value);
	if (normalized === undefined) {
		throw new TypeError('Analysis result must be a JSON value');
	}
	return normalized;
}

/** Stable JSON text used for both content and query identity. */
export function stableAnalysisResultJson(value: unknown): string {
	return JSON.stringify(normalizeAnalysisResultJson(value));
}

// A small, dependency-free SHA-256 keeps identities identical in browsers,
// Workers, tests, and SSR environments regardless of Web Crypto availability.
function sha256(text: string): string {
	const bytes = new TextEncoder().encode(text);
	const words: number[] = [];
	for (let index = 0; index < bytes.length; index += 1) {
		words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8));
	}
	words[bytes.length >> 2] = (words[bytes.length >> 2] ?? 0) | (0x80 << (24 - (bytes.length % 4) * 8));
	const bitLength = bytes.length * 8;
	const lengthIndex = (((bytes.length + 8) >> 6) + 1) * 16 - 2;
	words[lengthIndex] = Math.floor(bitLength / 0x100000000);
	words[lengthIndex + 1] = bitLength >>> 0;

	const constants = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
		0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
		0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
		0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
		0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
		0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
		0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
		0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
		0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	];
	const state = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
		0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	];
	const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
	for (let offset = 0; offset < words.length; offset += 16) {
		const schedule = new Array<number>(64);
		for (let index = 0; index < 16; index += 1) schedule[index] = words[offset + index] ?? 0;
		for (let index = 16; index < 64; index += 1) {
			const prior = schedule[index - 15];
			const recent = schedule[index - 2];
			const sigma0 = rotateRight(prior, 7) ^ rotateRight(prior, 18) ^ (prior >>> 3);
			const sigma1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
			schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = state;
		for (let index = 0; index < 64; index += 1) {
			const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choice = (e & f) ^ (~e & g);
			const temporary1 = (h + sum1 + choice + constants[index] + schedule[index]) >>> 0;
			const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temporary2 = (sum0 + majority) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temporary1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temporary1 + temporary2) >>> 0;
		}
		state[0] = (state[0] + a) >>> 0;
		state[1] = (state[1] + b) >>> 0;
		state[2] = (state[2] + c) >>> 0;
		state[3] = (state[3] + d) >>> 0;
		state[4] = (state[4] + e) >>> 0;
		state[5] = (state[5] + f) >>> 0;
		state[6] = (state[6] + g) >>> 0;
		state[7] = (state[7] + h) >>> 0;
	}
	return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function analysisResultContentHash(value: unknown): string {
	return `sha256:${sha256(stableAnalysisResultJson(value))}`;
}

export function createAnalysisResultRef<T extends WorkspaceAnalysisResult>(
	result: T
): AnalysisResultRef<T['kind']> {
	const normalizedSpec = normalizeAnalysisResultJson(result.spec);
	if (!normalizedSpec || Array.isArray(normalizedSpec) || typeof normalizedSpec !== 'object') {
		throw new TypeError('Analysis result spec must be a JSON object');
	}
	return {
		version: ANALYSIS_RESULT_REF_VERSION,
		contentHash: analysisResultContentHash(result),
		kind: result.kind,
		resultId: result.id,
		release: {
			sourceMode: result.lineage.sourceMode,
			sourceAsOf: result.lineage.sourceAsOf,
			release: result.lineage.release,
			releaseGeneration: result.lineage.releaseGeneration
		},
		scope: {
			membershipBasis: result.population.membershipBasis,
			analyzedCount: result.population.analyzedCount,
			definitionHash: result.population.definitionHash,
			cohortHash: result.population.cohortHash,
			excludedCount: result.population.excludedCount
		},
		query: {
			kind: result.kind,
			spec: normalizedSpec,
			queryHash: analysisResultContentHash({ kind: result.kind, spec: normalizedSpec })
		}
	};
}

function clone<T>(value: T): T {
	// Workspace state is reactive in the browser. Svelte proxies are valid JSON
	// values, but the platform structured-clone algorithm rejects the proxy
	// wrapper itself. Normalizing through the repository's JSON contract removes
	// that wrapper and keeps results portable across IndexedDB and WebMCP.
	return normalizeAnalysisResultJson(value) as unknown as T;
}

function sameReference(left: AnalysisResultRef, right: AnalysisResultRef): boolean {
	return stableAnalysisResultJson(left) === stableAnalysisResultJson(right);
}

export class InMemoryAnalysisResultAdapter<
	T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult
> implements AnalysisResultStorageAdapter<T> {
	readonly #records = new Map<string, AnalysisResultStoredRecord<T>>();

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async put(record: AnalysisResultStoredRecord<T>): Promise<void> {
		this.#records.set(record.contentHash, clone(record));
	}

	async get(contentHash: string): Promise<AnalysisResultStoredRecord<T> | null> {
		const record = this.#records.get(contentHash);
		return record ? clone(record) : null;
	}

	async delete(contentHash: string): Promise<boolean> {
		return this.#records.delete(contentHash);
	}
}

export interface IndexedDbAnalysisResultAdapterOptions {
	databaseName?: string;
	storeName?: string;
	version?: number;
}

/** IndexedDB storage. Importing or constructing this adapter is safe during SSR. */
export class IndexedDbAnalysisResultAdapter<
	T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult
> implements AnalysisResultStorageAdapter<T> {
	readonly #databaseName: string;
	readonly #storeName: string;
	readonly #version: number;
	#databasePromise: Promise<IDBDatabase | null> | null = null;

	constructor(options: IndexedDbAnalysisResultAdapterOptions = {}) {
		this.#databaseName = options.databaseName ?? 'bankgraph-analysis-results';
		this.#storeName = options.storeName ?? 'results';
		this.#version = options.version ?? 1;
	}

	#database(): Promise<IDBDatabase | null> {
		if (this.#databasePromise) return this.#databasePromise;
		if (typeof globalThis.indexedDB === 'undefined') {
			this.#databasePromise = Promise.resolve(null);
			return this.#databasePromise;
		}
		this.#databasePromise = new Promise((resolve) => {
			let request: IDBOpenDBRequest;
			try {
				request = globalThis.indexedDB.open(this.#databaseName, this.#version);
			} catch {
				resolve(null);
				return;
			}
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(this.#storeName)) {
					database.createObjectStore(this.#storeName, { keyPath: 'contentHash' });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
			request.onblocked = () => resolve(null);
		});
		return this.#databasePromise;
	}

	async isAvailable(): Promise<boolean> {
		return (await this.#database()) !== null;
	}

	async put(record: AnalysisResultStoredRecord<T>): Promise<void> {
		const database = await this.#database();
		if (!database) throw new AnalysisResultRepositoryUnavailableError();
		await this.#write(database, 'readwrite', (store) => store.put(clone(record)));
	}

	async get(contentHash: string): Promise<AnalysisResultStoredRecord<T> | null> {
		const database = await this.#database();
		if (!database) throw new AnalysisResultRepositoryUnavailableError();
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(this.#storeName, 'readonly');
			const request = transaction.objectStore(this.#storeName).get(contentHash);
			request.onsuccess = () => resolve((request.result as AnalysisResultStoredRecord<T> | undefined) ?? null);
			request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
			transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read was aborted'));
		});
	}

	async delete(contentHash: string): Promise<boolean> {
		const database = await this.#database();
		if (!database) throw new AnalysisResultRepositoryUnavailableError();
		const existed = (await this.get(contentHash)) !== null;
		if (!existed) return false;
		await this.#write(database, 'readwrite', (store) => store.delete(contentHash));
		return true;
	}

	#write(
		database: IDBDatabase,
		mode: IDBTransactionMode,
		operation: (store: IDBObjectStore) => IDBRequest
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = database.transaction(this.#storeName, mode);
			const request = operation(transaction.objectStore(this.#storeName));
			request.onerror = () => reject(request.error ?? new Error('IndexedDB write failed'));
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
			transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write was aborted'));
		});
	}
}

function resultSections(result: WorkspaceAnalysisResult): Partial<Record<AnalysisResultSection, unknown[]>> {
	switch (result.kind) {
		case 'cohort_change':
			return {
				metrics: result.transition.metrics,
				groups: result.transition.groups
			};
		case 'temporal_pattern':
			return { rows: result.rows };
		case 'financial_composition':
			return {
				members: result.memberCerts,
				components: result.analysis.components
			};
		case 'failure_pattern':
			return {
				members: result.result.historicalCohort.members,
				series: result.result.eventStudy.series,
				analogues: result.result.currentAnalogues.data.map((analogue) => ({
					rank: analogue.rank,
					cert: analogue.cert,
					name: analogue.name,
					city: analogue.city,
					state: analogue.state,
					asOf: analogue.asOf,
					distance: analogue.distance,
					coverageAdjustedDistance: analogue.coverageAdjustedDistance,
					coverage: analogue.coverage,
					topDrivers: [...analogue.featureContributions]
						.sort((left, right) => right.squaredDistanceShare - left.squaredDistanceShare)
						.slice(0, 5)
						.map((feature) => ({
							metric: feature.metric,
							label: feature.label,
							coverage: feature.coverage,
							rmsStandardizedDistance: feature.rmsStandardizedDistance,
							squaredDistanceShare: feature.squaredDistanceShare
						}))
				})),
				analogue_details: result.result.currentAnalogues.data.map((analogue) => ({
					rank: analogue.rank,
					cert: analogue.cert,
					name: analogue.name,
					city: analogue.city,
					state: analogue.state,
					asOf: analogue.asOf,
					distance: analogue.distance,
					coverageAdjustedDistance: analogue.coverageAdjustedDistance,
					coverage: analogue.coverage,
					// Columnar trajectories avoid repeating four property names for every
					// metric-quarter cell, so several complete banks fit in one WebMCP read.
					featureMatrices: analogue.featureContributions.map((feature) => ({
						metric: feature.metric,
						label: feature.label,
						observedPeriods: feature.observedPeriods,
						expectedPeriods: feature.expectedPeriods,
						coverage: feature.coverage,
						rmsStandardizedDistance: feature.rmsStandardizedDistance,
						squaredDistanceShare: feature.squaredDistanceShare,
						relativeQuarters: feature.observations.map((observation) => observation.relativeQuarter),
						bankValues: feature.observations.map((observation) => observation.bankValue),
						patternMedians: feature.observations.map((observation) => observation.patternMedian),
						standardizedDifferences: feature.observations.map((observation) => observation.standardizedDifference)
					}))
				}))
			};
	}
}

export function analysisResultSections(result: WorkspaceAnalysisResult): AnalysisResultSection[] {
	return Object.keys(resultSections(result)) as AnalysisResultSection[];
}

function pageSize(value: number | undefined): number {
	const resolved = value ?? ANALYSIS_RESULT_PAGE_SIZE;
	if (!Number.isInteger(resolved) || resolved < 1 || resolved > ANALYSIS_RESULT_MAX_PAGE_SIZE) {
		throw new RangeError(`pageSize must be an integer from 1 to ${ANALYSIS_RESULT_MAX_PAGE_SIZE}`);
	}
	return resolved;
}

function cursorFor(ref: AnalysisResultRef, section: AnalysisResultSection, offset: number): string {
	return `v1:${ref.contentHash.slice(7, 23)}:${section}:${offset}`;
}

function offsetFromOptions(
	ref: AnalysisResultRef,
	section: AnalysisResultSection,
	options: AnalysisResultPageOptions
): number {
	if (options.cursor !== undefined && options.offset !== undefined) {
		throw new AnalysisResultReferenceError('Provide cursor or offset, not both');
	}
	if (options.cursor !== undefined) {
		const match = /^v1:([a-f0-9]{16}):(metrics|groups|rows|members|components|series|analogues|analogue_details):(\d+)$/.exec(options.cursor);
		if (!match || match[1] !== ref.contentHash.slice(7, 23) || match[2] !== section) {
			throw new AnalysisResultReferenceError('Cursor does not belong to this result section');
		}
		const offset = Number(match[3]);
		if (!Number.isSafeInteger(offset)) throw new AnalysisResultReferenceError('Cursor offset is invalid');
		return offset;
	}
	const offset = options.offset ?? 0;
	if (!Number.isSafeInteger(offset) || offset < 0) {
		throw new RangeError('offset must be a non-negative safe integer');
	}
	return offset;
}

export class AnalysisResultRepository<
	T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult
> {
	constructor(readonly adapter: AnalysisResultStorageAdapter<T>) {}

	async isAvailable(): Promise<boolean> {
		return this.adapter.isAvailable();
	}

	async put(result: T): Promise<AnalysisResultRef<T['kind']>> {
		if (!(await this.adapter.isAvailable())) throw new AnalysisResultRepositoryUnavailableError();
		const normalized = normalizeAnalysisResultJson(result) as unknown as T;
		const ref = createAnalysisResultRef(normalized);
		await this.adapter.put({ contentHash: ref.contentHash, ref, result: normalized });
		return clone(ref);
	}

	async get(ref: AnalysisResultRef): Promise<T | null> {
		if (!(await this.adapter.isAvailable())) throw new AnalysisResultRepositoryUnavailableError();
		const record = await this.adapter.get(ref.contentHash);
		if (!record) return null;
		if (!sameReference(record.ref, ref)) return null;
		const actualHash = analysisResultContentHash(record.result);
		if (actualHash !== ref.contentHash || record.contentHash !== ref.contentHash) {
			throw new AnalysisResultIntegrityError('Stored analysis result does not match its content hash');
		}
		return clone(record.result);
	}

	async delete(ref: AnalysisResultRef): Promise<boolean> {
		if (!(await this.adapter.isAvailable())) throw new AnalysisResultRepositoryUnavailableError();
		const record = await this.adapter.get(ref.contentHash);
		if (!record || !sameReference(record.ref, ref)) return false;
		return this.adapter.delete(ref.contentHash);
	}

	async readPage(
		ref: AnalysisResultRef,
		section: AnalysisResultSection,
		options: AnalysisResultPageOptions = {}
	): Promise<AnalysisResultPage> {
		const result = await this.get(ref);
		if (!result) throw new AnalysisResultReferenceError('Analysis result was not found for this reference');
		const items = resultSections(result)[section];
		if (!items) {
			throw new AnalysisResultReferenceError(
				`Section ${section} is not available for analysis result kind ${result.kind}`
			);
		}
		const limit = pageSize(options.pageSize);
		const offset = offsetFromOptions(ref, section, options);
		const nextOffset = offset + limit < items.length ? offset + limit : null;
		return {
			ref: clone(ref),
			section,
			items: clone(items.slice(offset, offset + limit)),
			total: items.length,
			offset,
			pageSize: limit,
			nextOffset,
			nextCursor: nextOffset === null ? null : cursorFor(ref, section, nextOffset)
		};
	}
}

export interface CreateBrowserAnalysisResultRepositoryOptions
	extends IndexedDbAnalysisResultAdapterOptions {
	/** Defaults to an in-memory session repository when IndexedDB is blocked or absent. */
	fallbackToMemory?: boolean;
}

/**
 * Construct the browser repository without assuming a DOM. SSR and privacy
 * modes that do not expose IndexedDB receive a session-only in-memory adapter.
 */
export async function createBrowserAnalysisResultRepository<
	T extends WorkspaceAnalysisResult = WorkspaceAnalysisResult
>(options: CreateBrowserAnalysisResultRepositoryOptions = {}): Promise<AnalysisResultRepository<T>> {
	const indexedDb = new IndexedDbAnalysisResultAdapter<T>(options);
	if (await indexedDb.isAvailable()) return new AnalysisResultRepository(indexedDb);
	if (options.fallbackToMemory === false) throw new AnalysisResultRepositoryUnavailableError();
	return new AnalysisResultRepository(new InMemoryAnalysisResultAdapter<T>());
}
