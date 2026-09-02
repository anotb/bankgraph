import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function createDatabase(): DatabaseSync {
	const db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
		CREATE TABLE release_control (
			singleton INTEGER PRIMARY KEY, state TEXT NOT NULL, release TEXT, generation TEXT,
			pending_release TEXT, pending_generation TEXT, pending_run_id TEXT, updated_at TEXT
		);
		INSERT INTO release_control VALUES
			(1, 'ready', '20240331', 'generation-1', NULL, NULL, NULL, '2024-05-01');
		CREATE TABLE institutions (
			cert INTEGER PRIMARY KEY, rssd_id INTEGER, name TEXT NOT NULL, city TEXT, state TEXT,
			zip TEXT, county TEXT, charter_class TEXT, regulator TEXT, active INTEGER,
			established_date TEXT, insured_date TEXT, holding_company TEXT, hc_rssd_id INTEGER,
			asset_tier INTEGER, total_assets INTEGER, total_deposits INTEGER, num_branches INTEGER,
			num_employees INTEGER, latest_repdte TEXT, latest_roa REAL, latest_roe REAL,
			latest_nim REAL, latest_npl_ratio REAL, latest_tier1_ratio REAL,
			source_run_id TEXT, source_retrieved_at TEXT, source_snapshot TEXT
		);
		CREATE TABLE financials (
			cert INTEGER NOT NULL, repdte TEXT NOT NULL, asset INTEGER, dep INTEGER,
			numemp INTEGER, roa REAL, roe REAL, nimy REAL, nclnlsr REAL, rbc1rwaj REAL,
			PRIMARY KEY (cert, repdte)
		);
		CREATE TABLE peer_stats (repdte TEXT);
		CREATE TABLE agg_industry (repdte TEXT);
		CREATE TABLE bank_trends (repdte TEXT);
		CREATE TABLE anomalies (repdte TEXT);
		CREATE TABLE risk_scores (repdte TEXT);
	`);
	db.exec(readFileSync('migrations/0023_published_release_views.sql', 'utf8'));
	return db;
}

describe('published release views', () => {
	it('keeps a newer candidate invisible until the release pointer switches', () => {
		const db = createDatabase();
		db.exec(`
			INSERT INTO institutions (cert, name, active, total_assets, latest_repdte, latest_roa)
			VALUES (1, 'Example Bank', 1, 999999, '20240630', 9.9);
			INSERT INTO financials (cert, repdte, asset, dep, numemp, roa, roe, nimy, nclnlsr, rbc1rwaj)
			VALUES
				(1, '20240331', 100000, 80000, 100, 1.1, 10.0, 3.2, 0.5, 12.0),
				(1, '20240630', 120000, 90000, 110, 1.3, 11.0, 3.4, 0.4, 12.5);
			INSERT INTO agg_industry VALUES ('20240331'), ('20240630');
		`);

		expect(db.prepare('SELECT repdte FROM published_financials ORDER BY repdte').all())
			.toEqual([{ repdte: '20240331' }]);
		expect(db.prepare('SELECT repdte FROM published_agg_industry ORDER BY repdte').all())
			.toEqual([{ repdte: '20240331' }]);
		expect(db.prepare(
			'SELECT total_assets, latest_repdte, latest_roa FROM published_institutions'
		).get()).toEqual({ total_assets: 100000, latest_repdte: '20240331', latest_roa: 1.1 });

		db.exec("UPDATE release_control SET release = '20240630', generation = 'generation-2'");
		expect(db.prepare('SELECT repdte FROM published_financials ORDER BY repdte').all())
			.toEqual([{ repdte: '20240331' }, { repdte: '20240630' }]);
		expect(db.prepare(
			'SELECT total_assets, latest_repdte, latest_roa FROM published_institutions'
		).get()).toEqual({ total_assets: 120000, latest_repdte: '20240630', latest_roa: 1.3 });
	});
});
