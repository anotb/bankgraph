export type PublicationState = 'unpublished' | 'refreshing' | 'ready';

export interface PublicationControl {
	state: PublicationState;
	release: string | null;
	generation: string | null;
	pendingRelease: string | null;
	pendingGeneration: string | null;
	pendingRunId: string | null;
	updatedAt: string;
}

export interface PublishedReadSnapshot {
	release: string;
	generation: string;
}

interface PublicationControlRow {
	state: PublicationState;
	release: string | null;
	generation: string | null;
	pending_release: string | null;
	pending_generation: string | null;
	pending_run_id: string | null;
	updated_at: string;
}

function mapControl(row: PublicationControlRow): PublicationControl {
	return {
		state: row.state,
		release: row.release,
		generation: row.generation,
		pendingRelease: row.pending_release,
		pendingGeneration: row.pending_generation,
		pendingRunId: row.pending_run_id,
		updatedAt: row.updated_at
	};
}

export async function readPublicationControl(db: D1Database): Promise<PublicationControl | null> {
	const row = await db.prepare(
		`SELECT state, release, generation, pending_release, pending_generation,
		        pending_run_id, updated_at
		 FROM release_control WHERE singleton = 1`
	).first<PublicationControlRow>();
	return row ? mapControl(row) : null;
}

/**
 * Admit a public request from D1's primary only when the durable gate and the
 * published release marker agree. D1 bindings that do not opt into Sessions
 * read replication execute on the primary, so this read is authoritative.
 */
export async function acquirePublishedReadSnapshot(
	db: D1Database
): Promise<PublishedReadSnapshot | null> {
	return db.prepare(
		`SELECT control.release, control.generation
		 FROM release_control AS control
		 JOIN pipeline_state AS published
		   ON published.key = 'published_release' AND published.value = control.release
		 WHERE control.singleton = 1 AND control.state = 'ready'
		   AND control.release IS NOT NULL AND control.generation IS NOT NULL`
	).first<PublishedReadSnapshot>();
}

/**
 * A response is deliverable only if the same release stayed ready throughout
 * rendering. Overlapping refresh work is therefore discarded, not exposed.
 */
export async function validatePublishedReadSnapshot(
	db: D1Database,
	snapshot: PublishedReadSnapshot
): Promise<boolean> {
	const row = await db.prepare(
		`SELECT 1 AS valid
		 FROM release_control AS control
		 JOIN pipeline_state AS published
		   ON published.key = 'published_release' AND published.value = control.release
		 WHERE control.singleton = 1 AND control.state = 'ready'
		   AND control.release = ? AND control.generation = ?`
	).bind(snapshot.release, snapshot.generation).first<{ valid: number }>();
	return row?.valid === 1;
}

/** Close the authoritative gate before any live-table mutation begins. */
export async function closePublicationBarrier(
	db: D1Database,
	now = new Date().toISOString()
): Promise<void> {
	await db.prepare(
		`UPDATE release_control
		 SET state = 'refreshing',
		     pending_release = NULL,
		     pending_generation = NULL,
		     pending_run_id = NULL,
		     updated_at = ?
		 WHERE singleton = 1`
	).bind(now).run();
}

/**
 * Initial population has no safe release to serve and remains fail-closed.
 * Once a release has been elected, routine pipeline work is written behind
 * the published-release views and must not take the whole application down.
 */
export async function closeBarrierUnlessPublished(db: D1Database): Promise<boolean> {
	const snapshot = await acquirePublishedReadSnapshot(db);
	if (snapshot) return false;
	await closePublicationBarrier(db);
	return true;
}

/** Fail closed unless the durable D1 gate is closed for maintenance. */
export async function assertPublicationBarrierClosed(db: D1Database): Promise<void> {
	const row = await db.prepare(
		'SELECT state FROM release_control WHERE singleton = 1'
	).first<{ state: PublicationState }>();
	if (row?.state !== 'refreshing') {
		throw new Error('D1 publication barrier is not closed for maintenance');
	}
}

export async function recordPipelineStageCompletion(
	db: D1Database,
	runId: string,
	stage: string,
	scope = '',
	completedAt = new Date().toISOString()
): Promise<void> {
	await db.prepare(
		`INSERT INTO pipeline_run_stages (run_id, stage, scope, completed_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(run_id, stage, scope) DO UPDATE SET completed_at = excluded.completed_at`
	).bind(runId, stage, scope, completedAt).run();
}
