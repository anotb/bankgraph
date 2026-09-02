import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const deadlineMs = 170_000;
const startedAt = Date.now();
const node = process.execPath;

const checks = [
	{
		label: 'Recorded FDIC demo evidence',
		args: [resolve(root, 'demo', 'fixtures', 'verify-demo.mjs')]
	},
	{
		label: 'Recorded FDIC seed behavior',
		args: ['--test', resolve(root, 'demo', 'fixtures', 'fixture.test.mjs')]
	},
	{
		label: 'WebMCP workspace contract',
		args: [
			resolve(root, 'node_modules', 'vitest', 'vitest.mjs'),
			'run',
			'src/lib/webmcp/catalog.test.ts',
			'src/lib/webmcp/browser-services.test.ts',
			'src/lib/webmcp/host.test.ts',
			'src/lib/components/workspace/workspace-attribution.test.ts'
		]
	}
];

function run({ label, args }) {
	return new Promise((resolveRun, rejectRun) => {
		const remaining = deadlineMs - (Date.now() - startedAt);
		if (remaining <= 0) {
			rejectRun(new Error(`The demo exceeded its ${deadlineMs / 1_000}-second deadline before ${label}.`));
			return;
		}
		console.log(`\n[demo] ${label}`);
		const child = spawn(node, args, {
			cwd: root,
			env: { ...process.env, CI: 'true', NO_COLOR: '1' },
			stdio: 'inherit'
		});
		const timeout = setTimeout(() => {
			child.kill();
			rejectRun(new Error(`${label} exceeded the remaining demo time.`));
		}, remaining);
		child.on('error', (error) => {
			clearTimeout(timeout);
			rejectRun(error);
		});
		child.on('exit', (code, signal) => {
			clearTimeout(timeout);
			if (code === 0) resolveRun();
			else rejectRun(new Error(`${label} exited with ${signal ?? code}.`));
		});
	});
}

for (const check of checks) await run(check);

const elapsedSeconds = ((Date.now() - startedAt) / 1_000).toFixed(1);
console.log(`\n[demo] Ready in ${elapsedSeconds}s: recorded evidence verified and WebMCP contracts executable.`);
