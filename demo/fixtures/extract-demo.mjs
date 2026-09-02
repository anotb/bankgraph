import { createHash } from 'node:crypto';
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureDir, '../..');
const fixturePinPath = join(fixtureDir, 'fixture-pin.json');
const fixturePinText = readFileSync(fixturePinPath, 'utf8').replaceAll('\r\n', '\n');
const fixturePin = JSON.parse(fixturePinText);
const BANKS = fixturePin.banks;
const QUARTER_COUNT = fixturePin.quarterCount;
const PINNED_REPORTING_DATE = fixturePin.reportingQuarter;
const FDIC_API = 'https://api.fdic.gov/banks';

if (fixturePin.schemaVersion !== 1) throw new Error('Unsupported fixture-pin.json schema version.');
if (!/^\d{4}(?:0331|0630|0930|1231)$/.test(PINNED_REPORTING_DATE)) {
	throw new Error('fixture-pin.json reportingQuarter must be a YYYYMMDD calendar-quarter end.');
}
if (!Number.isSafeInteger(QUARTER_COUNT) || QUARTER_COUNT < 2 || QUARTER_COUNT > 40) {
	throw new Error('fixture-pin.json quarterCount must be an integer from 2 through 40.');
}
if (!Array.isArray(BANKS) || BANKS.length === 0 || new Set(BANKS.map((bank) => bank.cert)).size !== BANKS.length) {
	throw new Error('fixture-pin.json must contain a non-empty set of unique FDIC certificates.');
}
if (typeof fixturePin.fixtureId !== 'string' || !fixturePin.fixtureId) {
	throw new Error('fixture-pin.json must name the recorded fixture.');
}

const financialSourceFields = [
	'CERT', 'REPDTE', 'ASSET', 'DEP', 'EQ', 'LNLSNET', 'LNRE', 'LNCI', 'LNCON',
	'SC', 'NETINC', 'INTINC', 'EINTEXP', 'NIM', 'NONII', 'NONIX', 'ELNATR',
	'ROA', 'ROE', 'NIMY', 'EEFFR', 'RBCRWAJ', 'RBC1RWAJ', 'RBC1AAJ', 'EQV',
	'NCLNLSR', 'LNATRESR', 'NTLNLSR', 'LNLSDEPR', 'OTHBFHLB', 'NUMEMP'
];

const institutionSourceFields = [
	'CERT', 'RSSDID', 'NAME', 'CITY', 'STALP', 'ZIP', 'COUNTY', 'BKCLASS',
	'REGAGNT', 'ACTIVE', 'ESTYMD', 'INSDATE', 'NAMEHCR', 'RSSDHCR', 'ASSET',
	'DEP', 'OFFDOM', 'NUMEMP', 'REPDTE', 'ROA', 'ROE', 'NIMY', 'NCLNLSR',
	'RBC1RWAJ'
];

const institutionColumns = [
	'cert', 'rssd_id', 'name', 'city', 'state', 'zip', 'county',
	'charter_class', 'regulator', 'active', 'established_date', 'insured_date',
	'holding_company', 'hc_rssd_id', 'asset_tier', 'total_assets', 'total_deposits',
	'num_branches', 'num_employees', 'latest_repdte', 'latest_roa', 'latest_roe',
	'latest_nim', 'latest_npl_ratio', 'latest_tier1_ratio'
];

const financialColumns = [
	'cert', 'repdte', 'asset', 'dep', 'eq', 'lnlsnet', 'lnre', 'lnci', 'lncon',
	'sec', 'netinc', 'intinc', 'eintexp', 'nim', 'nonii', 'nonix', 'elnatr',
	'roa', 'roe', 'nimy', 'eeffr', 'rbcrwaj', 'rbc1rwaj', 'rbc1aaj', 'eqv',
	'nclnlsr', 'lnatresr', 'nco_ratio', 'lnlsdepr', 'othbfhlb', 'numemp',
	'asset_bucket'
];

const industryColumns = ['repdte', 'segment', 'metric', 'value', 'count'];

function parseArgs(argv) {
	const options = { source: null, check: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--check') options.check = true;
		else if (argument === '--source') options.source = argv[++index];
		else if (argument.startsWith('--source=')) options.source = argument.slice(9);
		else throw new Error(`Unknown argument: ${argument}`);
	}
	return options;
}

function toNumber(value) {
	return value === null || value === undefined || value === '' ? null : Number(value);
}

function assetBucket(asset) {
	if (asset === null) return null;
	if (asset < 100_000) return 1;
	if (asset < 300_000) return 2;
	if (asset < 1_000_000) return 3;
	if (asset < 10_000_000) return 4;
	if (asset < 50_000_000) return 5;
	if (asset < 250_000_000) return 6;
	return 7;
}

function mapFinancial(raw) {
	const asset = toNumber(raw.ASSET);
	return {
		cert: Number(raw.CERT),
		repdte: String(raw.REPDTE),
		asset,
		dep: toNumber(raw.DEP),
		eq: toNumber(raw.EQ),
		lnlsnet: toNumber(raw.LNLSNET),
		lnre: toNumber(raw.LNRE),
		lnci: toNumber(raw.LNCI),
		lncon: toNumber(raw.LNCON),
		sec: toNumber(raw.SC),
		netinc: toNumber(raw.NETINC),
		intinc: toNumber(raw.INTINC),
		eintexp: toNumber(raw.EINTEXP),
		nim: toNumber(raw.NIM),
		nonii: toNumber(raw.NONII),
		nonix: toNumber(raw.NONIX),
		elnatr: toNumber(raw.ELNATR),
		roa: toNumber(raw.ROA),
		roe: toNumber(raw.ROE),
		nimy: toNumber(raw.NIMY),
		eeffr: toNumber(raw.EEFFR),
		rbcrwaj: toNumber(raw.RBCRWAJ),
		rbc1rwaj: toNumber(raw.RBC1RWAJ),
		rbc1aaj: toNumber(raw.RBC1AAJ),
		eqv: toNumber(raw.EQV),
		nclnlsr: toNumber(raw.NCLNLSR),
		lnatresr: toNumber(raw.LNATRESR),
		nco_ratio: toNumber(raw.NTLNLSR),
		lnlsdepr: toNumber(raw.LNLSDEPR),
		othbfhlb: toNumber(raw.OTHBFHLB),
		numemp: toNumber(raw.NUMEMP),
		asset_bucket: assetBucket(asset)
	};
}

function normalizeApiDate(value, fallback) {
	if (!value) return fallback;
	const text = String(value);
	if (/^\d{8}$/.test(text)) return text;
	const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	return match ? `${match[3]}${match[1]}${match[2]}` : fallback;
}

function mapInstitution(raw, latestFinancial) {
	const totalAssets = toNumber(latestFinancial.asset ?? raw.ASSET);
	return {
		cert: Number(raw.CERT),
		rssd_id: toNumber(raw.RSSDID),
		name: String(raw.NAME),
		city: raw.CITY == null ? null : String(raw.CITY),
		state: raw.STALP == null ? null : String(raw.STALP),
		zip: raw.ZIP == null ? null : String(raw.ZIP),
		county: raw.COUNTY == null ? null : String(raw.COUNTY),
		charter_class: raw.BKCLASS == null ? null : String(raw.BKCLASS),
		regulator: raw.REGAGNT == null ? null : String(raw.REGAGNT),
		active: raw.ACTIVE == null ? 1 : Number(raw.ACTIVE),
		established_date: raw.ESTYMD == null ? null : String(raw.ESTYMD),
		insured_date: raw.INSDATE == null ? null : String(raw.INSDATE),
		holding_company: raw.NAMEHCR == null ? null : String(raw.NAMEHCR),
		hc_rssd_id: toNumber(raw.RSSDHCR),
		asset_tier: assetBucket(totalAssets),
		total_assets: totalAssets,
		total_deposits: latestFinancial.dep,
		num_branches: toNumber(raw.OFFDOM),
		num_employees: latestFinancial.numemp,
		latest_repdte: normalizeApiDate(raw.REPDTE, latestFinancial.repdte),
		latest_roa: latestFinancial.roa,
		latest_roe: latestFinancial.roe,
		latest_nim: latestFinancial.nimy,
		latest_npl_ratio: latestFinancial.nclnlsr,
		latest_tier1_ratio: latestFinancial.rbc1rwaj
	};
}

function apiUrl(dataset, parameters) {
	const url = new URL(`${FDIC_API}/${dataset}`);
	for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
	return url.toString();
}

async function fetchFdic(url) {
	let lastError;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const response = await fetch(url, { headers: { accept: 'application/json' } });
			if (response.ok) return response.json();
			lastError = new Error(`FDIC API returned ${response.status} for ${url}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 300 * 2 ** attempt));
	}
	throw lastError;
}

async function mapWithConcurrency(values, limit, mapper) {
	const results = new Array(values.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < values.length) {
			const index = nextIndex++;
			results[index] = await mapper(values[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
	return results;
}

function median(values) {
	const sorted = values.filter((value) => value !== null).sort((left, right) => left - right);
	if (sorted.length === 0) return null;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function industryAggregatesForQuarter(repdte, rows) {
	const segments = [
		['all', () => true],
		['community', (row) => [1, 2, 3].includes(assetBucket(toNumber(row.ASSET)))],
		['regional', (row) => [4, 5].includes(assetBucket(toNumber(row.ASSET)))],
		['large', (row) => [6, 7].includes(assetBucket(toNumber(row.ASSET)))]
	];
	const output = [];
	for (const [segment, predicate] of segments) {
		const members = rows.filter(predicate);
		const bankCount = new Set(members.map((row) => Number(row.CERT))).size;
		const sum = (field) => members.reduce((total, row) => total + (toNumber(row[field]) ?? 0), 0);
		const push = (metric, value, count = bankCount) => output.push({ repdte, segment, metric, value, count });
		push('total_assets', sum('ASSET'));
		push('bank_count', bankCount);
		push('total_deposits', sum('DEP'));
		for (const [metric, field] of [['median_roa', 'ROA'], ['median_roe', 'ROE'], ['median_nim', 'NIMY'], ['median_npl', 'NCLNLSR']]) {
			const values = members.map((row) => toNumber(row[field])).filter((value) => value !== null);
			push(metric, median(values), values.length);
		}
	}
	return output;
}

async function buildApiFixture() {
	const recordedAt = new Date().toISOString();
	const bankResponses = await mapWithConcurrency(BANKS, 3, async (bank) => {
		const financialUrl = apiUrl('financials', {
			filters: `CERT:${bank.cert}`,
			sort_by: 'REPDTE',
			sort_order: 'DESC',
			limit: Math.max(QUARTER_COUNT + 8, 40),
			fields: financialSourceFields.join(',')
		});
		const institutionUrl = apiUrl('institutions', {
			filters: `CERT:${bank.cert}`,
			limit: 1,
			fields: institutionSourceFields.join(',')
		});
		const [financialResponse, institutionResponse] = await Promise.all([
			fetchFdic(financialUrl),
			fetchFdic(institutionUrl)
		]);
		return { bank, financialUrl, institutionUrl, financialResponse, institutionResponse };
	});
	const financialIndexes = new Set(bankResponses.map(({ financialResponse }) => financialResponse.meta.index.name));
	const institutionIndexes = new Set(bankResponses.map(({ institutionResponse }) => institutionResponse.meta.index.name));
	if (financialIndexes.size !== 1 || institutionIndexes.size !== 1) {
		throw new Error('FDIC reindexed a source while extraction was running. Retry so the fixture comes from one consistent index per dataset.');
	}

	const dateSets = bankResponses.map(({ financialResponse }) =>
		new Set(financialResponse.data.map((item) => String(item.data.REPDTE)))
	);
	const commonDates = [...dateSets[0]]
		.filter((date) => date <= PINNED_REPORTING_DATE && dateSets.every((dates) => dates.has(date)))
		.sort()
		.slice(-QUARTER_COUNT);
	if (commonDates.length !== QUARTER_COUNT) throw new Error(`FDIC API returned only ${commonDates.length} common quarters.`);
	if (commonDates.at(-1) !== PINNED_REPORTING_DATE) {
		throw new Error(`FDIC API did not return the pinned reporting quarter ${PINNED_REPORTING_DATE}. Update nothing until the source publishes that quarter for every selected bank.`);
	}

	const financials = bankResponses
		.flatMap(({ financialResponse }) => financialResponse.data.map((item) => mapFinancial(item.data)))
		.filter((row) => commonDates.includes(row.repdte))
		.sort((left, right) => left.repdte.localeCompare(right.repdte) || left.cert - right.cert);
	const latestDate = commonDates.at(-1);
	const institutions = bankResponses
		.map(({ institutionResponse, bank }) => {
			const raw = institutionResponse.data[0]?.data;
			if (!raw) throw new Error(`FDIC institutions API returned no row for CERT ${bank.cert}.`);
			const latestFinancial = financials.find((row) => row.cert === bank.cert && row.repdte === latestDate);
			return mapInstitution(raw, latestFinancial);
		})
		.sort((left, right) => left.cert - right.cert);

	const industryResponses = await mapWithConcurrency(commonDates, 3, async (repdte) => {
		const url = apiUrl('financials', {
			filters: `REPDTE:${repdte}`,
			sort_by: 'CERT',
			sort_order: 'ASC',
			limit: 10_000,
			fields: 'CERT,REPDTE,ASSET,DEP,ROA,ROE,NIMY,NCLNLSR'
		});
		const response = await fetchFdic(url);
		if (response.data.length !== response.totals.count) {
			throw new Error(`Quarter ${repdte} returned ${response.data.length} of ${response.totals.count} rows.`);
		}
		return { repdte, url, response };
	});
	const industryIndexes = new Set(industryResponses.map(({ response }) => response.meta.index.name));
	if (industryIndexes.size !== 1 || !industryIndexes.has(bankResponses[0].financialResponse.meta.index.name)) {
		throw new Error('Bank and industry records came from different FDIC financial indexes. Retry after the source refresh settles.');
	}
	const industryAggregates = industryResponses
		.flatMap(({ repdte, response }) => industryAggregatesForQuarter(repdte, response.data.map((item) => item.data)))
		.sort((left, right) => left.repdte.localeCompare(right.repdte) || left.segment.localeCompare(right.segment) || left.metric.localeCompare(right.metric));

	const asOf = isoDate(latestDate);
	return {
		data: {
			schemaVersion: 1,
			fixtureId: fixturePin.fixtureId,
			asOf,
			period: { start: isoDate(commonDates[0]), end: asOf, quarters: commonDates },
			units: {
				monetary: 'USD thousands, as reported by FDIC BankFind Suite',
				ratios: 'percentage points unless a field definition states otherwise',
				dates: 'YYYYMMDD in database rows; ISO 8601 in fixture metadata'
			},
			institutions,
			financials,
			industryAggregates
		},
		source: {
			mode: 'official-api',
			recordedAt,
			financialIndex: bankResponses[0].financialResponse.meta.index,
			institutionIndex: bankResponses[0].institutionResponse.meta.index,
			quarterIndexes: Object.fromEntries(industryResponses.map(({ repdte, response }) => [repdte, response.meta.index])),
			quarterResponseCounts: Object.fromEntries(industryResponses.map(({ repdte, response }) => [repdte, response.totals.count])),
			requestUrls: {
				banks: bankResponses.flatMap(({ bank, financialUrl, institutionUrl }) => [
					{ cert: bank.cert, dataset: 'financials', url: financialUrl },
					{ cert: bank.cert, dataset: 'institutions', url: institutionUrl }
				]),
				industryQuarters: industryResponses.map(({ repdte, url }) => ({ repdte, url }))
			}
		}
	};
}

function walkSqliteFiles(directory) {
	if (!existsSync(directory)) return [];
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...walkSqliteFiles(path));
		else if (entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite') {
			files.push(path);
		}
	}
	return files.sort();
}

function hasSourceTables(path) {
	let database;
	try {
		database = new DatabaseSync(path, { readOnly: true });
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('institutions', 'financials', 'agg_industry')")
			.all()
			.map((row) => row.name);
		if (tables.length !== 3) return false;
		return database.prepare('SELECT COUNT(*) AS count FROM financials').get().count > 0;
	} catch {
		return false;
	} finally {
		database?.close();
	}
}

function findSourceDatabase(explicitPath) {
	if (explicitPath) {
		const path = resolve(explicitPath);
		if (!hasSourceTables(path)) throw new Error(`Source is not a populated Bank Data D1 database: ${path}`);
		return path;
	}

	const candidates = walkSqliteFiles(join(repoRoot, '.wrangler', 'state', 'v3', 'd1'))
		.filter(hasSourceTables)
		.sort((left, right) => statSync(right).size - statSync(left).size);
	if (candidates.length === 0) {
		throw new Error('No populated local D1 database found. Run the FDIC backfill or pass --source <sqlite-file>.');
	}
	return candidates[0];
}

function querySelectedRows(database, table, columns, predicate, parameters, orderBy) {
	const sql = `SELECT ${columns.join(', ')} FROM ${table} WHERE ${predicate} ORDER BY ${orderBy}`;
	return database.prepare(sql).all(...parameters);
}

function isoDate(repdte) {
	return `${repdte.slice(0, 4)}-${repdte.slice(4, 6)}-${repdte.slice(6, 8)}`;
}

function canonicalJson(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

function sqlValue(value) {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`Cannot write non-finite number to SQL: ${value}`);
		return String(value);
	}
	return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInsert(table, columns, rows) {
	return rows
		.map((row) => `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`)
		.join('\n');
}

function makeSeedSql(data, source) {
	const recordedAt = source.recordedAt ?? `${data.asOf}T00:00:00.000Z`;
	const latestPeriod = data.period.quarters.at(-1);
	const aggregatePopulation = data.industryAggregates.find((row) =>
		row.repdte === latestPeriod && row.segment === 'all' && row.metric === 'bank_count'
	)?.value ?? 0;
	return [
		'-- Generated by demo/fixtures/extract-demo.mjs. Do not hand-edit.',
		`-- FDIC BankFind Suite recorded data through ${data.asOf}. Monetary values are USD thousands.`,
		'-- This seeds a recorded fixture snapshot; it does not create or claim a live pipeline publication.',
		'BEGIN TRANSACTION;',
		sqlInsert('institutions', institutionColumns, data.institutions),
		sqlInsert('financials', financialColumns, data.financials),
		sqlInsert('agg_industry', industryColumns, data.industryAggregates),
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_id', ${sqlValue(data.fixtureId)}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_as_of', ${sqlValue(data.asOf)}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_mode', 'recorded', ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_recorded_at', ${sqlValue(recordedAt)}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_scope', 'selected_institutions', ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_population', ${sqlValue(`${data.institutions.length} named institutions selected for the recorded demo`)}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_institution_count', ${sqlValue(String(data.institutions.length))}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_financial_row_count', ${sqlValue(String(data.financials.length))}, ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_aggregate_scope', 'full_reporting_population_derived', ${sqlValue(recordedAt)});`,
		`INSERT OR REPLACE INTO pipeline_state (key, value, updated_at) VALUES ('demo_fixture_aggregate_population_count', ${sqlValue(String(aggregatePopulation))}, ${sqlValue(recordedAt)});`,
		'COMMIT;',
		''
	].join('\n');
}

function buildLocalFixture(sourcePath) {
	const database = new DatabaseSync(sourcePath, { readOnly: true });
	try {
		const certs = BANKS.map((bank) => bank.cert);
		const certPlaceholders = certs.map(() => '?').join(', ');
		const latestCommonDates = database.prepare(`
			SELECT repdte
			FROM financials
			WHERE cert IN (${certPlaceholders}) AND repdte <= ?
			GROUP BY repdte
			HAVING COUNT(DISTINCT cert) = ?
			ORDER BY repdte DESC
			LIMIT ?
		`).all(...certs, PINNED_REPORTING_DATE, certs.length, QUARTER_COUNT).map((row) => row.repdte).sort();

		if (latestCommonDates.length !== QUARTER_COUNT) {
			throw new Error(`Expected ${QUARTER_COUNT} common quarters, found ${latestCommonDates.length}.`);
		}
		if (latestCommonDates.at(-1) !== PINNED_REPORTING_DATE) {
			throw new Error(`The local source does not contain the pinned reporting quarter ${PINNED_REPORTING_DATE}.`);
		}

		const institutions = querySelectedRows(
			database,
			'institutions',
			institutionColumns,
			`cert IN (${certPlaceholders})`,
			certs,
			'cert ASC'
		);
		if (institutions.length !== certs.length) {
			throw new Error(`Expected ${certs.length} institutions, found ${institutions.length}.`);
		}

		const datePlaceholders = latestCommonDates.map(() => '?').join(', ');
		const financials = querySelectedRows(
			database,
			'financials',
			financialColumns,
			`cert IN (${certPlaceholders}) AND repdte IN (${datePlaceholders})`,
			[...certs, ...latestCommonDates],
			'repdte ASC, cert ASC'
		);
		const expectedFinancialRows = certs.length * latestCommonDates.length;
		if (financials.length !== expectedFinancialRows) {
			throw new Error(`Expected ${expectedFinancialRows} financial rows, found ${financials.length}.`);
		}

		const industryAggregates = querySelectedRows(
			database,
			'agg_industry',
			industryColumns,
			`repdte IN (${datePlaceholders})`,
			latestCommonDates,
			'repdte ASC, segment ASC, metric ASC'
		);

		const asOf = isoDate(latestCommonDates.at(-1));
		return {
			data: {
				schemaVersion: 1,
				fixtureId: fixturePin.fixtureId,
				asOf,
				period: {
					start: isoDate(latestCommonDates[0]),
					end: asOf,
					quarters: latestCommonDates
				},
				units: {
					monetary: 'USD thousands, as reported by FDIC BankFind Suite',
					ratios: 'percentage points unless a field definition states otherwise',
					dates: 'YYYYMMDD in database rows; ISO 8601 in fixture metadata'
				},
				institutions,
				financials,
				industryAggregates
			},
			source: {
				mode: 'local-d1',
				recordedAt: null,
				database: relative(repoRoot, sourcePath)
			}
		};
	} finally {
		database.close();
	}
}

function makeManifest(data, dataJson, seedSql, source) {
	return {
		fixtureId: data.fixtureId,
		schemaVersion: data.schemaVersion,
		fixturePin: {
			path: 'demo/fixtures/fixture-pin.json',
			sha256: sha256(fixturePinText),
			reportingQuarter: PINNED_REPORTING_DATE,
			quarterCount: QUARTER_COUNT
		},
		snapshot: {
			status: 'recorded',
			recordedAt: source.recordedAt,
			asOf: data.asOf,
			scope: `${data.institutions.length} selected institutions across ${data.period.quarters.length} quarters; not the complete FDIC universe`
		},
		asOf: data.asOf,
		period: data.period,
		populations: {
			institutions: {
				kind: 'recorded_selection',
				asOf: data.asOf,
				count: data.institutions.length,
				description: 'Named institutions selected for the recorded demonstration fixture; not a national population'
			},
			industryAggregates: {
				kind: 'full_reporting_population_derived',
				asOf: data.asOf,
				count: data.industryAggregates.find((row) => row.repdte === data.period.quarters.at(-1) && row.segment === 'all' && row.metric === 'bank_count')?.value ?? 0,
				description: 'All institutions returned by FDIC BankFind Financials for the reporting period; aggregates derived separately from the recorded institution selection'
			}
		},
		banks: fixturePin.banks,
		recordCounts: {
			institutions: data.institutions.length,
			financials: data.financials.length,
			industryAggregates: data.industryAggregates.length
		},
		datasets: [
			{
				name: 'institutions',
				status: 'recorded',
				source: 'FDIC BankFind Suite institutions dataset',
				transform: 'Direct field mapping; current totals and ratios come from the same-quarter FDIC financials record, and unavailable fields remain null. No synthetic values.'
			},
			{
				name: 'financials',
				status: 'recorded',
				source: 'FDIC BankFind Suite financials dataset',
				transform: 'Lossless projection into the application schema; no interpolation or synthetic values.'
			},
			{
				name: 'industryAggregates',
				status: 'derived',
				source: source.mode === 'official-api'
					? 'Application aggregates computed from every institution returned by the official FDIC financials endpoint for each fixture quarter'
					: 'Application aggregates copied from the full local FDIC financials history',
				transform: 'Deterministic sums, counts, and medians using the application asset-tier definitions; not an FDIC-reported table and not illustrative.'
			}
		],
		provenance: {
			publisher: 'Federal Deposit Insurance Corporation',
			product: 'BankFind Suite',
			api: 'https://api.fdic.gov/banks',
			documentation: 'https://api.fdic.gov/banks/docs',
			websitePolicies: 'https://www.fdic.gov/policies',
			extraction: source.mode === 'official-api'
				? `Exact records retrieved from the official FDIC API using stable FDIC certificate numbers and the ${QUARTER_COUNT} reporting dates ending at the checked-in ${PINNED_REPORTING_DATE} pin. Industry benchmarks were deterministically computed from every institution returned for those dates.`
				: `Exact rows selected from a populated local D1 snapshot using stable FDIC certificate numbers and the ${QUARTER_COUNT} reporting dates ending at the checked-in ${PINNED_REPORTING_DATE} pin.`,
			recordedAt: source.recordedAt,
			apiIndexes: source.mode === 'official-api' ? {
				financials: source.financialIndex,
				institutions: source.institutionIndex,
				quarters: source.quarterIndexes
			} : null,
			quarterResponseCounts: source.mode === 'official-api' ? source.quarterResponseCounts : null,
			requestUrls: source.mode === 'official-api' ? source.requestUrls : null
		},
		reuse: {
			status: 'public-government-data',
			note: 'The FDIC API describes these datasets as publicly available. Its API documentation does not state a separate open-data license. FDIC website policies apply, and third-party material may carry separate rights. The repository license does not change the status of source data.'
		},
		checksums: {
			algorithm: 'sha256',
			data: sha256(dataJson),
			seedSql: sha256(seedSql)
		},
		limitations: [
			'This compact slice is for an immediate no-secret demo, not a substitute for the full FDIC universe.',
			'Financial statement amounts are reported in thousands of dollars and income fields may be year-to-date, following the FDIC source definition.',
			'Industry aggregates are derived from the full source snapshot; they cannot be recomputed from the six-bank slice alone.',
			'The fixture does not invent a macro series. Live or backfilled originating-agency macro data must be labeled separately.'
		]
	};
}

function writeOrCheck(path, expected, check) {
	if (check) {
		const actual = existsSync(path) ? readFileSync(path, 'utf8').replaceAll('\r\n', '\n') : null;
		if (actual !== expected) throw new Error(`${relative(repoRoot, path)} is out of date. Run npm run fixture:update.`);
		return;
	}
	writeFileSync(path, expected, 'utf8');
}

const options = parseArgs(process.argv.slice(2));
if (options.check && !options.source) {
	throw new Error('Use node demo/fixtures/verify-demo.mjs to verify committed live-API outputs without changing their retrieval timestamp.');
}
const extracted = options.source
	? buildLocalFixture(findSourceDatabase(options.source))
	: await buildApiFixture();
const { data, source } = extracted;
const dataJson = canonicalJson(data);
const seedSql = makeSeedSql(data, source);
const manifestJson = canonicalJson(makeManifest(data, dataJson, seedSql, source));

writeOrCheck(join(fixtureDir, 'fdic-demo.json'), dataJson, options.check);
writeOrCheck(join(fixtureDir, 'bank-data-demo.sql'), seedSql, options.check);
writeOrCheck(join(fixtureDir, 'manifest.json'), manifestJson, options.check);

console.log(`${options.check ? 'Verified' : 'Extracted'} ${data.financials.length} bank-quarter rows through ${data.asOf}.`);
console.log(`Source: ${source.mode === 'official-api' ? 'FDIC BankFind Suite API' : source.database}`);
