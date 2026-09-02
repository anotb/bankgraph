export type EvidenceTrendNavigationKey =
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'Home'
	| 'End';

/** Resolve keyboard movement without scanning the point collection. */
export function nextEvidenceTrendIndex(
	current: number,
	length: number,
	key: string
): number | null {
	if (length <= 0) return null;
	const bounded = Math.max(0, Math.min(current, length - 1));
	if (key === 'ArrowLeft') return Math.max(0, bounded - 1);
	if (key === 'ArrowRight') return Math.min(length - 1, bounded + 1);
	if (key === 'Home') return 0;
	if (key === 'End') return length - 1;
	return null;
}

export function evidenceTrendTooltipPlacement(
	x: number,
	y: number,
	width: number,
	height: number
): { horizontal: 'start' | 'center' | 'end'; vertical: 'above' | 'below' } {
	return {
		horizontal: x < width * 0.28 ? 'start' : x > width * 0.72 ? 'end' : 'center',
		vertical: y < height * 0.48 ? 'below' : 'above'
	};
}
