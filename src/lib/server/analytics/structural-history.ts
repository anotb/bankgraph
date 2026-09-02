import { queryAll } from '$lib/server/db';

export type StructuralEventCategory = 'merger' | 'acquisition' | 'closure' | 'charter';

interface HistoryRow {
  id: string;
  event_date: string | null;
  change_code: number | null;
  change_desc: string | null;
  org_role: string | null;
  inst_name: string | null;
  source_retrieved_at: string | null;
}

export interface StructuralEvent {
  id: string;
  date: string;
  category: StructuralEventCategory;
  description: string;
  institutionName: string | null;
  organizationRole: string | null;
  changeCode: number | null;
}

export interface StructuralContext {
  status: 'events_present' | 'no_mapped_events' | 'unavailable';
  window: { from: string; to: string };
  events: StructuralEvent[];
  caution: string | null;
  source: 'FDIC BankFind History';
  sourceUrl: 'https://api.fdic.gov/banks/docs/';
  retrievedAt: string | null;
  coverage: {
    processYearFrom: number | null;
    processYearTo: number | null;
    publishedPartitions: number;
    mapping: 'certificate_rows_only';
  };
}

interface HistoryCoverageRow {
  year_from: number | null;
  year_to: number | null;
  partitions: number;
}

export function normalizeHistoryDate(value: string | null): string | null {
  if (!value) return null;
  const compact = value.trim();
  if (/^\d{8}$/.test(compact)) return compact;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(compact);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(compact);
  return us ? `${us[3]}${us[1]}${us[2]}` : null;
}

export function classifyStructuralEvent(
  description: string | null,
  organizationRole: string | null = null
): StructuralEventCategory | null {
  const text = description?.toUpperCase() ?? '';
  const role = organizationRole?.trim().toUpperCase() ?? '';
  if (role === 'BR' || role === 'BRANCH' || (/\bBRANCH\b/.test(text) && /\bCLOS/.test(text))) {
    return null;
  }
  if (/ACQUI|PURCHASE.*ASSUM|ASSUMPTION/.test(text)) return 'acquisition';
  if (/MERG|CONSOLIDAT/.test(text)) return 'merger';
  if (/CLOS|FAIL|TERMINAT|OUT OF BUSINESS/.test(text)) return 'closure';
  if (/CHARTER|CONVERT|BANK CLASS/.test(text)) return 'charter';
  return null;
}

export function structuralEventsForWindow(
  rows: HistoryRow[],
  from: string,
  to: string
): StructuralEvent[] {
  return rows.flatMap((row) => {
    const date = normalizeHistoryDate(row.event_date);
    const category = classifyStructuralEvent(row.change_desc, row.org_role);
    if (!date || !category || date <= from || date > to) return [];
    return [{
      id: row.id,
      date,
      category,
      description: row.change_desc?.trim() || 'FDIC structural history event',
      institutionName: row.inst_name,
      organizationRole: row.org_role,
      changeCode: row.change_code
    }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function loadStructuralContext(
  db: D1Database,
  cert: number,
  from: string,
  to: string
): Promise<StructuralContext> {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const [rows, coverage] = await Promise.all([
    queryAll<HistoryRow>(db,
    `SELECT h.id, h.event_date, h.change_code, h.change_desc, h.org_role,
            h.inst_name, h.source_retrieved_at
       FROM history_events h
       JOIN fdic_dataset_publications publication
         ON publication.dataset = 'history'
        AND publication.partition_key = CAST(h.proc_year AS TEXT)
        AND publication.run_id = h.source_run_id
      WHERE h.cert = ? AND h.eff_year BETWEEN ? AND ?
        AND UPPER(COALESCE(h.org_role, '')) NOT IN ('BR', 'BRANCH')
      ORDER BY h.event_date ASC, h.id ASC
      LIMIT 100`,
    [cert, fromYear, toYear]),
    queryAll<HistoryCoverageRow>(db,
      `SELECT MIN(CAST(partition_key AS INTEGER)) AS year_from,
              MAX(CAST(partition_key AS INTEGER)) AS year_to,
              COUNT(*) AS partitions
         FROM fdic_dataset_publications
        WHERE dataset = 'history'`)
  ]);
  const published = coverage[0] ?? { year_from: null, year_to: null, partitions: 0 };
  const events = structuralEventsForWindow(rows, from, to);
  return {
    status: events.length ? 'events_present' : published.partitions > 0 ? 'no_mapped_events' : 'unavailable',
    window: { from, to },
    events,
    caution: events.length
      ? 'A mapped structural event falls inside this comparison window. Read the reported change across a changing institution perimeter.'
      : published.partitions > 0
        ? 'No structural event mapped to this FDIC certificate falls inside the comparison window. Some FDIC history rows identify institutions only by other entity identifiers.'
        : 'Published FDIC history partitions are unavailable, so this comparison has not been checked for structural events.',
    source: 'FDIC BankFind History',
    sourceUrl: 'https://api.fdic.gov/banks/docs/',
    retrievedAt: rows.reduce<string | null>((latest, row) =>
      row.source_retrieved_at && (!latest || row.source_retrieved_at > latest)
        ? row.source_retrieved_at
        : latest, null),
    coverage: {
      processYearFrom: published.year_from,
      processYearTo: published.year_to,
      publishedPartitions: published.partitions,
      mapping: 'certificate_rows_only'
    }
  };
}
