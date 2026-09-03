import type { Institution } from '$lib/types';

/**
 * Keep a focused comparison readable: the subject first, followed by the banks
 * whose balance-sheet scale is closest on a multiplicative basis.
 */
export function nearestSizePeerCerts(
	subject: Pick<Institution, 'cert' | 'total_assets'>,
	candidates: readonly Pick<Institution, 'cert' | 'total_assets'>[],
	limit = 8
): number[] {
	const subjectAssets = subject.total_assets;
	const count = Math.max(1, Math.floor(limit));
	if (!subjectAssets || subjectAssets <= 0) return [subject.cert];

	const unique = new Map<number, Pick<Institution, 'cert' | 'total_assets'>>();
	for (const candidate of candidates) {
		if (candidate.cert !== subject.cert && candidate.total_assets && candidate.total_assets > 0) {
			unique.set(candidate.cert, candidate);
		}
	}

	const peers = [...unique.values()].sort((left, right) => {
		const leftDistance = Math.abs(Math.log(left.total_assets! / subjectAssets));
		const rightDistance = Math.abs(Math.log(right.total_assets! / subjectAssets));
		return leftDistance - rightDistance
			|| right.total_assets! - left.total_assets!
			|| left.cert - right.cert;
	});

	return [subject.cert, ...peers.slice(0, count - 1).map((peer) => peer.cert)];
}
