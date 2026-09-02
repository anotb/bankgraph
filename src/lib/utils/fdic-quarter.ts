const QUARTER_BY_ENDING: Record<string, number> = {
	'0331': 0,
	'0630': 1,
	'0930': 2,
	'1231': 3
};

/** Return a monotonic index for an exact FDIC calendar-quarter end. */
export function fdicQuarterIndex(repdte: unknown): number | null {
	if (typeof repdte !== 'string') return null;
	const match = /^(\d{4})(0331|0630|0930|1231)$/.exec(repdte);
	if (!match) return null;
	return Number(match[1]) * 4 + QUARTER_BY_ENDING[match[2]];
}

/** Return the number of calendar quarters from `fromRepdte` to `toRepdte`. */
export function fdicQuarterDistance(fromRepdte: unknown, toRepdte: unknown): number | null {
	const from = fdicQuarterIndex(fromRepdte);
	const to = fdicQuarterIndex(toRepdte);
	return from === null || to === null ? null : to - from;
}
