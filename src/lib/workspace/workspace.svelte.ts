import type {
	BankScreenFilters,
	ChartSpec,
	CohortTrendResultSet,
	WorkspaceAnalysisResult,
	MapSelection,
	PeerRecipe,
	PinnedFinding,
	ResearchBoardBlock,
	ResultsMetadata,
	SelectedPeriod,
	StorageLike,
	WatchlistDesiredEntry,
	WorkspaceChartHistory,
	WorkspaceComparisonSelection,
	WorkspaceCommand,
	WorkspaceCommandOptions,
	WorkspaceCommandResult,
	WorkspaceDepth,
	WorkspacePanel,
	WorkspaceScreenView,
	WorkspaceState
} from './types';
import { loadWorkspace, persistWorkspace, WORKSPACE_STORAGE_KEY } from './persistence';
import {
	applyWorkspaceCommand,
	applyWorkspaceCommands,
	createDefaultWorkspaceState,
	workspaceBankExclusionCommands,
	workspaceCommands
} from './state';
import { normalizeWorkspaceState } from './validation';

export interface WorkspaceStoreOptions {
	initialState?: WorkspaceState;
	storage?: StorageLike | null;
	storageKey?: string;
	persist?: boolean;
	onPersistenceError?: (error: Error) => void;
}

function browserStorage(): StorageLike | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * Thin Svelte 5 adapter over the pure command reducer. Human UI and tool callers
 * can use the same `execute` method and receive the same verification result.
 */
export function createWorkspaceStore(options: WorkspaceStoreOptions = {}) {
	const storage = options.storage === undefined ? browserStorage() : options.storage;
	const storageKey = options.storageKey ?? WORKSPACE_STORAGE_KEY;
	const shouldPersist = options.persist ?? storage !== null;
	let initial = options.initialState
		? normalizeWorkspaceState(options.initialState)
		: createDefaultWorkspaceState();

	if (!options.initialState && storage) {
		const loaded = loadWorkspace(storage, storageKey);
		initial = loaded.state;
		if (loaded.error) options.onPersistenceError?.(loaded.error);
	}

	let current = $state<WorkspaceState>(initial);

	function execute(
		command: WorkspaceCommand,
		commandOptions: WorkspaceCommandOptions = {}
	): WorkspaceCommandResult {
		const result = applyWorkspaceCommand(current, command, commandOptions);
		if (!result.changed) return result;
		if (shouldPersist && storage) {
			try {
				persistWorkspace(storage, result.state, storageKey);
			} catch (error) {
				const persistenceError = error instanceof Error ? error : new Error(String(error));
				if (options.onPersistenceError) options.onPersistenceError(persistenceError);
				else throw persistenceError;
			}
		}
		current = result.state;
		return result;
	}

	function executeBatch(
		commands: readonly WorkspaceCommand[],
		commandOptions: WorkspaceCommandOptions = {}
	): WorkspaceCommandResult {
		const result = applyWorkspaceCommands(current, commands, commandOptions);
		if (!result.changed) return result;
		if (shouldPersist && storage) {
			try {
				persistWorkspace(storage, result.state, storageKey);
			} catch (error) {
				const persistenceError = error instanceof Error ? error : new Error(String(error));
				if (options.onPersistenceError) options.onPersistenceError(persistenceError);
				else throw persistenceError;
			}
		}
		current = result.state;
		return result;
	}

	return {
		get state(): WorkspaceState {
			return current;
		},
		get revision(): number {
			return current.revision;
		},
		execute,
		executeBatch,
		setQuestion: (question: string, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setQuestion(question), commandOptions),
		setFilters: (filters: BankScreenFilters, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setFilters(filters), commandOptions),
		setScreenView: (screenView: WorkspaceScreenView, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setScreenView(screenView), commandOptions),
		setResults: (results: ResultsMetadata, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setResults(results), commandOptions),
		setActiveBank: (cert: number | null, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setActiveBank(cert), commandOptions),
		setSelectedCerts: (certs: number[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setSelectedCerts(certs), commandOptions),
		setExcludedCerts: (certs: number[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setExcludedCerts(certs), commandOptions),
		excludeBank: (cert: number, commandOptions?: WorkspaceCommandOptions) =>
			executeBatch(workspaceBankExclusionCommands(current, cert), commandOptions),
		setPeerRecipe: (recipe: PeerRecipe, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setPeerRecipe(recipe), commandOptions),
		setAsOfQuarter: (quarter: string | null, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setAsOfQuarter(quarter), commandOptions),
		setComparison: (
			comparison: Omit<WorkspaceComparisonSelection, 'resolvedQuarter'>,
			commandOptions?: WorkspaceCommandOptions
		) => execute(workspaceCommands.setComparison(comparison), commandOptions),
		setChartHistory: (history: WorkspaceChartHistory, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setChartHistory(history), commandOptions),
		setPeriod: (period: SelectedPeriod, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setPeriod(period), commandOptions),
		setCharts: (charts: ChartSpec[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setCharts(charts), commandOptions),
		upsertChart: (chart: ChartSpec, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.upsertChart(chart), commandOptions),
		removeChart: (id: string, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.removeChart(id), commandOptions),
		setActivePanel: (panel: WorkspacePanel, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setActivePanel(panel), commandOptions),
		setDepth: (depth: WorkspaceDepth, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setDepth(depth), commandOptions),
		setActiveMetric: (metric: string | null, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setActiveMetric(metric), commandOptions),
		setMapSelection: (selection: MapSelection, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setMapSelection(selection), commandOptions),
		setCohortTrendResult: (
			result: CohortTrendResultSet | null,
			commandOptions?: WorkspaceCommandOptions
		) => execute(workspaceCommands.setCohortTrendResult(result), commandOptions),
		setAnalysisResult: (
			result: WorkspaceAnalysisResult | null,
			commandOptions?: WorkspaceCommandOptions
		) => execute(workspaceCommands.setAnalysisResult(result), commandOptions),
		upsertBoardBlock: (block: ResearchBoardBlock, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.upsertBoardBlock(block), commandOptions),
		reorderBoardBlocks: (orderedBlockIds: string[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.reorderBoardBlocks(orderedBlockIds), commandOptions),
		removeBoardBlock: (id: string, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.removeBoardBlock(id), commandOptions),
		focusBoardBlock: (id: string | null, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.focusBoardBlock(id), commandOptions),
		setFindings: (findings: PinnedFinding[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setFindings(findings), commandOptions),
		upsertFinding: (finding: PinnedFinding, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.upsertFinding(finding), commandOptions),
		removeFinding: (id: string, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.removeFinding(id), commandOptions),
		setWatchlistDesired: (cert: number, watched: boolean, commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setWatchlistDesired(cert, watched), commandOptions),
		setWatchlistDesiredState: (entries: WatchlistDesiredEntry[], commandOptions?: WorkspaceCommandOptions) =>
			execute(workspaceCommands.setWatchlistDesiredState(entries), commandOptions)
	};
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
