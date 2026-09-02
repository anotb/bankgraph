import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureDir, '../..');
const pin = JSON.parse(readFileSync(join(fixtureDir, 'fixture-pin.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(fixtureDir, 'fdic-demo.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8'));
const seedSql = readFileSync(join(fixtureDir, 'bank-data-demo.sql'), 'utf8');

function seededDatabase() {
	const database = new DatabaseSync(':memory:');
	for (const migration of [
		'0001_initial_schema.sql',
		'0002_financials.sql',
		'0003_analytics.sql',
		'0009_change_attribution.sql',
		'0018_release_barrier.sql'
	]) {
		database.exec(readFileSync(join(repoRoot, 'migrations', migration), 'utf8'));
	}
	return database;
}

test('fixture contains a complete common time window', () => {
	assert.equal(data.institutions.length, pin.banks.length);
	assert.equal(data.period.quarters.length, pin.quarterCount);
	assert.equal(data.period.quarters.at(-1), pin.reportingQuarter);
	assert.equal(data.financials.length, pin.banks.length * pin.quarterCount);
	for (const institution of data.institutions) {
		assert.deepEqual(
			data.financials.filter((row) => row.cert === institution.cert).map((row) => row.repdte),
			data.period.quarters
		);
	}
});

test('seed SQL can be applied twice without duplicates', () => {
	const database = seededDatabase();
	try {
		database.exec(seedSql);
		database.exec(seedSql);
		assert.equal(database.prepare('SELECT COUNT(*) AS count FROM institutions').get().count, pin.banks.length);
		assert.equal(database.prepare('SELECT COUNT(*) AS count FROM financials').get().count, pin.banks.length * pin.quarterCount);
		assert.equal(
			database.prepare('SELECT COUNT(*) AS count FROM agg_industry').get().count,
			data.industryAggregates.length
		);
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_id'").get().value, data.fixtureId);
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_mode'").get().value, 'recorded');
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_recorded_at'").get().value, manifest.provenance.recordedAt);
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_scope'").get().value, 'selected_institutions');
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_institution_count'").get().value, String(pin.banks.length));
		assert.equal(database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_aggregate_scope'").get().value, 'full_reporting_population_derived');
		assert.equal(
			database.prepare("SELECT value FROM pipeline_state WHERE key = 'demo_fixture_aggregate_population_count'").get().value,
			String(manifest.populations.industryAggregates.count)
		);
		assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'dataset_%'").get().count, 0);
	} finally {
		database.close();
	}
});

test('manifest identifies the fallback as a bounded recorded snapshot', () => {
	assert.equal(manifest.snapshot.status, 'recorded');
	assert.equal(manifest.snapshot.recordedAt, manifest.provenance.recordedAt);
	assert.equal(manifest.fixturePin.reportingQuarter, pin.reportingQuarter);
	assert.equal(manifest.fixturePin.quarterCount, pin.quarterCount);
	assert.equal(manifest.snapshot.asOf, data.asOf);
	assert.match(manifest.snapshot.scope, /not the complete FDIC universe/);
	assert.equal(manifest.populations.institutions.kind, 'recorded_selection');
	assert.equal(manifest.populations.institutions.asOf, data.asOf);
	assert.equal(manifest.populations.institutions.count, pin.banks.length);
	assert.equal(manifest.populations.industryAggregates.kind, 'full_reporting_population_derived');
	assert.ok(manifest.populations.industryAggregates.count > pin.banks.length);
});

test('all source tables retain the app schema field order', () => {
	assert.deepEqual(Object.keys(data.institutions[0]), [
		'cert', 'rssd_id', 'name', 'city', 'state', 'zip', 'county', 'charter_class',
		'regulator', 'active', 'established_date', 'insured_date', 'holding_company',
		'hc_rssd_id', 'asset_tier', 'total_assets', 'total_deposits', 'num_branches',
		'num_employees', 'latest_repdte', 'latest_roa', 'latest_roe', 'latest_nim',
		'latest_npl_ratio', 'latest_tier1_ratio'
	]);
	assert.equal(Object.keys(data.financials[0]).at(-1), 'asset_bucket');
});

test('Tier 1 snapshot repair uses the latest financial RBC1RWAJ value', () => {
	const database = seededDatabase();
	try {
		database.exec(seedSql);
		database.prepare('UPDATE institutions SET latest_repdte = ?, latest_tier1_ratio = ? WHERE cert = ?')
			.run('2026-03-31', 99, 628);
		database.exec(readFileSync(join(repoRoot, 'migrations', '0013_tier1_snapshot_backfill.sql'), 'utf8'));
		const repaired = database.prepare('SELECT latest_repdte, latest_tier1_ratio FROM institutions WHERE cert = ?').get(628);
		const latest = database.prepare('SELECT repdte, rbc1rwaj FROM financials WHERE cert = ? ORDER BY repdte DESC LIMIT 1').get(628);
		assert.equal(repaired.latest_repdte, latest.repdte);
		assert.equal(repaired.latest_tier1_ratio, latest.rbc1rwaj);
	} finally {
		database.close();
	}
});

test('fixture v1 retains its recorded Q2 2026 SoFi source anchors', () => {
	const q1 = data.financials.find((row) => row.cert === 26881 && row.repdte === '20260331');
	const q2 = data.financials.find((row) => row.cert === 26881 && row.repdte === '20260630');
	assert.equal(q1.asset, 49_667_835);
	assert.equal(q2.asset, 56_821_411);
	assert.equal(q1.dep, 42_321_604);
	assert.equal(q2.dep, 46_781_713);
	assert.equal(q2.netinc - q1.netinc, 259_508);
	assert.equal(q2.nimy, 6.074341678377899);
	assert.equal(q2.lnlsdepr, 99.75319415943576);
	assert.equal(q2.nclnlsr, 0.08009166933631764);
	assert.match(manifest.provenance.apiIndexes.financials.name, /^risview_/);
});
