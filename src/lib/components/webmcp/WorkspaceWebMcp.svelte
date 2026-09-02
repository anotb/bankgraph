<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		createWebMcpToolHost,
		createSiteNavigationTool,
		createWorkspaceWebMcpTools,
		type WebMcpToolHost,
		type WorkspaceWebMcpCatalogOptions,
		type WorkspaceWebMcpDependencies
	} from '$lib/webmcp/index.js';
	import WebMcpHost from './WebMcpHost.svelte';

	let {
		dependencies,
		page = 'workspace',
		scope = 'bankgraph-workspace',
		host,
		signal,
		includeDiagnostics = false,
		showDiagnostics = false
	}: {
		dependencies: WorkspaceWebMcpDependencies;
		page?: WorkspaceWebMcpCatalogOptions['page'];
		scope?: string;
		host?: WebMcpToolHost;
		signal?: AbortSignal;
		includeDiagnostics?: boolean;
		showDiagnostics?: boolean;
	} = $props();

	let internalHost = $state<WebMcpToolHost | null>(null);
	let mounted = $state(false);
	const activeHost = $derived(host ?? internalHost ?? undefined);
	let latestDependencies = $state.raw(untrack(() => dependencies));
	const hasInspectChange = $derived(Boolean(dependencies.inspectChange));
	const hasMetricHistory = $derived(Boolean(dependencies.readMetricHistory));
	const hasBankHydration = $derived(Boolean(dependencies.ensureBanksLoaded));
	const hasScreenPreparation = $derived(Boolean(dependencies.prepareScreen));
	const hasPeerPreparation = $derived(Boolean(dependencies.preparePeerCohort));
	const hasCurrentCohort = $derived(Boolean(dependencies.readCurrentCohort));
	const hasCohortTrends = $derived(Boolean(dependencies.analyzeCohortTrends));
	const hasCohortChange = $derived(Boolean(dependencies.analyzeCohortChange));
	const hasTemporalPatterns = $derived(Boolean(dependencies.findTemporalPatterns));
	const hasFinancialComposition = $derived(Boolean(dependencies.analyzeFinancialComposition));
	const hasFailurePatterns = $derived(Boolean(dependencies.analyzeFailurePatterns));
	const hasAnalysisResultStore = $derived(Boolean(dependencies.storeAnalysisResult));
	const hasBoardHistoryPreparation = $derived(Boolean(dependencies.prepareBoardHistory));
	const hasBoardTablePreparation = $derived(Boolean(dependencies.prepareBoardTable));
	const hasAnalysisRefResolution = $derived(Boolean(dependencies.resolveAnalysisResultRef));
	const hasAnalysisPageRead = $derived(Boolean(dependencies.readAnalysisResultPage));
	const hasBoardBlockDataRead = $derived(Boolean(dependencies.readBoardBlockData));
	const hasBoardTemplates = $derived(Boolean(dependencies.listBoardTemplates));
	const hasBoardPresentation = $derived(Boolean(dependencies.getBoardPresentation));
	const hasBoardTemplateApplication = $derived(Boolean(dependencies.applyBoardTemplate));
	const hasAppearanceControl = $derived(Boolean(dependencies.setAppearance));
	const hasBoardClear = $derived(Boolean(dependencies.clearResearchBoard));
	const hasBoardLayoutReset = $derived(Boolean(dependencies.resetBoardLayout));
	const hasBoardReset = $derived(Boolean(dependencies.resetResearchBoard));
	const hasBoardViewConfiguration = $derived(Boolean(dependencies.configureBoardView));
	const hasCurrentComparison = $derived(Boolean(dependencies.readCurrentComparison));
	const hasPeerDistribution = $derived(Boolean(dependencies.analyzePeerDistribution));
	const hasMetricRelationship = $derived(Boolean(dependencies.analyzeMetricRelationship));
	const hasGeographySummary = $derived(Boolean(dependencies.readGeographySummary));
	const hasMacroContext = $derived(Boolean(dependencies.readWorkspaceMacroContext));
	const hasArtifactService = $derived(Boolean(dependencies.createArtifact));
	const workspaceTarget: WorkspaceWebMcpDependencies['workspace'] = {
		get state() {
			return latestDependencies.workspace.state;
		},
		execute(command, options) {
			return latestDependencies.workspace.execute(command, options);
		},
		executeBatch(commands, options) {
			return latestDependencies.workspace.executeBatch(commands, options);
		}
	};
	const stableDependencies = $derived.by((): WorkspaceWebMcpDependencies => ({
		workspace: workspaceTarget,
		getDataContext: () => latestDependencies.getDataContext(),
		searchBanks: (request, context) => latestDependencies.searchBanks(request, context),
		getScreenView: () => latestDependencies.getScreenView?.() ?? { sort: 'assets', order: 'desc' },
		inspectChange: hasInspectChange
			? (request, context) => {
					const inspect = latestDependencies.inspectChange;
					if (!inspect) throw new Error('Change attribution is no longer available on this page.');
					return inspect(request, context);
				}
			: undefined,
		readMetricHistory: hasMetricHistory
			? (request, context) => {
					const read = latestDependencies.readMetricHistory;
					if (!read) throw new Error('Metric history is no longer available on this page.');
					return read(request, context);
				}
			: undefined,
		ensureBanksLoaded: hasBankHydration
			? (certs, context) => {
					const ensure = latestDependencies.ensureBanksLoaded;
					if (!ensure) throw new Error('Selected-bank hydration is no longer available on this page.');
					return ensure(certs, context);
				}
			: undefined,
		prepareScreen: hasScreenPreparation
			? (filters, context) => {
					const prepare = latestDependencies.prepareScreen;
					if (!prepare) throw new Error('Screen preparation is no longer available on this page.');
					return prepare(filters, context);
				}
			: undefined,
		preparePeerCohort: hasPeerPreparation
			? (recipe, excludedCerts, context) => {
					const prepare = latestDependencies.preparePeerCohort;
					if (!prepare) throw new Error('Peer-cohort preparation is no longer available on this page.');
					return prepare(recipe, excludedCerts, context);
				}
			: undefined,
		readCurrentCohort: hasCurrentCohort
			? (context) => {
					const read = latestDependencies.readCurrentCohort;
					if (!read) throw new Error('Current-cohort reads are no longer available on this page.');
					return read(context);
				}
			: undefined,
		analyzeCohortTrends: hasCohortTrends
			? (request, context) => {
					const analyze = latestDependencies.analyzeCohortTrends;
					if (!analyze) throw new Error('Cohort-trend analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		analyzeCohortChange: hasCohortChange
			? (request, context) => {
					const analyze = latestDependencies.analyzeCohortChange;
					if (!analyze) throw new Error('Cohort-change analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		findTemporalPatterns: hasTemporalPatterns
			? (request, context) => {
					const analyze = latestDependencies.findTemporalPatterns;
					if (!analyze) throw new Error('Temporal-pattern analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		analyzeFinancialComposition: hasFinancialComposition
			? (request, context) => {
					const analyze = latestDependencies.analyzeFinancialComposition;
					if (!analyze) throw new Error('Financial-composition analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		analyzeFailurePatterns: hasFailurePatterns
			? (request, context) => {
					const analyze = latestDependencies.analyzeFailurePatterns;
					if (!analyze) throw new Error('Historical trajectory analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		storeAnalysisResult: hasAnalysisResultStore
			? (result, context) => {
					const store = latestDependencies.storeAnalysisResult;
					if (!store) throw new Error('Analysis-result storage is no longer available on this page.');
					return store(result, context);
				}
			: undefined,
		prepareBoardHistory: hasBoardHistoryPreparation
			? (binding, context) => {
					const prepare = latestDependencies.prepareBoardHistory;
					if (!prepare) throw new Error('Board history preparation is no longer available on this page.');
					return prepare(binding, context);
				}
			: undefined,
		prepareBoardTable: hasBoardTablePreparation
			? (binding, context) => {
					const prepare = latestDependencies.prepareBoardTable;
					if (!prepare) throw new Error('Board table preparation is no longer available on this page.');
					return prepare(binding, context);
				}
			: undefined,
		resolveAnalysisResultRef: hasAnalysisRefResolution
			? (resultId, context) => {
					const resolve = latestDependencies.resolveAnalysisResultRef;
					if (!resolve) throw new Error('Analysis-result resolution is no longer available on this page.');
					return resolve(resultId, context);
				}
			: undefined,
		readAnalysisResultPage: hasAnalysisPageRead
			? (ref, section, options, context) => {
					const read = latestDependencies.readAnalysisResultPage;
					if (!read) throw new Error('Analysis-result paging is no longer available on this page.');
					return read(ref, section, options, context);
				}
			: undefined,
		readBoardBlockData: hasBoardBlockDataRead
			? (block, request, context) => {
					const read = latestDependencies.readBoardBlockData;
					if (!read) throw new Error('Board-block data is no longer available on this page.');
					return read(block, request, context);
				}
			: undefined,
		listBoardTemplates: hasBoardTemplates
			? () => latestDependencies.listBoardTemplates?.() ?? []
			: undefined,
		getBoardPresentation: hasBoardPresentation
			? () => latestDependencies.getBoardPresentation?.() ?? {
				presentationRevision: 0, theme: 'light', timeAxis: 'auto', pinnedTimebar: false,
				pendingViewCount: 0, overrides: {}, strips: []
			}
			: undefined,
		applyBoardTemplate: hasBoardTemplateApplication
			? (request, context) => {
				const apply = latestDependencies.applyBoardTemplate;
				if (!apply) throw new Error('Board templates are no longer available on this page.');
				return apply(request, context);
			}
			: undefined,
		setAppearance: hasAppearanceControl
			? (theme) => {
				const set = latestDependencies.setAppearance;
				if (!set) throw new Error('Appearance control is no longer available on this page.');
				return set(theme);
			}
			: undefined,
		clearResearchBoard: hasBoardClear
			? () => {
				const clear = latestDependencies.clearResearchBoard;
				if (!clear) throw new Error('Board clearing is no longer available on this page.');
				return clear();
			}
			: undefined,
		resetBoardLayout: hasBoardLayoutReset
			? () => {
				const reset = latestDependencies.resetBoardLayout;
				if (!reset) throw new Error('Board layout reset is no longer available on this page.');
				return reset();
			}
			: undefined,
		resetResearchBoard: hasBoardReset
			? () => {
				const reset = latestDependencies.resetResearchBoard;
				if (!reset) throw new Error('Research-board reset is no longer available on this page.');
				return reset();
			}
			: undefined,
		configureBoardView: hasBoardViewConfiguration
			? (blockId, configuration) => {
				const configure = latestDependencies.configureBoardView;
				if (!configure) throw new Error('Board view configuration is no longer available on this page.');
				return configure(blockId, configuration);
			}
			: undefined,
		getCurrentCohortMemberCount: () => latestDependencies.getCurrentCohortMemberCount?.() ?? 0,
		readCurrentComparison: hasCurrentComparison
			? (context) => {
					const read = latestDependencies.readCurrentComparison;
					if (!read) throw new Error('Current-comparison reads are no longer available on this page.');
					return read(context);
				}
			: undefined,
		analyzePeerDistribution: hasPeerDistribution
			? (request, context) => {
					const analyze = latestDependencies.analyzePeerDistribution;
					if (!analyze) throw new Error('Peer-distribution analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		analyzeMetricRelationship: hasMetricRelationship
			? (request, context) => {
					const analyze = latestDependencies.analyzeMetricRelationship;
					if (!analyze) throw new Error('Metric-relationship analysis is no longer available on this page.');
					return analyze(request, context);
				}
			: undefined,
		readGeographySummary: hasGeographySummary
			? (request, context) => {
					const read = latestDependencies.readGeographySummary;
					if (!read) throw new Error('Geography summaries are no longer available on this page.');
					return read(request, context);
				}
			: undefined,
		readWorkspaceMacroContext: hasMacroContext
			? (context) => {
					const read = latestDependencies.readWorkspaceMacroContext;
					if (!read) throw new Error('Workspace economic context is no longer available on this page.');
					return read(context);
				}
			: undefined,
		createArtifact: hasArtifactService
			? (request, context) => {
					const create = latestDependencies.createArtifact;
					if (!create) throw new Error('Artifact export is no longer available on this page.');
					return create(request, context);
				}
			: undefined,
		getDiagnostics: () => latestDependencies.getDiagnostics?.() ?? activeHost?.getDiagnostics() ?? {
			feature: { available: false, reason: 'not-browser' }, updatedAt: 0, registrations: [], events: []
		},
		get workspacePath() {
			return latestDependencies.workspacePath;
		},
		origin: () => latestDependencies.origin?.() ?? ''
	}));
	const tools = $derived([
		...createWorkspaceWebMcpTools(stableDependencies, { page, includeDiagnostics }),
		createSiteNavigationTool({ open: (path) => window.setTimeout(() => window.location.assign(path), 40) })
	]);

	$effect(() => {
		latestDependencies = dependencies;
	});

	onMount(() => {
		mounted = true;
		if (!host) internalHost = createWebMcpToolHost({ document });
		return () => {
			mounted = false;
			if (!host) internalHost?.dispose('workspace WebMCP host unmounted');
		};
	});
</script>

{#if mounted && activeHost}
	<WebMcpHost {scope} {tools} host={activeHost} {signal} {showDiagnostics} />
{/if}
