import { getContext, setContext } from 'svelte';
import type { WorkspaceStore } from '$lib/workspace/workspace.svelte';
import { createDefaultWorkspaceState, workspaceCommands } from '$lib/workspace/state';
import { WORKSPACE_LIMITS, type ChartSpec, type ResearchBoardBlock, type WorkspaceState } from '$lib/workspace/types';
import { DEFAULT_WORKSPACE_METRICS, type ResearchMetric } from '$lib/research-metrics';
import { BoardData } from '$lib/atlas/engine/board-data.svelte';
import { metricChange, metricValue, previousQuarter, quartersBetween, isQuarterEnd, yearAgo } from '$lib/atlas/engine/metrics';
import { composeStrips, type BlockLayoutOverride, type Strip, type ViewRole } from './layout';
import { BOARD_TEMPLATES, templateById, type BoardTemplate, type TemplateView } from '$lib/atlas/templates';
import { configureAnchorConfiguration, withAnchorConfiguration } from './views/util';

const KEY = Symbol('atlas-board');
const LINKED_CHART_ID = 'linked-analysis';
/** Template block ids end in their declaration index (`one_bank-3`); anything else sorts after them in place. */
function templateIndex(id: string): number { const m = /^[a-z_]+-(\d+)$/.exec(id); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER; }

export type TimeForm = 'compact' | 'standard' | 'event';

export interface EventTime {
	alignment: 'last_filing_before_failure';
	quartersBefore: number;
}

/**
 * The board: one shared workspace state (people and agents write to it through the
 * same commands), the loaded data behind it, the layout sidecar, and transient UI
 * state such as hover and the timebar's live preview.
 */
export class Board {
	store: WorkspaceStore;
	data: BoardData;
	overrides = $state<Record<string, BlockLayoutOverride>>({});
	presentationRevision = $state(0);
	hoverCert = $state<number | null>(null);
	hoverQuarter = $state<string | null>(null);
	/** Timebar preview while dragging; the committed value lives in the store. */
	previewAsOf = $state<string | null>(null);
	focusedBlockId = $state<string | null>(null);
	/** null = follow the board's content; 'calendar' or an EventTime = a person's explicit choice. */
	timeAxisChoice = $state<EventTime | 'calendar' | null>(null);
	pinnedTimebar = $state(false);
	activityOpen = $state(false);
	recentlyRemoved = $state<{ block: ResearchBoardBlock; index: number; override?: BlockLayoutOverride } | null>(null);
	recentlyCleared = $state<{ blocks: ResearchBoardBlock[]; overrides: Record<string, BlockLayoutOverride> } | null>(null);
	composingIds = $state<Set<string>>(new Set());
	/** Ask the anchor rail to open one of its panels (set by empty plates and the needs banner). */
	requestPanel = $state<'banks' | 'cohort' | 'measures' | 'time' | null>(null);
	/** Template views that bind to certificates, waiting for the first bank. */
	pendingViews = $state<Array<{ view: TemplateView; id: string; stripId: string; stripTitle: string }>>([]);
	#overridesKey: string;

	constructor(store: WorkspaceStore, data: BoardData, overridesKey = 'atlas.layout.v1') {
		this.store = store;
		this.data = data;
		this.#overridesKey = overridesKey;
		if (typeof localStorage !== 'undefined') {
			try { this.overrides = JSON.parse(localStorage.getItem(overridesKey) ?? '{}'); } catch { this.overrides = {}; }
		}
	}

	get state(): WorkspaceState { return this.store.state; }
	get blocks(): ResearchBoardBlock[] { return this.state.board.blocks; }
	get selectedCerts(): number[] { return this.state.selectedCerts; }
	get metrics(): ResearchMetric[] {
		const chart = this.state.charts.find((c) => c.id === LINKED_CHART_ID);
		const list = (chart?.metrics?.length ? chart.metrics : DEFAULT_WORKSPACE_METRICS) as ResearchMetric[];
		return list.slice(0, 6);
	}
	get activeMetric(): ResearchMetric { return (this.state.activeMetric as ResearchMetric | null) ?? this.metrics[0]; }
	get latest(): string { return this.data.latestQuarter ?? this.state.asOfQuarter ?? '20260630'; }
	get asOf(): string { return this.previewAsOf ?? this.state.asOfQuarter ?? this.latest; }
	get compareWith(): string {
		const s = this.state;
		if (this.previewAsOf) return previousQuarter(this.previewAsOf);
		if (s.comparison.resolvedQuarter) return s.comparison.resolvedQuarter;
		if (s.comparison.mode === 'year-ago') return `${Number(this.asOf.slice(0, 4)) - 1}${this.asOf.slice(4)}`;
		return previousQuarter(this.asOf);
	}
	get historyFrom(): string { return this.state.chartHistory.from ?? previousQuarter(this.asOf, 7); }
	get historyTo(): string { return this.state.chartHistory.to ?? this.asOf; }
	get quarters(): string[] { return quartersBetween(this.historyFrom, this.historyTo < this.asOf ? this.asOf : this.historyTo); }
	get strips(): Strip[] { return composeStrips(this.blocks, this.overrides); }
	/** Event time switches on when an event-aligned analysis is on the board, unless a person chose otherwise. */
	/** Event time exists only while an event-aligned analysis is on the board. */
	get eventTimeAvailable(): EventTime | null {
		const fp = this.blocks.find((b) => b.kind === 'analysis' && b.binding.resultRef.kind === 'failure_pattern');
		if (!fp) return null;
		const quarters = this.state.analysisResult?.kind === 'failure_pattern' ? this.state.analysisResult.spec.quarters : 8;
		return { alignment: 'last_filing_before_failure', quartersBefore: quarters };
	}
	get eventTime(): EventTime | null {
		const available = this.eventTimeAvailable;
		if (!available) return null;
		if (this.timeAxisChoice === 'calendar') return null;
		return this.timeAxisChoice ?? available;
	}
	/** Choose the axis: event time (when available) or the calendar. Passing null returns to following the board's content. */
	set eventTime(value: EventTime | null) { this.timeAxisChoice = value ?? 'calendar'; }
	useEventTime() { this.timeAxisChoice = this.eventTimeAvailable; }
	useCalendar() { this.timeAxisChoice = 'calendar'; }
	get timeForm(): TimeForm {
		if (this.eventTime) return 'event';
		if (this.pinnedTimebar) return 'standard';
		const hasHistory = this.blocks.some((b) => b.kind === 'history' || (b.kind === 'workspace_view' && (b.binding.view === 'metric_history' || b.binding.view === 'economic_context')) || (b.kind === 'analysis' && ['event_study', 'small_multiples', 'timeline', 'event_trajectories'].includes(b.binding.view)));
		return hasHistory ? 'standard' : 'compact';
	}
	get isEmpty(): boolean { return this.blocks.length === 0 && this.pendingViews.length === 0; }

	/** What a view needs before it can show anything: a bank, a cohort of five or more, or nothing. */
	blockNeeds(block: ResearchBoardBlock): 'banks' | 'cohort' | null {
		const pins = this.overrides[block.id]?.pins;
		if (block.kind === 'history') return block.binding.certs.length || pins?.certs?.length || this.selectedCerts.length ? null : 'banks';
		if (block.kind === 'exact_table') return block.binding.certs.length || pins?.certs?.length || this.selectedCerts.length ? null : 'banks';
		if (block.kind === 'workspace_view') {
			const v = block.binding.view;
			if (['comparison_matrix', 'change_attribution', 'bank_context', 'metric_history'].includes(v)) return pins?.certs?.length || this.selectedCerts.length ? null : 'banks';
			if (v === 'peer_distribution') return this.data.cohort.length >= 5 ? null : 'cohort';
			if (v === 'metric_relationship' || v === 'headquarters_geography') return this.data.cohort.length >= 5 || this.selectedCerts.length ? null : 'cohort';
		}
		return null;
	}
	/** The unmet needs across the board, for the banner under the anchors. */
	get unmetNeeds(): { banks: number; cohort: number } {
		let banks = this.pendingViews.length, cohort = 0;
		for (const b of this.blocks) { const n = this.blockNeeds(b); if (n === 'banks') banks++; else if (n === 'cohort') cohort++; }
		return { banks, cohort };
	}

	// ----- anchor mutations (human side; agents use the same commands through tools)
	setQuestion(question: string) { this.store.execute(workspaceCommands.setQuestion(question.slice(0, 1000))); }
	setAsOf(quarter: string) {
		if (!isQuarterEnd(quarter)) return;
		this.previewAsOf = null;
		const s = this.state;
		const cmds = [workspaceCommands.setAsOfQuarter(quarter), workspaceCommands.setComparison({ mode: s.comparison.mode, rangeStartQuarter: s.comparison.rangeStartQuarter, customQuarter: s.comparison.customQuarter })];
		// The stored window is either fully set or fully null; extending one end must carry the other.
		if (quarter > this.historyTo) cmds.push(workspaceCommands.setChartHistory({ from: s.chartHistory.from ?? this.historyFrom, to: quarter }));
		else if (quarter < this.historyFrom) cmds.push(workspaceCommands.setChartHistory({ from: quarter, to: s.chartHistory.to ?? this.historyTo }));
		this.store.executeBatch(cmds);
	}
	setComparison(mode: WorkspaceState['comparison']['mode'], customQuarter: string | null = null) {
		this.store.execute(workspaceCommands.setComparison({ mode, rangeStartQuarter: this.historyFrom, customQuarter }));
	}
	setHistory(from: string, to: string) { this.store.execute(workspaceCommands.setChartHistory({ from, to })); }
	setMetrics(metrics: ResearchMetric[]) {
		const existing = this.state.charts.find((c) => c.id === LINKED_CHART_ID);
		const chart: ChartSpec = existing ? { ...existing, metrics } : { id: LINKED_CHART_ID, title: 'Linked bank analysis', kind: 'line', metrics, certs: this.selectedCerts, scale: 'value', stacked: false, visible: true };
		this.store.execute(workspaceCommands.upsertChart(chart));
		if (!metrics.includes(this.activeMetric)) this.store.execute(workspaceCommands.setActiveMetric(metrics[0] ?? null));
	}
	setActiveMetric(metric: ResearchMetric) { this.store.execute(workspaceCommands.setActiveMetric(metric)); }
	setSelectedCerts(certs: number[]) {
		const unique = [...new Set(certs)].slice(0, WORKSPACE_LIMITS.selectedBanks);
		const cmds = [workspaceCommands.setSelectedCerts(unique)];
		if (this.state.activeBank && !unique.includes(this.state.activeBank)) cmds.push(workspaceCommands.setActiveBank(unique[0] ?? null));
		if (!this.state.activeBank && unique.length) cmds.push(workspaceCommands.setActiveBank(unique[0]));
		this.store.executeBatch(cmds);
		void this.data.ensureInstitutions(unique);
		if (unique.length) this.placePendingViews();
	}
	/** Create the certificate-bound template views that were waiting for a bank, in their intended strips. */
	placePendingViews() {
		if (!this.pendingViews.length || !this.selectedCerts.length) return;
		const waiting = this.pendingViews;
		this.pendingViews = [];
		for (const p of waiting) {
			const block = this.blockForTemplateView(p.view, p.id);
			if (block) this.upsertBlock(block, { ...this.overrideForTemplateView(p.view), role: p.view.role, strip: p.stripId, stripTitle: p.stripTitle });
		}
		// Keep the template's order: pending views were declared in sequence with the blocks already placed.
		const order = [...this.blocks].sort((a, b) => templateIndex(a.id) - templateIndex(b.id)).map((b) => b.id);
		if (order.some((id, i) => id !== this.blocks[i]?.id)) this.reorder(order);
	}
	addCert(cert: number) { this.setSelectedCerts([...this.selectedCerts, cert]); }
	removeCert(cert: number) { this.setSelectedCerts(this.selectedCerts.filter((c) => c !== cert)); }
	setActiveBank(cert: number | null) { this.store.execute(workspaceCommands.setActiveBank(cert)); }
	setPeerRecipe(recipe: WorkspaceState['peerRecipe']) { this.store.execute(workspaceCommands.setPeerRecipe(recipe)); }
	setExcluded(certs: number[]) { this.store.execute(workspaceCommands.setExcludedCerts(certs)); }

	// ----- board mutations
	upsertBlock(block: ResearchBoardBlock, override?: BlockLayoutOverride) {
		this.store.execute(workspaceCommands.upsertBoardBlock(block));
		if (override) this.setOverride(block.id, override);
		this.composingIds = new Set([...this.composingIds, block.id]);
		setTimeout(() => { const next = new Set(this.composingIds); next.delete(block.id); this.composingIds = next; }, 400);
	}
	removeBlock(id: string) {
		const index = this.blocks.findIndex((b) => b.id === id);
		const block = this.blocks[index];
		if (!block) return;
		this.recentlyRemoved = { block, index, ...(this.overrides[id] ? { override: this.overrides[id] } : {}) };
		this.store.execute(workspaceCommands.removeBoardBlock(id));
		if (this.overrides[id]) {
			const next = { ...this.overrides };
			delete next[id];
			this.overrides = next;
			this.presentationRevision += 1;
			this.#persistOverrides();
		}
	}
	restoreRemoved() {
		const r = this.recentlyRemoved;
		if (!r) return;
		const ids = this.blocks.map((b) => b.id).filter((x) => x !== r.block.id);
		ids.splice(Math.min(r.index, ids.length), 0, r.block.id);
		this.store.executeBatch([
			workspaceCommands.upsertBoardBlock(r.block),
			workspaceCommands.reorderBoardBlocks(ids)
		]);
		if (r.override) this.setOverride(r.block.id, r.override);
		this.recentlyRemoved = null;
	}
	reorder(ids: string[]) { this.store.execute(workspaceCommands.reorderBoardBlocks(ids)); }
	moveBlock(id: string, beforeId: string | null) {
		const ids = this.blocks.map((b) => b.id).filter((x) => x !== id);
		const at = beforeId ? ids.indexOf(beforeId) : ids.length;
		ids.splice(at < 0 ? ids.length : at, 0, id);
		this.reorder(ids);
	}
	renameBlock(id: string, title: string) {
		const block = this.blocks.find((b) => b.id === id);
		if (block) this.store.execute(workspaceCommands.upsertBoardBlock({ ...block, title: title.slice(0, 160) }));
	}
	setOverride(id: string, patch: BlockLayoutOverride): boolean {
		const block = this.blocks.find((candidate) => candidate.id === id);
		if (block && (patch.followWorkspace !== undefined || patch.pins !== undefined)) {
			const pins = patch.pins;
			const has = (field: keyof NonNullable<BlockLayoutOverride['pins']>) =>
				pins !== undefined && Object.prototype.hasOwnProperty.call(pins, field);
			const anchorConfig = configureAnchorConfiguration(this, block, {
				...(patch.followWorkspace === undefined ? {} : { followWorkspace: patch.followWorkspace }),
				...(has('certs') ? (pins!.certs?.length ? { certs: pins!.certs } : { bankSource: 'workspace' as const }) : {}),
				...(has('metrics') ? (pins!.metrics?.length ? { metrics: pins!.metrics as ResearchMetric[] } : { metricSource: 'workspace' as const }) : {}),
				...(has('asOf') ? (pins!.asOf ? { asOf: pins!.asOf } : { periodSource: 'workspace' as const }) : {}),
				...(has('compareWith') && pins!.compareWith ? { compareWith: pins!.compareWith } : {})
			});
			this.store.execute(workspaceCommands.upsertBoardBlock(withAnchorConfiguration(this, block, anchorConfig)));
		}
		const merged = Object.fromEntries(Object.entries({ ...(this.overrides[id] ?? {}), ...patch }).filter(([, value]) => value !== undefined)) as BlockLayoutOverride;
		if (JSON.stringify(this.overrides[id] ?? {}) === JSON.stringify(merged)) return false;
		const next = { ...this.overrides, [id]: merged };
		this.overrides = next;
		this.presentationRevision += 1;
		this.#persistOverrides();
		return true;
	}
	setRole(id: string, role: ViewRole) { this.setOverride(id, { role, span: undefined }); }
	setSpan(id: string, span: number | undefined) { this.setOverride(id, { span }); }
	/** Several spans at once (a gutter drag trades columns between neighbors), written as one layout change. */
	setSpans(entries: Array<{ id: string; span: number | undefined; strip?: string | null }>) {
		const next = { ...this.overrides };
		for (const e of entries) {
			const cur = { ...(next[e.id] ?? {}), span: e.span };
			if (e.strip === null) { delete cur.strip; delete cur.stripTitle; } else if (e.strip) cur.strip = e.strip;
			next[e.id] = cur;
		}
		this.overrides = next;
		this.presentationRevision += 1;
		this.#persistOverrides();
	}
	/** Return the board to its semantic auto-layout, without discarding any analysis. */
	clearOverrides() {
		if (!Object.keys(this.overrides).length && !this.focusedBlockId && this.timeAxisChoice === null && !this.pinnedTimebar) return false;
		this.overrides = {};
		this.focusedBlockId = null;
		this.timeAxisChoice = null;
		this.pinnedTimebar = false;
		this.presentationRevision += 1;
		this.#persistOverrides();
		return true;
	}
	#persistOverrides() {
		try { localStorage.setItem(this.#overridesKey, JSON.stringify(this.overrides)); } catch { /* ignore */ }
	}
	/** Select a plate (shared focus in the store) without opening it large. */
	select(id: string | null) { this.store.execute(workspaceCommands.focusBoardBlock(id)); }
	/** Open a plate large; also selects it. */
	focus(id: string | null) {
		this.focusedBlockId = id;
		if (id) this.store.execute(workspaceCommands.focusBoardBlock(id));
	}
	/** Remove every view; the previous board stays restorable until the next change. */
	clearBoard(keepForUndo = false) {
		if (keepForUndo && this.blocks.length) this.recentlyCleared = { blocks: [...this.blocks], overrides: { ...this.overrides } };
		const removedIds = new Set(this.blocks.map((b) => b.id));
		if (removedIds.size) this.store.executeBatch([...removedIds].map((id) => workspaceCommands.removeBoardBlock(id)));
		this.overrides = Object.fromEntries(Object.entries(this.overrides).filter(([id]) => !removedIds.has(id)));
		this.#persistOverrides();
		if (removedIds.size) this.presentationRevision += 1;
		this.pendingViews = [];
		this.recentlyRemoved = null;
		this.focusedBlockId = null;
	}
	restoreCleared() {
		const c = this.recentlyCleared;
		if (!c) return;
		this.store.executeBatch([
			...c.blocks.map((b) => workspaceCommands.upsertBoardBlock(b)),
			workspaceCommands.reorderBoardBlocks(c.blocks.map((b) => b.id))
		]);
		this.overrides = c.overrides;
		this.presentationRevision += 1;
		this.#persistOverrides();
		this.recentlyCleared = null;
	}
	/** Start a fresh research board. Watchlist membership remains a product-level preference. */
	resetResearchBoard(): boolean {
		const current = this.state;
		const defaults = createDefaultWorkspaceState();
		const commands = [
			workspaceCommands.setQuestion(defaults.question),
			workspaceCommands.setFilters(defaults.filters),
			workspaceCommands.setScreenView(defaults.screenView),
			workspaceCommands.setResults(defaults.results),
			workspaceCommands.setActiveBank(defaults.activeBank),
			workspaceCommands.setSelectedCerts(defaults.selectedCerts),
			workspaceCommands.setExcludedCerts(defaults.excludedCerts),
			workspaceCommands.setPeerRecipe(defaults.peerRecipe),
			workspaceCommands.setAsOfQuarter(defaults.asOfQuarter),
			workspaceCommands.setComparison(defaults.comparison),
			workspaceCommands.setChartHistory(defaults.chartHistory),
			workspaceCommands.setPeriod(defaults.period),
			workspaceCommands.setCharts(defaults.charts),
			workspaceCommands.setActivePanel(defaults.activePanel),
			workspaceCommands.setDepth(defaults.depth),
			workspaceCommands.setActiveMetric(defaults.activeMetric),
			workspaceCommands.setMapSelection(defaults.mapSelection),
			workspaceCommands.setCohortTrendResult(defaults.cohortTrendResult),
			workspaceCommands.setAnalysisResult(defaults.analysisResult),
			workspaceCommands.setFindings(defaults.findings),
			...current.board.blocks.map((block) => workspaceCommands.removeBoardBlock(block.id))
		];
		const result = this.store.executeBatch(commands);
		const presentationChanged = this.clearOverrides();
		this.pendingViews = [];
		this.recentlyRemoved = null;
		this.recentlyCleared = null;
		return result.changed || presentationChanged;
	}

	// ----- templates → blocks in the shared block vocabulary
	/** Apply the question and anchors that make a human-facing template useful on first open. */
	prepareTemplate(template: BoardTemplate | string, preserve: { banks?: boolean; cohort?: boolean; question?: boolean } = {}): BoardTemplate | null {
		const t = typeof template === 'string' ? templateById(template) : template;
		if (!t) return null;
		const start = t.start;
		if (!start) return t;
		if (start.clearBanks && !preserve.banks) this.setSelectedCerts([]);
		if (start.clearCohort && !preserve.cohort) {
			const defaults = createDefaultWorkspaceState();
			this.setPeerRecipe(defaults.peerRecipe);
			this.setExcluded([]);
		}
		if (start.cohort && !preserve.cohort) {
			this.setPeerRecipe({
				...this.state.peerRecipe,
				basis: 'custom',
				name: start.cohort.name,
				active: 'active',
				states: [...(start.cohort.states ?? [])],
				assetRange: { ...start.cohort.assetRange },
				metricConditions: [],
				maximumPeers: start.cohort.maximumPeers ?? 200
			});
			this.setExcluded([]);
		}
		if (start.metrics?.length) {
			this.setMetrics(start.metrics);
			this.setActiveMetric(start.metrics[0]);
		}
		if (start.question && !preserve.question) this.setQuestion(start.question);
		return t;
	}

	async applyCuratedTemplate(template: BoardTemplate | string, mode: 'replace' | 'append' = 'replace', preserve: { banks?: boolean; cohort?: boolean; question?: boolean } = {}): Promise<void> {
		const t = this.prepareTemplate(template, preserve);
		if (!t) return;
		await this.applyTemplate(t, mode);
		if (!preserve.banks) await this.selectCuratedMatches(t);
	}

	/** Resolve a question-led template into named banks while retaining its cohort as the benchmark. */
	async selectCuratedMatches(template: BoardTemplate | string): Promise<number[]> {
		const t = typeof template === 'string' ? templateById(template) : template;
		const selection = t?.start?.selection;
		if (!selection) return [];
		await this.data.loadCohort(this.state);
		const asOf = this.state.asOfQuarter ?? this.data.cohortAsOf ?? this.data.latestQuarter;
		if (!asOf || !this.data.cohort.length) return [];
		const prior = selection.basis === 'year-ago-change'
			? yearAgo(asOf)
			: selection.basis === 'prior-quarter-change'
				? previousQuarter(asOf)
				: null;
		await Promise.all([
			this.data.ensureInstitutions(this.data.cohort),
			this.data.ensureRows(this.data.cohort, prior ?? asOf)
		]);
		const ranked = this.data.cohort.flatMap((cert) => {
			const current = metricValue(selection.metric, this.data.rows[cert], asOf, this.data.institutions[cert]);
			if (current == null) return [];
			const value = prior
				? metricChange(selection.metric, current, metricValue(selection.metric, this.data.rows[cert], prior, this.data.institutions[cert])).value
				: current;
			return value == null ? [] : [{ cert, value, assets: this.data.institutions[cert]?.total_assets ?? 0 }];
		}).sort((a, b) => {
			const byValue = selection.direction === 'highest' ? b.value - a.value : a.value - b.value;
			return byValue || b.assets - a.assets || a.cert - b.cert;
		});
		const certs = ranked.slice(0, Math.max(1, Math.min(10, selection.limit))).map((row) => row.cert);
		if (certs.length) {
			this.setSelectedCerts(certs);
			this.setActiveBank(certs[0]);
			if (selection.basis === 'year-ago-change') this.setComparison('year-ago');
			else if (selection.basis === 'prior-quarter-change') this.setComparison('prior-quarter');
		}
		return certs;
	}

	async applyTemplate(template: BoardTemplate | string, mode: 'replace' | 'append' = 'replace'): Promise<void> {
		const t = typeof template === 'string' ? templateById(template) : template;
		if (!t) return;
		const includesFailureAnalysis = t.strips.some((strip) => strip.views.some((view) => view.kind === 'failure_pattern'));

		// A regular replacement is one absolute board operation. Building the desired board first
		// makes retries genuinely idempotent: the store compares the final state rather than seeing
		// a transient clear followed by four separate inserts.
		if (mode === 'replace' && !includesFailureAnalysis) {
			const blocks: ResearchBoardBlock[] = [];
			const overrides: Record<string, BlockLayoutOverride> = {};
			const pending: Board['pendingViews'] = [];
			let n = 0;
			for (const strip of t.strips) {
				const stripId = `${t.id}-${strip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
				for (const view of strip.views) {
					const id = `${t.id}-${++n}`;
					if ((view.kind === 'history' || view.kind === 'exact_table') && !this.selectedCerts.length) {
						pending.push({ view, id, stripId, stripTitle: strip.title });
						continue;
					}
					const block = this.blockForTemplateView(view, id);
					if (!block) continue;
					blocks.push(block);
					overrides[id] = { ...this.overrideForTemplateView(view), role: view.role, strip: stripId, stripTitle: strip.title };
				}
			}

			const commands = [
				...this.blocks.map((block) => workspaceCommands.removeBoardBlock(block.id)),
				...blocks.map((block) => workspaceCommands.upsertBoardBlock(block)),
				...(blocks.length ? [workspaceCommands.reorderBoardBlocks(blocks.map((block) => block.id))] : [])
			];
			const shared = this.store.executeBatch(commands);
			const presentationChanged = JSON.stringify(this.overrides) !== JSON.stringify(overrides);
			if (presentationChanged) {
				this.overrides = overrides;
				this.presentationRevision += 1;
				this.#persistOverrides();
			}
			this.pendingViews = pending;
			this.recentlyRemoved = null;
			this.focusedBlockId = null;
			this.timeAxisChoice = null;
			if (shared.changed || presentationChanged) {
				this.composingIds = new Set(blocks.map((block) => block.id));
				setTimeout(() => { this.composingIds = new Set(); }, 400);
			}
			return;
		}

		if (mode === 'replace') { this.clearBoard(); this.timeAxisChoice = null; }
		let n = this.blocks.length + this.pendingViews.length;
		let needsFailureAnalysis = false;
		for (const strip of t.strips) {
			const stripId = `${t.id}-${strip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
			for (const view of strip.views) {
				if (view.kind === 'failure_pattern') { needsFailureAnalysis = true; continue; }
				const id = `${t.id}-${++n}`;
				// History and exact-table blocks bind to certificates and the shared state rejects an empty list,
				// so without a bank they wait here and are placed the moment one is added.
				if ((view.kind === 'history' || view.kind === 'exact_table') && !this.selectedCerts.length) { this.pendingViews = [...this.pendingViews, { view, id, stripId, stripTitle: strip.title }]; continue; }
				const block = this.blockForTemplateView(view, id);
				if (!block) continue;
				this.upsertBlock(block, { ...this.overrideForTemplateView(view), role: view.role, strip: stripId, stripTitle: strip.title });
			}
		}
		// Analysis-backed views only exist once the analysis has run; the template runs it the same way "Add view" does.
		if (needsFailureAnalysis) await this.runFailureAnalysis();
	}

	analysisRunning = $state<string | null>(null);
	/** Fetch the published failure-pattern analysis, store it, and place its plates. */
	async runFailureAnalysis(): Promise<void> {
		if (this.analysisRunning) return;
		this.analysisRunning = 'failure';
		try {
			const res = await fetch('/api/v2/research/failure-patterns');
			if (!res.ok) throw new Error(String(res.status));
			const result = (await res.json()) as import('$lib/server/analytics/failure-patterns').FailurePatternsResponse;
			const { createBrowserAnalysisResultRepository } = await import('$lib/workspace/analysis-result-repository');
			const repo = await createBrowserAnalysisResultRepository();
			const s = this.state;
			const analysis: import('$lib/workspace/types').FailurePatternAnalysisResult = {
				kind: 'failure_pattern' as const, id: `failure-${Date.now().toString(36)}`, basedOnRevision: s.revision, publishedRevision: s.revision + 1,
				title: `Banks that failed ${result.request.startYear}–${result.request.endYear}: the ${result.request.quarters} quarters before, and active banks with similar paths`,
				population: { membershipBasis: 'published_failure_and_active_universe' as const, analyzedCount: result.historicalCohort.withExactQuarterHistory, definitionHash: 'failure-pattern-default', cohortHash: 'failure-pattern-default', peerRecipe: null, excludedCount: 0 },
				lineage: { sourceMode: 'live' as const, sourceAsOf: result.provenance.sourceAsOf, retrievedAt: new Date().toISOString(), release: result.provenance.release, releaseGeneration: result.provenance.release_generation },
				spec: { startYear: result.request.startYear, endYear: result.request.endYear, quarters: result.request.quarters, limit: result.request.limit },
				result
			};
			const ref = await repo.put(analysis);
			this.store.execute(workspaceCommands.setAnalysisResult(analysis));
			const id = Date.now().toString(36);
			this.upsertBlock({ id: `fp-study-${id}`, kind: 'analysis', title: 'Before failure', span: 'full', binding: { resultRef: ref, view: 'event_study' } }, { role: 'investigation', strip: `fp-before-${id}`, stripTitle: 'Before failure' });
			this.upsertBlock({ id: `fp-drivers-${id}`, kind: 'analysis', title: 'Which measures drive similarity', span: 'quarter', binding: { resultRef: ref, view: 'summary' } }, { role: 'support', span: 4, strip: `fp-analog-${id}`, stripTitle: 'Active banks on a similar path' });
			this.upsertBlock({ id: `fp-table-${id}`, kind: 'analysis', title: 'Most similar active institutions', span: 'three_quarter', binding: { resultRef: ref, view: 'analogue_table' } }, { role: 'lead', span: 8, strip: `fp-analog-${id}`, stripTitle: 'Active banks on a similar path' });
			this.upsertBlock({ id: `fp-traj-${id}`, kind: 'analysis', title: 'Top three against the failed median', span: 'half', binding: { resultRef: ref, view: 'event_trajectories' } }, { role: 'contrast', strip: `fp-ctx-${id}`, stripTitle: 'Trajectories and context' });
			// A template-placed economy plate would sit first in block order; recreate it here so context follows the analysis.
			for (const b of [...this.blocks]) if (b.kind === 'workspace_view' && b.binding.view === 'economic_context') this.store.execute(workspaceCommands.removeBoardBlock(b.id));
			this.upsertBlock({ id: `fp-econ-${id}`, kind: 'workspace_view', title: 'The economy around the failures', span: 'half', binding: { view: 'economic_context' } }, { role: 'contrast', strip: `fp-ctx-${id}`, stripTitle: 'Trajectories and context' });
			if (!this.state.question) this.setQuestion('How did banks that failed between 2007 and 2012 look in their last eight quarters, and which active banks have followed a similar path?');
		} finally {
			this.analysisRunning = null;
		}
	}

	blockForTemplateView(view: TemplateView, id: string): ResearchBoardBlock | null {
		const metrics = (view.options?.metrics as ResearchMetric[] | undefined) ?? this.metrics;
		const title = view.title ?? '';
		const configuredSpan = typeof view.options?.columns === 'number'
			? view.options.columns <= 4 ? 'quarter' : view.options.columns <= 6 ? 'half' : view.options.columns <= 9 ? 'three_quarter' : 'full'
			: undefined;
		const anchorConfig = {
			bankSource: 'workspace' as const,
			metricSource: view.options?.metrics ? 'fixed' as const : 'workspace' as const,
			periodSource: 'workspace' as const,
			...(view.options?.metrics ? { metrics } : {})
		};
		switch (view.kind) {
			case 'statements': return { id, kind: 'workspace_view', title: title || 'Position', span: configuredSpan ?? 'full', binding: { view: 'comparison_matrix' }, anchorConfig };
			case 'history': return { id, kind: 'history', title: title || 'Over time', span: configuredSpan ?? 'full', binding: { certs: this.selectedCerts.length ? this.selectedCerts : [], metrics, from: this.historyFrom, to: this.historyTo, chartKind: 'line', scale: 'value' }, anchorConfig };
			case 'exact_table': return { id, kind: 'exact_table', title: title || 'Exact values', span: configuredSpan ?? 'full', binding: { certs: this.selectedCerts, metrics, from: null, to: null, followCurrent: true }, anchorConfig };
			case 'distribution': return { id, kind: 'workspace_view', title: title || 'Among peers', span: configuredSpan ?? 'half', binding: { view: 'peer_distribution' }, anchorConfig };
			case 'attribution': return { id, kind: 'workspace_view', title: title || 'What moved', span: configuredSpan ?? 'half', binding: { view: 'change_attribution' }, anchorConfig };
			case 'relationship': return { id, kind: 'workspace_view', title: title || 'Relationship', span: configuredSpan ?? 'half', binding: { view: 'metric_relationship' }, anchorConfig };
			case 'geography': return { id, kind: 'workspace_view', title: title || 'Where', span: configuredSpan ?? 'half', binding: { view: 'headquarters_geography' }, anchorConfig };
			case 'economy': return { id, kind: 'workspace_view', title: title || 'The economy alongside', span: configuredSpan ?? 'full', binding: { view: 'economic_context' }, anchorConfig };
			case 'record': return { id, kind: 'workspace_view', title: title || 'Institution record', span: configuredSpan ?? 'quarter', binding: { view: 'bank_context' }, anchorConfig };
			default: return null; // analysis-backed views are created by running the analysis
		}
	}

	overrideForTemplateView(view: TemplateView): BlockLayoutOverride {
		const metrics = view.options?.metrics as ResearchMetric[] | undefined;
		return {
			...((view.kind === 'history' || view.kind === 'exact_table') ? { followWorkspace: true } : {}),
			...(metrics?.length ? { pins: { metrics } } : {}),
			...(typeof view.options?.columns === 'number' ? { span: Math.max(3, Math.min(12, Math.round(view.options.columns))) } : {}),
			...(view.options?.tall === true ? { tall: true } : {}),
			...(view.options?.layout === 'multiples' ? { presentation: 'multiples' as const } : {}),
			...(Array.isArray(view.options?.series) ? { series: (view.options.series as string[]).slice(0, 3) } : {}),
			...(typeof view.options?.x === 'string' ? { xMetric: view.options.x } : {}),
			...(typeof view.options?.y === 'string' ? { yMetric: view.options.y } : {}),
			...(typeof view.options?.geographyMode === 'string' ? { geographyMode: view.options.geographyMode as BlockLayoutOverride['geographyMode'] } : {}),
			...(typeof view.options?.sortMetric === 'string' ? { sortMetric: view.options.sortMetric } : {}),
			...(view.options?.sortBasis === 'change' || view.options?.sortBasis === 'level' ? { sortBasis: view.options.sortBasis } : {}),
			...(view.options?.sortDirection === 'asc' || view.options?.sortDirection === 'desc' ? { sortDirection: view.options.sortDirection } : {})
		};
	}

	static provide(board: Board) { setContext(KEY, board); return board; }
	static use(): Board { return getContext<Board>(KEY); }
}

export { BOARD_TEMPLATES, LINKED_CHART_ID };
