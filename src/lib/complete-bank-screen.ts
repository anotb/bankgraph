export interface BankScreenPage<T> {
	data: T[];
	total: number;
	truncated: boolean;
	asOf: string | null;
}

export interface CompleteBankScreenProgress {
	loaded: number;
	total: number;
}

interface BankScreenFetchOptions<T> {
	query: string;
	pageSize: number;
	signal: AbortSignal;
	fetchPage: (query: string, signal: AbortSignal) => Promise<BankScreenPage<T>>;
	onProgress?: (progress: CompleteBankScreenProgress) => void;
}

function pageQuery(query: string, offset: number): string {
	const params = new URLSearchParams(query);
	if (offset > 0) params.set('offset', String(offset));
	else params.delete('offset');
	return params.toString();
}

function assertPage<T>(page: BankScreenPage<T>, expectedTotal?: number): void {
	if (!Array.isArray(page.data)) throw new Error('The bank screen returned an invalid data page.');
	if (!Number.isSafeInteger(page.total) || page.total < 0) {
		throw new Error('The bank screen returned an invalid result count.');
	}
	if (expectedTotal !== undefined && page.total !== expectedTotal) {
		throw new Error('The bank screen changed while its result pages were loading.');
	}
}

function assertPageSize(pageSize: number): void {
	if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
		throw new Error('The bank screen page size must be a positive integer.');
	}
}

async function fetchInitialPage<T>({
	query,
	pageSize,
	signal,
	fetchPage,
	onProgress
}: BankScreenFetchOptions<T>): Promise<BankScreenPage<T>> {
	assertPageSize(pageSize);
	const first = await fetchPage(pageQuery(query, 0), signal);
	assertPage(first);
	if (signal.aborted) throw signal.reason ?? new DOMException('Bank screen loading was cancelled.', 'AbortError');

	const data = first.data.slice(0, first.total);
	onProgress?.({ loaded: data.length, total: first.total });
	return { ...first, data, truncated: data.length < first.total };
}

/**
 * Load only the first bounded page for an interactive browser view. The result
 * retains the authoritative total and remains marked truncated when more rows exist.
 */
export async function fetchInitialBankScreen<T>(
	options: BankScreenFetchOptions<T>
): Promise<BankScreenPage<T>> {
	return fetchInitialPage(options);
}

/**
 * Load a complete deterministic screen through bounded API pages. Pages are fetched
 * in small parallel batches, ordered by offset, and discarded if the caller aborts.
 */
export async function fetchCompleteBankScreen<T>({
	query,
	pageSize,
	signal,
	fetchPage,
	onProgress
}: BankScreenFetchOptions<T>): Promise<BankScreenPage<T>> {
	const first = await fetchInitialPage({ query, pageSize, signal, fetchPage, onProgress });
	const rows = [...first.data];
	if (rows.length >= first.total) {
		return { ...first, data: rows.slice(0, first.total), truncated: false };
	}
	if (!rows.length || rows.length < pageSize) {
		throw new Error('The bank screen stopped before every matching institution was loaded.');
	}

	const offsets: number[] = [];
	for (let offset = rows.length; offset < first.total; offset += pageSize) offsets.push(offset);
	for (let index = 0; index < offsets.length; index += 4) {
		const batchOffsets = offsets.slice(index, index + 4);
		const pages = await Promise.all(
			batchOffsets.map((offset) => fetchPage(pageQuery(query, offset), signal))
		);
		if (signal.aborted) {
			throw signal.reason ?? new DOMException('Bank screen loading was cancelled.', 'AbortError');
		}
		for (const page of pages) {
			assertPage(page, first.total);
			rows.push(...page.data);
		}
		onProgress?.({ loaded: Math.min(rows.length, first.total), total: first.total });
	}

	if (rows.length < first.total) {
		throw new Error('The bank screen stopped before every matching institution was loaded.');
	}
	return {
		data: rows.slice(0, first.total),
		total: first.total,
		truncated: false,
		asOf: first.asOf
	};
}
