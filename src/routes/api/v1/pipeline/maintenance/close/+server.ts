import type { RequestHandler } from './$types';
import { getDB } from '$lib/server/db';
import { logError, logInfo, logWarn } from '$lib/server/observability';
import { verifyPipelineBearer } from '$lib/server/pipeline/auth';
import {
	acquirePipelineStageLease,
	parsePipelineRunId,
	releasePipelineStageLease,
	startPipelineLeaseHeartbeat,
	type PipelineLeaseHeartbeat,
	type PipelineStageLease
} from '$lib/server/pipeline/stage-lease';
import {
	closePublicationBarrier,
	readPublicationControl
} from '$lib/server/publication-barrier';

function maintenanceJson(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}

/** Close the public gate before an operator applies a migration or manual write. */
export const POST: RequestHandler = async ({ platform, request }) => {
	const secret = platform?.env?.PIPELINE_SECRET;
	if (!secret) return maintenanceJson({ ok: false, error: 'PIPELINE_SECRET not configured' }, 500);
	if (!(await verifyPipelineBearer(request.headers.get('Authorization'), secret))) {
		logWarn('maintenance_close_auth_rejected', {});
		return maintenanceJson({ ok: false, error: 'Unauthorized' }, 401);
	}

	let runId: string;
	try {
		runId = parsePipelineRunId(request.headers.get('X-Pipeline-Run-Id'));
	} catch (error) {
		return maintenanceJson({
			ok: false,
			error: error instanceof Error ? error.message : 'Invalid run id'
		}, 400);
	}

	const db = getDB(platform);
	let lease: PipelineStageLease | null = null;
	let heartbeat: PipelineLeaseHeartbeat | null = null;
	try {
		lease = await acquirePipelineStageLease(db, 'maintenance-close', runId);
		if (!lease) return maintenanceJson({
			ok: false,
			error: 'Another pipeline stage is already running'
		}, 409);
		heartbeat = startPipelineLeaseHeartbeat(db, lease);
		await closePublicationBarrier(db);
		await heartbeat.assertOwned();
		const publication = await readPublicationControl(db);
		logInfo('maintenance_gate_closed', { run_id: runId });
		return maintenanceJson({ ok: true, run_id: runId, publication });
	} catch (error) {
		logError('maintenance_gate_close_failed', {
			run_id: runId,
			error: error instanceof Error ? error.message : 'Unknown error'
		});
		return maintenanceJson({ ok: false, error: 'Failed to close the publication gate' }, 500);
	} finally {
		if (lease) {
			try {
				await heartbeat?.stop();
				await releasePipelineStageLease(db, lease);
			} catch (error) {
				logError('maintenance_lease_release_failed', {
					run_id: runId,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}
	}
};
