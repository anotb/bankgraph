import { queryAll, queryOne } from '$lib/server/db';
import { previousQuarterDate } from './change-attribution';
import {
	deriveSystemBrief,
	type MacroOverlay,
	type SystemBrief,
	type SystemFinancialRow
} from './system-signals';

const MACRO_CONTEXT_SERIES = [
	'FRB_FEDFUNDS', 'FRB_H8_BANK_CREDIT', 'FRB_H8_DEPOSITS',
	'UST10Y', 'UST10Y2Y', 'BLS_UNRATE', 'BLS_CPI_YOY'
];

interface LatestPeriodRow {
	repdte: string | null;
}

interface MacroRow {
	series_id: string;
	title: string | null;
	frequency: string | null;
	units: string | null;
	observation_date: string;
	value: number;
}

async function loadLatestPeriod(db: D1Database): Promise<string | null> {
	const row = await queryOne<LatestPeriodRow>(db, 'SELECT MAX(repdte) AS repdte FROM published_financials');
	return row?.repdte ?? null;
}

async function loadRows(db: D1Database, currentRepdte: string | null): Promise<SystemFinancialRow[]> {
	if (!currentRepdte) return [];
	const prior = previousQuarterDate(currentRepdte);
	const beforePrior = prior ? previousQuarterDate(prior) : null;
	const periods = [currentRepdte, prior, beforePrior].filter((period): period is string => Boolean(period));
	const placeholders = periods.map(() => '?').join(', ');
	return queryAll<SystemFinancialRow>(
		db,
		`SELECT f.cert, f.repdte, i.name, i.state, f.asset_bucket,
		        f.asset, f.dep, f.lnlsnet, f.netinc, f.netincq,
		        f.nimy, f.nclnlsr, f.rbcrwaj
		 FROM published_financials f
		 LEFT JOIN published_institutions i ON i.cert = f.cert
		 WHERE f.repdte IN (${placeholders})`,
		periods
	);
}

async function loadMacroOverlays(db: D1Database): Promise<MacroOverlay[] | null> {
	const placeholders = MACRO_CONTEXT_SERIES.map(() => '?').join(', ');
	const rows = await queryAll<MacroRow>(
		db,
		`SELECT s.series_id, s.title, s.cadence AS frequency, s.units,
		        m.date AS observation_date, m.value
		 FROM macro_series s
		 JOIN macro_observations m ON m.series_id = s.series_id
		 WHERE s.series_id IN (${placeholders})
		   AND m.date = (
		     SELECT MAX(m2.date) FROM macro_observations m2 WHERE m2.series_id = s.series_id
		   )
		 ORDER BY s.series_id`,
		MACRO_CONTEXT_SERIES
	).catch(() => null);
	if (!rows) return null;
	return rows
		.filter((row) => typeof row.value === 'number' && Number.isFinite(row.value))
		.map((row) => ({
			seriesId: row.series_id,
			title: row.title,
			frequency: row.frequency,
			units: row.units,
			observationDate: row.observation_date,
			value: row.value
		}));
}

/** Load the current auditable system brief from the latest ordinary financial rows. */
export async function loadSystemBrief(db: D1Database, now = new Date()): Promise<SystemBrief> {
	const currentRepdte = await loadLatestPeriod(db);
	const [rows, macroOverlays] = await Promise.all([
		loadRows(db, currentRepdte),
		loadMacroOverlays(db)
	]);
	return deriveSystemBrief({ currentRepdte, rows, macroOverlays, now });
}
