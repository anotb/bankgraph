export type MapDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export interface MapStatePoint {
	state: string;
	x: number;
	y: number;
}

const VECTORS: Record<MapDirection, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1]
};

/**
 * Finds the closest state in the requested visual direction. A directional
 * penalty keeps horizontal movement in the same band and vertical movement
 * in the same column without requiring a brittle hand-maintained neighbor map.
 */
export function nextMapState(
	states: readonly MapStatePoint[],
	current: string,
	direction: MapDirection
): string {
	const origin = states.find((item) => item.state === current);
	if (!origin) return current;
	const [vectorX, vectorY] = VECTORS[direction];
	let best: { state: string; score: number } | null = null;

	for (const candidate of states) {
		if (candidate.state === current) continue;
		const deltaX = candidate.x - origin.x;
		const deltaY = candidate.y - origin.y;
		const forward = deltaX * vectorX + deltaY * vectorY;
		if (forward <= 1) continue;
		const lateral = Math.abs(deltaX * vectorY - deltaY * vectorX);
		const score = Math.hypot(forward, lateral) + lateral * 0.85;
		if (!best || score < best.score) best = { state: candidate.state, score };
	}

	return best?.state ?? current;
}
