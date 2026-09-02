import { readFileSync } from 'node:fs';

const baseUrl = (process.env.BACKFILL_URL ?? '').replace(/\/$/, '');
if (!baseUrl) throw new Error('BACKFILL_URL is required');

function pipelineSecret(): string {
	if (process.env.PIPELINE_SECRET) return process.env.PIPELINE_SECRET;
	try {
		const match = readFileSync('.dev.vars', 'utf8').match(/PIPELINE_SECRET\s*=\s*"?([^"\n]+)"?/);
		if (match) return match[1].trim();
	} catch {
		// Fall through to the explicit configuration error.
	}
	throw new Error('PIPELINE_SECRET is required');
}

const runId = process.env.MAINTENANCE_RUN_ID?.trim() || `maintenance-${crypto.randomUUID()}`;
if (runId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(runId)) {
	throw new Error('MAINTENANCE_RUN_ID must be 1-128 URL-safe characters');
}

const response = await fetch(`${baseUrl}/api/v1/pipeline/maintenance/close`, {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${pipelineSecret()}`,
		'X-Pipeline-Run-Id': runId
	}
});
const body = await response.text();
if (body) process.stdout.write(`${body}\n`);
if (!response.ok) throw new Error(`Maintenance close failed with HTTP ${response.status}`);
process.stdout.write(`Publication gate closed for maintenance run ${runId}.\n`);
