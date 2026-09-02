import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const cleanClone = process.argv.slice(2).includes('--clean-clone');
const unknown = process.argv.slice(2).filter((argument) => argument !== '--clean-clone');
const npmCli = process.env.npm_execpath;

if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(' ')}`);

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
		env: { ...process.env, CI: 'true', NO_COLOR: '1' }
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (options.capture) {
			if (result.stdout?.trim()) console.error(result.stdout.trim());
			if (result.stderr?.trim()) console.error(result.stderr.trim());
		}
		throw new Error(`${command} ${args.join(' ')} exited with ${result.status}.`);
	}
	return result.stdout ?? '';
}

function runNpm(args, options = {}) {
	if (npmCli) return run(process.execPath, [npmCli, ...args], options);
	return run('npm', args, options);
}

run('git', ['diff', '--check'], { capture: true });
run('git', ['diff', '--cached', '--check'], { capture: true });
run(process.execPath, ['scripts/check-release-assets.mjs']);
runNpm(['run', 'fixture:verify']);

if (!cleanClone) {
	console.log('Candidate public-release preflight passed.');
	console.log('After the release files are committed, run `npm run preflight:public -- --clean-clone` to test exactly what a new clone receives.');
	process.exit(0);
}

const status = run('git', ['status', '--porcelain=v1'], { capture: true });
if (status.trim()) {
	throw new Error('The clean-clone preflight requires a clean worktree so the clone cannot omit uncommitted release files.');
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'bankgraph-public-preflight-'));
const cloneRoot = resolve(temporaryRoot, 'bankgraph');
try {
	run('git', ['clone', '--local', '--no-hardlinks', root, cloneRoot]);
	runNpm(['ci'], { cwd: cloneRoot });
	runNpm(['run', 'release:check'], { cwd: cloneRoot });
	console.log('Clean-clone public-release preflight passed. Repository visibility and remote history still require owner review.');
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
