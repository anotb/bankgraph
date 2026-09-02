import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureDir, '../..');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function run(arguments_) {
	const result = spawnSync(process.execPath, [wranglerCli, ...arguments_.slice(1)], {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: 'inherit',
		env: { ...process.env, CI: 'true' }
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local']);
run(['wrangler', 'd1', 'execute', 'DB', '--local', '--file', join(fixtureDir, 'bank-data-demo.sql')]);

console.log('Local demo data is ready. Re-running this command is safe.');
