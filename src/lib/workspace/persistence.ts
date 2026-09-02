import { WORKSPACE_SCHEMA_VERSION, type StorageLike, type WorkspaceState } from './types';
import { migrateWorkspaceState, parseWorkspaceJson } from './codec';
import { createDefaultWorkspaceState } from './state';
import { normalizeWorkspaceState } from './validation';

// Keep the original key so schema-1 browser state can be migrated in place.
export const WORKSPACE_STORAGE_KEY = 'bankgraph-workspace-v1';

export interface WorkspaceLoadResult {
	state: WorkspaceState;
	found: boolean;
	migrated: boolean;
	error: Error | null;
}

export function persistWorkspace(
	storage: StorageLike,
	state: WorkspaceState,
	key = WORKSPACE_STORAGE_KEY
): void {
	const normalized = normalizeWorkspaceState(state);
	storage.setItem(key, JSON.stringify({ version: WORKSPACE_SCHEMA_VERSION, state: normalized }));
}

export function loadWorkspace(
	storage: StorageLike,
	key = WORKSPACE_STORAGE_KEY
): WorkspaceLoadResult {
	const stored = storage.getItem(key);
	if (stored === null) {
		return { state: createDefaultWorkspaceState(), found: false, migrated: false, error: null };
	}
	try {
		const parsed = parseWorkspaceJson(stored);
		return { state: parsed.state, found: true, migrated: parsed.migrated, error: null };
	} catch (error) {
		return {
			state: createDefaultWorkspaceState(),
			found: true,
			migrated: false,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

export function loadWorkspaceOrThrow(
	storage: StorageLike,
	key = WORKSPACE_STORAGE_KEY
): WorkspaceState {
	const stored = storage.getItem(key);
	if (stored === null) return createDefaultWorkspaceState();
	return parseWorkspaceJson(stored).state;
}

export function removePersistedWorkspace(storage: StorageLike, key = WORKSPACE_STORAGE_KEY): void {
	storage.removeItem?.(key);
}

export function serializePersistedWorkspace(state: WorkspaceState): string {
	return JSON.stringify({ version: WORKSPACE_SCHEMA_VERSION, state: normalizeWorkspaceState(state) });
}

export function deserializePersistedWorkspace(value: unknown): WorkspaceState {
	if (typeof value === 'string') return parseWorkspaceJson(value).state;
	if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'state' in value) {
		const envelope = value as { version?: unknown; state: unknown };
		if (
			envelope.version !== undefined
			&& envelope.version !== 1
			&& envelope.version !== WORKSPACE_SCHEMA_VERSION
		) {
			return parseWorkspaceJson(JSON.stringify(envelope)).state;
		}
		return migrateWorkspaceState(envelope.state).state;
	}
	return migrateWorkspaceState(value).state;
}
