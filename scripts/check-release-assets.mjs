import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const root = process.cwd();
const failures = [];
const execFileAsync = promisify(execFile);

function normalize(text) {
	return `${text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function text(path) {
	return readFile(resolve(root, path), 'utf8');
}

async function expectFile(path) {
	try {
		await access(resolve(root, path));
	} catch {
		failures.push(`Missing ${path}`);
	}
}

const packageExpectations = [
	['svelte', '5.57.0', 'MIT'],
	['@sveltejs/kit', '2.70.3', 'MIT'],
	['@sveltejs/adapter-cloudflare', '7.2.9', 'MIT'],
	['@fontsource-variable/inter', '5.3.0', 'OFL-1.1'],
	['@fontsource-variable/geist-mono', '5.3.0', 'OFL-1.1'],
	['echarts', '6.1.0', 'Apache-2.0'],
	['zrender', '6.1.0', 'BSD-3-Clause'],
	['tslib', '2.3.0', '0BSD'],
	['d3-geo', '3.1.1', 'ISC'],
	['d3-array', '3.2.4', 'ISC'],
	['internmap', '2.0.3', 'ISC'],
	['topojson-client', '3.1.0', 'ISC']
];

for (const [name, version, license] of packageExpectations) {
	const metadata = JSON.parse(await text(`node_modules/${name}/package.json`));
	if (metadata.version !== version || metadata.license !== license) {
		failures.push(
			`${name} is ${metadata.version}/${metadata.license}; update THIRD_PARTY_NOTICES.md for the locked release.`
		);
	}
}

const echartsLicense = normalize(await text('node_modules/echarts/LICENSE'));
const separator = '\n========================================================================\n';
const separatorIndex = echartsLicense.indexOf(separator);
if (separatorIndex < 0) {
	failures.push('Could not isolate the standard Apache-2.0 text from the ECharts distribution.');
} else {
	const apacheStandard = normalize(echartsLicense.slice(0, separatorIndex));
	if (normalize(await text('LICENSE')) !== apacheStandard) {
		failures.push('LICENSE is not the unmodified standard Apache License 2.0 text.');
	}
}

const licenseCopies = [
	['LICENSES/Inter-OFL-1.1.txt', 'node_modules/@fontsource-variable/inter/LICENSE'],
	['LICENSES/Geist-Mono-OFL-1.1.txt', 'node_modules/@fontsource-variable/geist-mono/LICENSE'],
	['LICENSES/d3-geo-ISC.txt', 'node_modules/d3-geo/LICENSE'],
	['LICENSES/d3-array-ISC.txt', 'node_modules/d3-array/LICENSE'],
	['LICENSES/internmap-ISC.txt', 'node_modules/internmap/LICENSE'],
	['LICENSES/topojson-client-ISC.txt', 'node_modules/topojson-client/LICENSE'],
	['LICENSES/zrender-BSD-3-Clause.txt', 'node_modules/zrender/LICENSE'],
	['LICENSES/tslib-0BSD.txt', 'node_modules/tslib/LICENSE.txt'],
	['LICENSES/Svelte-MIT.txt', 'node_modules/svelte/LICENSE.md'],
	['LICENSES/SvelteKit-MIT.txt', 'node_modules/@sveltejs/kit/LICENSE'],
	['LICENSES/adapter-cloudflare-MIT.txt', 'node_modules/@sveltejs/adapter-cloudflare/LICENSE'],
	['LICENSES/ECharts-D3-BSD-3-Clause.txt', 'node_modules/echarts/licenses/LICENSE-d3']
];

for (const [copy, source] of licenseCopies) {
	if (normalize(await text(copy)) !== normalize(await text(source))) {
		failures.push(`${copy} no longer matches ${source}.`);
	}
}

const usAtlasLicenseHash = '8048290DFDB6E83FBED17E8985C8CFC4CE9DA9B842642F3D3E497280790CFA31';
const storedUsAtlasLicenseHash = sha256(Buffer.from(normalize(await text('LICENSES/us-atlas-ISC.txt'))));
if (storedUsAtlasLicenseHash !== usAtlasLicenseHash) {
	failures.push('LICENSES/us-atlas-ISC.txt does not match the verified us-atlas 3.0.1 ISC text.');
}

const topology = await readFile(resolve(root, 'static/us-states-10m.json'));
const topologyHash = sha256(topology);
if (topologyHash !== 'D76B391CCFA8BFF601D51E3E3DA5D43A89FA46CD5CACA72CE731B383BE5596D0') {
	failures.push('static/us-states-10m.json no longer matches us-atlas 3.0.1; update provenance and license review.');
}

const webManifest = JSON.parse(await text('static/manifest.webmanifest'));
for (const icon of webManifest.icons ?? []) {
	await expectFile(resolve('static', String(icon.src).replace(/^\//, '')));
}

for (const required of [
	'DATA_NOTICE.md',
	'NOTICE',
	'THIRD_PARTY_NOTICES.md',
	'release-manifest.json',
	'static/favicon.svg',
	'static/icon-maskable.svg'
]) {
	await expectFile(required);
}

const releaseManifest = JSON.parse(await text('release-manifest.json'));
if (releaseManifest.schemaVersion !== 1) {
	failures.push('release-manifest.json uses an unsupported schema version.');
}

const allowedRootFiles = new Set(releaseManifest.allowedRootFiles ?? []);
const allowedFiles = new Set(releaseManifest.allowedFiles ?? []);
const allowedDirectories = (releaseManifest.allowedDirectories ?? []).map((path) => `${path}/`);
const forbiddenRoots = new Set((releaseManifest.forbiddenRoots ?? []).map((path) => path.toLowerCase()));
const forbiddenBasenames = new Set((releaseManifest.forbiddenBasenames ?? []).map((path) => path.toLowerCase()));
const forbiddenExtensions = (releaseManifest.forbiddenExtensions ?? []).map((suffix) => suffix.toLowerCase());
const maximumFileBytes = releaseManifest.maximumFileBytes;

if (!Number.isSafeInteger(maximumFileBytes) || maximumFileBytes <= 0) {
	failures.push('release-manifest.json must define a positive integer maximumFileBytes.');
}

for (const required of releaseManifest.requiredPaths ?? []) await expectFile(required);

const { stdout: releasePathOutput } = await execFileAsync(
	'git',
	['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
	{ cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);
const candidatePaths = releasePathOutput.split('\0').filter(Boolean);
const releasePaths = [];

function normalizePath(path) {
	return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isAllowedReleasePath(path) {
	const normalized = normalizePath(path);
	return allowedFiles.has(normalized) ||
		(!normalized.includes('/') && allowedRootFiles.has(normalized)) ||
		allowedDirectories.some((prefix) => normalized.startsWith(prefix));
}

function blockedPathReason(path) {
	const normalized = normalizePath(path);
	const lower = normalized.toLowerCase();
	const parts = lower.split('/');
	const basename = parts.at(-1) ?? lower;
	if (parts.includes('..') || normalized.startsWith('/')) return 'non-relative or parent-traversing path';
	if (forbiddenRoots.has(parts[0])) return `forbidden root ${parts[0]}`;
	if (forbiddenBasenames.has(basename)) return `forbidden file ${basename}`;
	if (basename.startsWith('.env.') && !basename.endsWith('.example')) return 'non-example environment file';
	if (basename.startsWith('.dev.vars') && basename !== '.dev.vars.example') return 'non-example Wrangler variables file';
	if (forbiddenExtensions.some((suffix) => lower.endsWith(suffix))) return 'database, archive, key, or bulk-data extension';
	if (lower.startsWith('.impeccable/') && lower !== '.impeccable/design.json') return 'raw Impeccable capture or sidecar';
	if (!isAllowedReleasePath(normalized)) return 'path is outside the public release allowlist';
	return null;
}

for (const path of candidatePaths) {
	const normalized = normalizePath(path);
	let metadata;
	try {
		metadata = await lstat(resolve(root, normalized));
	} catch (error) {
		if (error?.code === 'ENOENT') continue; // A tracked deletion is not part of the candidate release.
		throw error;
	}
	releasePaths.push(normalized);
	const reason = blockedPathReason(normalized);
	if (reason) failures.push(`Public release path is forbidden (${reason}): ${normalized}`);
	if (metadata.isSymbolicLink()) failures.push(`Public release contains a symbolic link: ${normalized}`);
	if (metadata.isFile() && metadata.size > maximumFileBytes) {
		failures.push(`Public release file exceeds ${maximumFileBytes} bytes (${metadata.size}): ${normalized}`);
	}
	if (metadata.isFile()) {
		const signature = await readFile(resolve(root, normalized));
		if (signature.subarray(0, 16).toString('ascii').startsWith('SQLite format 3')) {
			failures.push(`Public release contains a SQLite database regardless of extension: ${normalized}`);
		}
		if (signature.subarray(8, 12).toString('ascii') === 'DUCK') {
			failures.push(`Public release contains a DuckDB database regardless of extension: ${normalized}`);
		}
		if (
			signature.subarray(0, 4).toString('ascii') === 'PAR1' ||
			signature.subarray(0, 6).toString('ascii') === 'ARROW1'
		) {
			failures.push(`Public release contains a columnar data file regardless of extension: ${normalized}`);
		}
		if (
			(signature[0] === 0x50 && signature[1] === 0x4b && [0x03, 0x05, 0x07].includes(signature[2])) ||
			(signature[0] === 0x1f && signature[1] === 0x8b)
		) {
			failures.push(`Public release contains an archive regardless of extension: ${normalized}`);
		}
	}
}

const secretPatterns = [
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
	/AKIA[0-9A-Z]{16}/,
	/gh[pousr]_[A-Za-z0-9_]{20,}/,
	/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
	/xox[baprs]-[A-Za-z0-9-]{10,}/,
	/(?:sk|rk)_live_[A-Za-z0-9]{16,}/,
	/AIza[0-9A-Za-z_-]{30,}/,
	new RegExp('-----BEGIN PGP ' + 'PRIVATE KEY BLOCK-----'),
	/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
];
const assignmentPattern = /\b(?:AWS_SECRET_ACCESS_KEY|CLOUDFLARE_API_TOKEN|DATABASE_URL|FRED_API_KEY|PIPELINE_SECRET|API[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY)\s*[:=]\s*["']?([A-Za-z0-9_./+=:@<>${}-]{12,})["']?/g;
const placeholder = /^(?:<|replace|example|dummy|your-|change-|process\.|\$\{)/i;
const personalPathPatterns = [
	/(?:^|[\s"'`(])(?:[A-Za-z]:[\\/][^\r\n"'`<>|*?]+)/m,
	/(?:^|[\s"'`(])\/(?:Users|home)\/[^/\s"'`<>]+/m,
	/(?:^|[\s"'`(])\\\\[^\\\s"'`<>]+\\[^\\\s"'`<>]+/m
];

for (const path of releasePaths.filter((candidate) => !blockedPathReason(candidate))) {
	let contents;
	try {
		contents = await readFile(resolve(root, path), 'utf8');
	} catch {
		continue;
	}
	if (contents.includes('\0')) {
		failures.push(`Public release contains an unexpected binary file: ${path}`);
		continue;
	}
	let credentialLike = secretPatterns.some((pattern) => pattern.test(contents));
	assignmentPattern.lastIndex = 0;
	for (const match of contents.matchAll(assignmentPattern)) {
		if (!placeholder.test(match[1])) {
			credentialLike = true;
			break;
		}
	}
	if (credentialLike) failures.push(`Public release contains credential-like content: ${path}`);
	if (personalPathPatterns.some((pattern) => pattern.test(contents))) {
		failures.push(`Public release contains an absolute personal or machine path: ${path}`);
	}
}

async function gitIgnores(path) {
	try {
		await execFileAsync('git', ['check-ignore', '--quiet', '--no-index', path], { cwd: root });
		return true;
	} catch (error) {
		if (error?.code === 1) return false;
		if (error?.code === 'ENOENT') throw error;
		return false;
	}
}

if (!(await gitIgnores('.impeccable/review/release-probe.png'))) {
	failures.push('Raw .impeccable review captures are not ignored.');
}
if (await gitIgnores('.impeccable/design.json')) {
	failures.push('The curated .impeccable/design.json contract is unexpectedly ignored.');
}
if (!(await gitIgnores('submission/submission.md'))) {
	failures.push('Competition submission artifacts are not isolated under the ignored submission directory.');
}

const appShell = await text('src/app.html');
for (const requiredMarkup of [
	'href="%sveltekit.assets%/favicon.svg"',
	'href="%sveltekit.assets%/manifest.webmanifest"',
	'<meta name="theme-color" content="#eef1f5" />'
]) {
	if (!appShell.includes(requiredMarkup)) {
		failures.push(`src/app.html is missing release metadata: ${requiredMarkup}`);
	}
}

const notice = await text('NOTICE');
if (!notice.includes('Bankgraph contributors') || !notice.includes('Apache ECharts')) {
	failures.push('NOTICE is missing the neutral contributor or Apache ECharts attribution.');
}

const dataNotice = await text('DATA_NOTICE.md');
if (!dataNotice.includes('does not grant rights') || !dataNotice.includes('FDIC BankFind Suite')) {
	failures.push('DATA_NOTICE.md must keep the code-license boundary and FDIC fixture notice explicit.');
}

if (failures.length > 0) {
	console.error(failures.map((failure) => `- ${failure}`).join('\n'));
	process.exit(1);
}

console.log(`Release assets verified: ${releasePaths.length} allowlisted files; no local databases, bulk exports, secrets, personal paths, or raw design sidecars.`);
console.log('Licenses, data notice, fonts, icons, and topology are complete.');
