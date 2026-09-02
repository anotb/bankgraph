import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const pinText = readFileSync(join(fixtureDir, 'fixture-pin.json'), 'utf8').replaceAll('\r\n', '\n');
const manifestText = readFileSync(join(fixtureDir, 'manifest.json'), 'utf8').replaceAll('\r\n', '\n');
const dataText = readFileSync(join(fixtureDir, 'fdic-demo.json'), 'utf8').replaceAll('\r\n', '\n');
const seedSql = readFileSync(join(fixtureDir, 'bank-data-demo.sql'), 'utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(manifestText);
const pin = JSON.parse(pinText);
const data = JSON.parse(dataText);

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

invariant(manifest.checksums.data === sha256(dataText), 'fdic-demo.json checksum does not match manifest.json.');
invariant(manifest.checksums.seedSql === sha256(seedSql), 'bank-data-demo.sql checksum does not match manifest.json.');
invariant(manifest.fixturePin?.sha256 === sha256(pinText), 'fixture-pin.json checksum does not match manifest.json.');
invariant(data.fixtureId === manifest.fixtureId, 'Fixture IDs do not match.');
invariant(data.fixtureId === pin.fixtureId, 'Fixture ID does not match fixture-pin.json.');
invariant(data.asOf === manifest.asOf, 'As-of dates do not match.');
invariant(data.period.quarters.at(-1) === pin.reportingQuarter, 'Committed demo fixture does not end at the pinned FDIC quarter.');
invariant(data.institutions.length === pin.banks.length, 'Institution count does not match fixture-pin.json.');
invariant(data.period.quarters.length === pin.quarterCount, 'Quarter count does not match fixture-pin.json.');
invariant(data.financials.length === data.institutions.length * data.period.quarters.length, 'Every bank must have every fixture quarter.');

const expectedCerts = new Set(manifest.banks.map((bank) => bank.cert));
const actualCerts = new Set(data.institutions.map((bank) => bank.cert));
invariant(expectedCerts.size === actualCerts.size && [...expectedCerts].every((cert) => actualCerts.has(cert)), 'Institution certificates do not match the manifest.');

for (const cert of expectedCerts) {
	const dates = data.financials.filter((row) => row.cert === cert).map((row) => row.repdte);
	invariant(dates.length === data.period.quarters.length, `CERT ${cert} does not have every quarter.`);
	invariant(dates.every((date, index) => date === data.period.quarters[index]), `CERT ${cert} has missing or out-of-order quarters.`);
}

invariant(manifest.datasets.every((dataset) => dataset.status === 'recorded' || dataset.status === 'derived'), 'Every dataset must be labeled recorded or derived.');
invariant(!manifest.datasets.some((dataset) => dataset.status === 'illustrative'), 'The fixture must not claim illustrative rows.');
invariant(seedSql.includes('INSERT OR REPLACE'), 'Seed SQL must use idempotent upserts.');
invariant(!/dataset_(?:runs|stage_runs|reconciliation_checks|publications)/.test(seedSql), 'Fixture seed must not create publication-engine state.');
invariant(seedSql.includes("'demo_fixture_mode', 'recorded'"), 'Recorded fixture mode marker is missing.');
invariant(seedSql.includes("'demo_fixture_scope', 'selected_institutions'"), 'Recorded institution scope marker is missing.');
invariant(seedSql.includes("'demo_fixture_aggregate_scope', 'full_reporting_population_derived'"), 'Full-population aggregate scope marker is missing.');
invariant(manifest.populations?.institutions?.count === pin.banks.length, 'Recorded institution population count is missing.');
const latestBankCount = data.industryAggregates.find((row) =>
	row.repdte === pin.reportingQuarter && row.segment === 'all' && row.metric === 'bank_count'
)?.value;
invariant(Number.isSafeInteger(latestBankCount) && latestBankCount > 0, 'Latest full-population aggregate count is missing.');
invariant(manifest.populations?.industryAggregates?.count === latestBankCount, 'Manifest aggregate population does not match the derived fixture row.');
invariant(manifest.snapshot?.status === 'recorded', 'Manifest must identify this as a recorded snapshot.');
invariant(manifest.snapshot?.recordedAt === manifest.provenance.recordedAt, 'Snapshot retrieval time and provenance do not match.');
invariant(Boolean(manifest.provenance.recordedAt), 'Official API retrieval time is missing.');
invariant(Boolean(manifest.provenance.apiIndexes?.financials?.name), 'FDIC financial index provenance is missing.');
invariant(manifest.provenance.quarterResponseCounts?.[pin.reportingQuarter] === latestBankCount, 'Pinned-quarter response count does not match the derived aggregate population.');
invariant(!/API[_-]?KEY|PIPELINE_SECRET|Bearer\s+[A-Za-z0-9._-]+/i.test(dataText + seedSql), 'Fixture appears to contain a secret.');

console.log(`Verified ${data.institutions.length} banks across ${data.period.quarters.length} quarters (${data.period.start} to ${data.period.end}).`);
console.log(`Recorded rows: ${data.financials.length}; derived industry rows: ${data.industryAggregates.length}.`);
console.log(`Snapshot status: ${manifest.snapshot.status}; recorded at ${manifest.snapshot.recordedAt}.`);
