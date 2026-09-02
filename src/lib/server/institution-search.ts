export interface InstitutionSearchSql {
	condition: string;
	conditionParams: string[];
	orderPrefix: string;
	orderParams: string[];
}

/**
 * Build the bounded D1 search used by the directory and homepage finder.
 * Exact FDIC certificate and institution-name matches lead, followed by name,
 * city, and state matches. Active institutions win otherwise-equal matches.
 */
export function buildInstitutionSearchSql(rawQuery: string): InstitutionSearchSql {
	const query = rawQuery.trim();
	const condition = `(
		CAST(cert AS TEXT) = ?
		OR INSTR(LOWER(name), LOWER(?)) > 0
		OR INSTR(LOWER(COALESCE(city, '')), LOWER(?)) > 0
		OR LOWER(COALESCE(state, '')) = LOWER(?)
	)`;
	const conditionParams = [query, query, query, query];
	const orderPrefix = `CASE
		WHEN CAST(cert AS TEXT) = ? THEN 0
		WHEN LOWER(name) = LOWER(?) THEN 1
		WHEN LOWER(name) LIKE LOWER(?) || '%' THEN 2
		WHEN INSTR(LOWER(name), LOWER(?)) > 0 THEN 3
		WHEN LOWER(COALESCE(city, '')) = LOWER(?) THEN 4
		WHEN INSTR(LOWER(COALESCE(city, '')), LOWER(?)) > 0 THEN 5
		WHEN LOWER(COALESCE(state, '')) = LOWER(?) THEN 6
		ELSE 7
	END ASC, active DESC,`;
	const orderParams = [query, query, query, query, query, query, query];

	return { condition, conditionParams, orderPrefix, orderParams };
}
