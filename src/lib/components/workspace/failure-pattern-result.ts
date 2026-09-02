import type {
	CurrentAnalogue,
	FailurePatternPoint,
	FailurePatternSeries
} from '$lib/server/analytics/failure-patterns';

export type FailureAnalogueSortKey = 'rank' | 'distance' | 'coverage';
export type FailureAnalogueSortDirection = 'asc' | 'desc';

export interface FailureChartGeometry {
	width: number;
	height: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export function failureSeriesDomain(series: FailurePatternSeries | null): [number, number] {
	const values =
		series?.points.flatMap((point) => [point.q25, point.median, point.q75])
			.filter((value): value is number => value !== null && Number.isFinite(value)) ?? [];
	if (values.length === 0) return [0, 1];
	const low = Math.min(...values);
	const high = Math.max(...values);
	const span = Math.max(high - low, Math.abs(high) * 0.06, 0.25);
	return [low - span * 0.12, high + span * 0.12];
}

export function chartX(
	index: number,
	pointCount: number,
	geometry: FailureChartGeometry
): number {
	const plotWidth = geometry.width - geometry.left - geometry.right;
	// Leave one interval between the final reported quarter and the failure marker.
	return geometry.left + (index / Math.max(pointCount, 1)) * plotWidth;
}

export function chartY(
	value: number,
	domain: readonly [number, number],
	geometry: FailureChartGeometry
): number {
	const [low, high] = domain;
	const span = Math.max(high - low, 1e-9);
	return (
		geometry.top +
		((high - value) / span) * (geometry.height - geometry.top - geometry.bottom)
	);
}

function contiguousSegments(
	points: readonly FailurePatternPoint[],
	available: (point: FailurePatternPoint) => boolean
): Array<Array<{ point: FailurePatternPoint; index: number }>> {
	const segments: Array<Array<{ point: FailurePatternPoint; index: number }>> = [];
	let segment: Array<{ point: FailurePatternPoint; index: number }> = [];
	points.forEach((point, index) => {
		if (available(point)) {
			segment.push({ point, index });
			return;
		}
		if (segment.length) segments.push(segment);
		segment = [];
	});
	if (segment.length) segments.push(segment);
	return segments;
}

export function failureMedianPaths(
	series: FailurePatternSeries | null,
	domain: readonly [number, number],
	geometry: FailureChartGeometry
): string[] {
	if (!series) return [];
	return contiguousSegments(series.points, (point) => point.median !== null).map((segment) =>
		segment
			.map(({ point, index }, segmentIndex) => {
				const command = segmentIndex === 0 ? 'M' : 'L';
				return `${command} ${chartX(index, series.points.length, geometry)} ${chartY(point.median!, domain, geometry)}`;
			})
			.join(' ')
	);
}

export function failureBandPaths(
	series: FailurePatternSeries | null,
	domain: readonly [number, number],
	geometry: FailureChartGeometry
): string[] {
	if (!series) return [];
	return contiguousSegments(
		series.points,
		(point) => point.q25 !== null && point.q75 !== null
	).map((segment) => {
		const upper = segment.map(
			({ point, index }) =>
				`${chartX(index, series.points.length, geometry)} ${chartY(point.q75!, domain, geometry)}`
		);
		const lower = [...segment].reverse().map(
			({ point, index }) =>
				`${chartX(index, series.points.length, geometry)} ${chartY(point.q25!, domain, geometry)}`
		);
		return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
	});
}

export function sortFailureAnalogues(
	analogues: readonly CurrentAnalogue[],
	key: FailureAnalogueSortKey,
	direction: FailureAnalogueSortDirection
): CurrentAnalogue[] {
	const multiplier = direction === 'asc' ? 1 : -1;
	return [...analogues].sort((a, b) => {
		const aValue =
			key === 'rank'
				? a.rank
				: key === 'distance'
					? a.coverageAdjustedDistance
					: a.coverage.ratio;
		const bValue =
			key === 'rank'
				? b.rank
				: key === 'distance'
					? b.coverageAdjustedDistance
					: b.coverage.ratio;
		if (aValue !== bValue) return (aValue - bValue) * multiplier;
		return a.rank - b.rank || a.cert - b.cert;
	});
}

export function topFailureContributions(analogue: CurrentAnalogue, limit = 3) {
	return [...analogue.featureContributions]
		.filter((feature) => feature.squaredDistanceShare > 0)
		.sort(
			(a, b) =>
				b.squaredDistanceShare - a.squaredDistanceShare || a.label.localeCompare(b.label)
		)
		.slice(0, Math.max(0, limit));
}
