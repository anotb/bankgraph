import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const persistPath = resolve(root, '.wrangler', 'webmcp-e2e');
const expectedParent = resolve(root, '.wrangler');

if (!persistPath.startsWith(`${expectedParent}\\`) && !persistPath.startsWith(`${expectedParent}/`)) {
	throw new Error(`Refusing to clear unexpected WebMCP E2E path: ${persistPath}`);
}

const executable = process.execPath;
const wranglerBin = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const environment = { ...process.env, CI: 'true', NO_COLOR: '1' };

function run(args) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(executable, args, {
			cwd: root,
			env: environment,
			stdio: 'inherit'
		});
		child.on('error', rejectRun);
		child.on('exit', (code, signal) => {
			if (code === 0) resolveRun();
			else rejectRun(new Error(`${args.join(' ')} exited with ${signal ?? code}`));
		});
	});
}

await rm(persistPath, { recursive: true, force: true });
await run([
	wranglerBin,
	'd1',
	'migrations',
	'apply',
	'DB',
	'--local',
	'--persist-to',
	persistPath
]);
await run([
	wranglerBin,
	'd1',
	'execute',
	'DB',
	'--local',
	'--persist-to',
	persistPath,
	'--file',
	'scripts/fixtures/ci-smoke.sql',
	'--yes'
]);

const worker = spawn(
	executable,
	[
		wranglerBin,
		'dev',
		'--local',
		'--persist-to',
		persistPath,
		'--ip',
		'127.0.0.1',
		'--port',
		'4174',
		'--var',
		'ALLOW_RECORDED_DEMO:true',
		'--log-level',
		'error'
	],
	{
		cwd: root,
		env: environment,
		stdio: 'inherit'
	}
);

let stopping = false;
function stop(signal) {
	if (stopping) return;
	stopping = true;
	if (!worker.killed) worker.kill(signal);
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
worker.once('error', (error) => {
	console.error(error);
	process.exitCode = 1;
});
worker.once('exit', (code, signal) => {
	if (!stopping && code !== 0) {
		console.error(`Seeded E2E Worker exited with ${signal ?? code}`);
		process.exitCode = code ?? 1;
	}
});

await new Promise((resolveExit) => worker.once('exit', resolveExit));
