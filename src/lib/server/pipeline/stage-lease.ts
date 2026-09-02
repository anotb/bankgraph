const LEASE_KEY = 'pipeline:stage-lease';
const LEASE_TTL_MS = 45 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 60 * 1000;
const RUN_ID_RE = /^[A-Za-z0-9._:-]+$/;

export interface PipelineStageLease {
	key: string;
	value: string;
}

export interface PipelineLeaseHeartbeat {
	assertOwned(): Promise<void>;
	stop(): Promise<void>;
}

export function parsePipelineRunId(value: string | null): string {
	if (value === null || value.trim() === '') return crypto.randomUUID();
	const runId = value.trim();
	if (runId.length > 128 || !RUN_ID_RE.test(runId)) {
		throw new Error('X-Pipeline-Run-Id must be 1-128 URL-safe characters');
	}
	return runId;
}

/**
 * Atomically claim the single D1 pipeline lease unless the prior claim is stale.
 * The conditional UPSERT makes overlapping Workers race on one SQLite write.
 */
export async function acquirePipelineStageLease(
	db: D1Database,
	stage: string,
	runId: string,
	nowMs = Date.now()
): Promise<PipelineStageLease | null> {
	const now = new Date(nowMs).toISOString();
	const staleBefore = new Date(nowMs - LEASE_TTL_MS).toISOString();
	const value = JSON.stringify({ stage, runId, acquiredAt: now });
	const result = await db.prepare(
		`INSERT INTO pipeline_state (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
		 WHERE pipeline_state.updated_at IS NULL OR pipeline_state.updated_at < ?`
	).bind(LEASE_KEY, value, now, staleBefore).run();

	return (result.meta.changes ?? 0) > 0 ? { key: LEASE_KEY, value } : null;
}

/** Release only the lease owned by this request, never a newer replacement. */
export async function releasePipelineStageLease(
	db: D1Database,
	lease: PipelineStageLease
): Promise<void> {
	await db.prepare('DELETE FROM pipeline_state WHERE key = ? AND value = ?')
		.bind(lease.key, lease.value)
		.run();
}

export async function renewPipelineStageLease(
	db: D1Database,
	lease: PipelineStageLease,
	nowMs = Date.now()
): Promise<boolean> {
	const result = await db.prepare(
		'UPDATE pipeline_state SET updated_at = ? WHERE key = ? AND value = ?'
	).bind(new Date(nowMs).toISOString(), lease.key, lease.value).run();
	return (result.meta.changes ?? 0) === 1;
}

/** Keep long HTTP ingestion requests from aging out of the owner-fenced lease. */
export function startPipelineLeaseHeartbeat(
	db: D1Database,
	lease: PipelineStageLease,
	intervalMs = LEASE_HEARTBEAT_MS
): PipelineLeaseHeartbeat {
	let stopped = false;
	let lost: Error | null = null;
	let inFlight = Promise.resolve();
	const renew = (): void => {
		inFlight = inFlight.then(async () => {
			if (stopped || lost) return;
			try {
				if (!(await renewPipelineStageLease(db, lease))) {
					lost = new Error('Pipeline stage lease ownership was lost');
				}
			} catch (error) {
				lost = error instanceof Error ? error : new Error('Pipeline stage lease renewal failed');
			}
		});
	};
	const timer = setInterval(renew, intervalMs);
	return {
		async assertOwned(): Promise<void> {
			await inFlight;
			if (lost) throw lost;
			if (!(await renewPipelineStageLease(db, lease))) {
				lost = new Error('Pipeline stage lease ownership was lost');
				throw lost;
			}
		},
		async stop(): Promise<void> {
			stopped = true;
			clearInterval(timer);
			await inFlight;
		}
	};
}
