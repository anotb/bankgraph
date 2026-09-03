import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from './workspace.svelte';
import {
	WORKSPACE_STORAGE_KEY,
	loadWorkspace,
	loadWorkspaceOrThrow,
	persistWorkspace
} from './persistence';
import { applyWorkspaceCommand, createDefaultWorkspaceState, workspaceCommands } from './state';
import { WorkspaceValidationError, normalizeWorkspaceState } from './validation';
import type { StorageLike } from './types';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { values: Record<string, string> } {
	const values = { ...initial };
	return {
		values,
		getItem: (key) => values[key] ?? null,
		setItem: (key, value) => { values[key] = value; },
		removeItem: (key) => { delete values[key]; }
	};
}

describe('workspace local persistence', () => {
	it('persists and reloads validated state', () => {
		const storage = memoryStorage();
		const state = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setQuestion('Persistent question')
		).state;
		persistWorkspace(storage, state);
		expect(loadWorkspaceOrThrow(storage)).toEqual(state);
		expect(loadWorkspace(storage)).toMatchObject({ found: true, migrated: false, error: null });
	});

	it('migrates schema-1 local state without losing its analytical window', () => {
		const current = applyWorkspaceCommand(
			createDefaultWorkspaceState(),
			workspaceCommands.setPeriod({ kind: 'range', from: '20240331', to: '20260630' })
		).state;
		const {
			asOfQuarter: _asOfQuarter,
			comparison: _comparison,
			chartHistory: _chartHistory,
			...legacy
		} = current;
		const storage = memoryStorage({
			[WORKSPACE_STORAGE_KEY]: JSON.stringify({
				version: 1,
				state: { ...legacy, version: 1 }
			})
		});

		expect(loadWorkspace(storage)).toMatchObject({
			found: true,
			migrated: true,
			error: null,
			state: {
				version: 4,
				asOfQuarter: '20260630',
				comparison: { mode: 'range-start', resolvedQuarter: '20240331' },
				chartHistory: { from: '20240331', to: '20260630' }
			}
		});
	});

	it('keeps full private finding notes in durable local persistence', () => {
		const storage = memoryStorage();
		const note = 'private '.repeat(500);
		const state = applyWorkspaceCommand(createDefaultWorkspaceState(), workspaceCommands.setFindings([{
			id: 'private-note',
			title: 'Local research',
			note,
			certs: [],
			metrics: [],
			period: null,
			source: null
		}])).state;
		persistWorkspace(storage, state);
		expect(loadWorkspaceOrThrow(storage).findings[0].note).toBe(note);
	});

	it('returns defaults plus a clear error for corrupted untrusted storage', () => {
		const storage = memoryStorage({ [WORKSPACE_STORAGE_KEY]: '{not-json' });
		const loaded = loadWorkspace(storage);
		expect(loaded.state).toEqual(createDefaultWorkspaceState());
		expect(loaded.error).toBeInstanceOf(WorkspaceValidationError);
		expect(() => loadWorkspaceOrThrow(storage)).toThrowError(/valid JSON/);
	});

	it('reactive wrapper delegates commands, verifies idempotency, and persists only changes', () => {
		const storage = memoryStorage();
		const setItem = vi.spyOn(storage, 'setItem');
		const store = createWorkspaceStore({ storage });
		const first = store.setQuestion('What changed?', { ifRevision: 0 });
		const repeat = store.setQuestion('What changed?', { ifRevision: 1 });
		expect(first.changed).toBe(true);
		expect(repeat.changed).toBe(false);
		expect(store.state.question).toBe('What changed?');
		expect(store.revision).toBe(1);
		expect(setItem).toHaveBeenCalledTimes(1);
		const depth = store.setDepth('pro', { ifRevision: 1 });
		expect(depth).toMatchObject({ changed: true, revision: 2 });
		expect(store.state.depth).toBe('pro');
		const ordering = store.setScreenView({ sort: 'name', order: 'asc' }, { ifRevision: 2 });
		expect(ordering).toMatchObject({ changed: true, revision: 3 });
		expect(store.state.screenView).toEqual({ sort: 'name', order: 'asc' });
		expect(loadWorkspaceOrThrow(storage).screenView).toEqual({ sort: 'name', order: 'asc' });
		const asOf = store.setAsOfQuarter('20260630', { ifRevision: 3 });
		expect(asOf).toMatchObject({ changed: true, revision: 4 });
		const history = store.setChartHistory(
			{ from: '20200331', to: '20260630' },
			{ ifRevision: 4 }
		);
		expect(history).toMatchObject({ changed: true, revision: 5 });
		const comparison = store.setComparison(
			{ mode: 'year-ago', rangeStartQuarter: null, customQuarter: null },
			{ ifRevision: 5 }
		);
		expect(comparison).toMatchObject({
			changed: true,
			revision: 6,
			state: { comparison: { resolvedQuarter: '20250630' } }
		});
	});

	it('atomically deselects and excludes a selected bank', () => {
		const storage = memoryStorage();
		const initialState = normalizeWorkspaceState({
			...createDefaultWorkspaceState(),
			revision: 7,
			activeBank: 100,
			selectedCerts: [100, 200],
			charts: [{
				id: 'linked-analysis',
				title: 'Linked bank analysis',
				kind: 'line',
				metrics: ['asset'],
				certs: [100, 200],
				scale: 'value',
				stacked: false,
				visible: true
			}],
			mapSelection: { states: ['MA'], certs: [100, 200] }
		});
		const store = createWorkspaceStore({ initialState, storage });

		const result = store.excludeBank(100, { ifRevision: 7 });

		expect(result).toMatchObject({ changed: true, revision: 8 });
		expect(store.state).toMatchObject({
			activeBank: 200,
			selectedCerts: [200],
			excludedCerts: [100],
			mapSelection: { states: ['MA'], certs: [200] }
		});
		expect(store.state.charts[0].certs).toEqual([200]);
		expect(loadWorkspaceOrThrow(storage)).toEqual(store.state);
		expect(store.excludeBank(100, { ifRevision: 8 })).toMatchObject({
			changed: false,
			revision: 8
		});
	});

	it('does not publish a state transition when persistence fails', () => {
		const storage: StorageLike = {
			getItem: () => null,
			setItem: () => { throw new Error('quota exceeded'); }
		};
		const store = createWorkspaceStore({ storage });
		expect(() => store.setQuestion('Unsaved')).toThrowError(/quota exceeded/);
		expect(store.state.question).toBe('');
	});
});
