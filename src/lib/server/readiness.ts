export const REQUIRED_BINDINGS = [
	'DB',
	'CACHE',
	'EXPORTS',
	'ASSETS',
	'PIPELINE_SECRET'
] as const;

export type BindingStatus = Record<(typeof REQUIRED_BINDINGS)[number], boolean>;

export function bindingStatus(env: Partial<Cloudflare.Env> | undefined): BindingStatus {
	return Object.fromEntries(REQUIRED_BINDINGS.map((name) => [name, Boolean(env?.[name])])) as BindingStatus;
}

export function allBindingsReady(status: BindingStatus): boolean {
	return Object.values(status).every(Boolean);
}

export type LiveDataDegradedReason =
	| 'migration_incomplete'
	| 'pipeline_refresh_in_progress'
	| 'release_unpublished_or_incomplete'
	| 'publication_state_unavailable'
	| 'cache_generation_mismatch'
	| null;

export function liveDataDegradedReason(checks: {
	migrationsReady: boolean;
	datasetsReady: boolean;
	publicationState: 'unpublished' | 'ready' | 'refreshing' | null;
	cacheReady: boolean;
}): LiveDataDegradedReason {
	if (!checks.migrationsReady) return 'migration_incomplete';
	if (checks.publicationState === 'refreshing') return 'pipeline_refresh_in_progress';
	if (!checks.datasetsReady) return 'release_unpublished_or_incomplete';
	if (checks.publicationState === null) return 'publication_state_unavailable';
	if (checks.publicationState !== 'ready') return 'release_unpublished_or_incomplete';
	if (!checks.cacheReady) return 'cache_generation_mismatch';
	return null;
}
