import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const persistPath = resolve(root, '.wrangler', 'ci-smoke');
const expectedParent = resolve(root, '.wrangler');

if (!persistPath.startsWith(`${expectedParent}\\`) && !persistPath.startsWith(`${expectedParent}/`)) {
	throw new Error(`Refusing to clear unexpected smoke-test path: ${persistPath}`);
}

const executable = process.execPath;
const wranglerBin = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const environment = { ...process.env, CI: 'true', NO_COLOR: '1' };

function run(args, options = {}) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(executable, args, {
			cwd: root,
			env: environment,
			stdio: 'inherit',
			...options
		});
		child.on('error', rejectRun);
		child.on('exit', (code, signal) => {
			if (code === 0) resolveRun();
			else rejectRun(new Error(`${args.join(' ')} exited with ${signal ?? code}`));
		});
	});
}

async function waitFor(url, attempts = 60) {
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return response;
			lastError = new Error(`${url} returned ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 500));
	}
	throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

await rm(persistPath, { recursive: true, force: true });

await run([
	wranglerBin, 'd1', 'migrations', 'apply', 'DB', '--local',
	'--persist-to', persistPath
]);
await run([
	wranglerBin, 'd1', 'execute', 'DB', '--local',
	'--persist-to', persistPath,
	'--file', 'scripts/fixtures/ci-smoke.sql',
	'--yes'
]);

const worker = spawn(executable, [
	wranglerBin, 'dev', '--local',
	'--persist-to', persistPath,
	'--ip', '127.0.0.1',
	'--port', '4173',
	'--log-level', 'error'
], {
	cwd: root,
	env: environment,
	stdio: ['ignore', 'pipe', 'pipe']
});

let workerOutput = '';
worker.stdout.on('data', (chunk) => { workerOutput += chunk.toString(); });
worker.stderr.on('data', (chunk) => { workerOutput += chunk.toString(); });

try {
	const home = await waitFor('http://127.0.0.1:4173/');
	const homeText = await home.text();
	if (!homeText.toLowerCase().includes('bank')) {
		throw new Error('The home page did not contain the expected product text.');
	}

	const metaResponse = await waitFor('http://127.0.0.1:4173/api/v1/meta');
	const meta = await metaResponse.json();
	if (meta.active_count !== 2 || meta.latest_quarter !== '20260630') {
		throw new Error(`Unexpected metadata response: ${JSON.stringify(meta)}`);
	}

	const banksResponse = await waitFor(
		'http://127.0.0.1:4173/api/v1/banks?active=1&sort=assets&order=desc&limit=1'
	);
	const banks = await banksResponse.json();
	if (banks.total !== 2 || banks.data?.[0]?.cert !== 900002) {
		throw new Error(`Unexpected bank-screen response: ${JSON.stringify(banks)}`);
	}

	console.log('Seeded Worker smoke test passed: home, metadata, and bank screen.');
} catch (error) {
	if (workerOutput.trim()) console.error(workerOutput.trim());
	throw error;
} finally {
	if (!worker.killed) worker.kill('SIGTERM');
	await new Promise((resolveExit) => {
		if (worker.exitCode !== null) resolveExit();
		else {
			worker.once('exit', resolveExit);
			setTimeout(resolveExit, 5_000).unref();
		}
	});
}
