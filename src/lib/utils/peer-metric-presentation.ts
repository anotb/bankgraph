import { canonicalResearchMetric, researchMetricDefinition } from '$lib/research-metrics';

export type PeerMetricDirection = 'higher' | 'lower' | 'neutral';

export function peerMetricDirection(metric: string): PeerMetricDirection {
	const canonical = canonicalResearchMetric(metric);
	return canonical ? researchMetricDefinition(canonical).direction : 'neutral';
}

export function percentileBadgeClass(metric: string, percentile: number): string {
	const direction = peerMetricDirection(metric);
	if (direction === 'neutral') return 'bg-[--accent-muted] text-[--accent-text]';
	if (direction === 'lower') {
		if (percentile <= 40) return 'bg-[--positive-muted] text-[--positive]';
		if (percentile >= 75) return 'bg-[--negative-muted] text-[--negative]';
		return 'bg-[--warning-muted] text-[--warning]';
	}
	if (percentile >= 60) return 'bg-[--positive-muted] text-[--positive]';
	if (percentile <= 25) return 'bg-[--negative-muted] text-[--negative]';
	return 'bg-[--warning-muted] text-[--warning]';
}
