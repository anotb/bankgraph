import type { ResearchBoardBlock } from '$lib/workspace/types';
import type { ViewRole } from '$lib/atlas/templates';

export type { ViewRole };

export interface BlockLayoutOverride {
	role?: ViewRole;
	strip?: string;
	span?: number;
	stripTitle?: string;
	/** Anchor pins: a block can hold its own bank set, period, or measures. */
	pins?: { certs?: number[]; asOf?: string; compareWith?: string; metrics?: string[] };
	/** When true, even a source-bound history/table follows the current board anchors. */
	followWorkspace?: boolean;
	/** Plate height: standard (300 px of content) unless tall (560 px). A row takes the taller of its plates. */
	tall?: boolean;
	/** Presentation choice for views that offer more than one (one measure large, or all as small multiples). */
	presentation?: 'primary' | 'multiples';
	/** Economic series an economy view should show (chosen on /economy and carried onto the board). */
	series?: string[];
	/** View-specific choices live here so human changes and agent reads converge. */
	xMetric?: string;
	yMetric?: string;
	geographyMode?: 'count' | 'assets' | 'median';
	attributionMode?: 'assets' | 'funding' | 'quarterlyNetIncome' | 'loanToDeposit';
	/** Default ordering for exact tables; a person can replace it by clicking a column. */
	sortMetric?: string;
	sortBasis?: 'level' | 'change';
	sortDirection?: 'asc' | 'desc';
}

export interface LaidOutBlock {
	block: ResearchBoardBlock;
	role: ViewRole;
	span: number;
}

export interface Strip {
	id: string;
	title: string;
	blocks: LaidOutBlock[];
	notes: ResearchBoardBlock[];
}

export const ROLE_LABEL: Record<ViewRole, string> = {
	lead: 'Lead', support: 'Supporting', contrast: 'Contrast', reference: 'Exact reference',
	multiples: 'Small multiples', context: 'Context', investigation: 'Investigation'
};

/** Default role from what a block is. Agents and people can override. */
export function inferRole(block: ResearchBoardBlock): ViewRole {
	switch (block.kind) {
		case 'workspace_view':
			switch (block.binding.view) {
				case 'comparison_matrix': return 'lead';
				case 'metric_history': return 'lead';
				case 'peer_distribution': return 'support';
				case 'change_attribution': return 'lead';
				case 'metric_relationship': return 'contrast';
				case 'headquarters_geography': return 'support';
				case 'economic_context': return 'context';
				case 'bank_context': return 'reference';
			}
			return 'support';
		case 'history': return block.binding.metrics.length > 1 || block.binding.certs.length > 3 ? 'multiples' : 'lead';
		case 'exact_table': return 'reference';
		case 'analysis':
			switch (block.binding.view) {
				case 'event_study': case 'small_multiples': case 'timeline': return 'investigation';
				case 'analogue_table': case 'matched_banks': case 'movers': case 'waterfall': case 'change_waterfall': case 'stacked_composition': case 'both': return 'lead';
				case 'exact_table': return 'reference';
				default: return 'support';
			}
		case 'takeaway': return 'context';
	}
}

export function defaultStripTitle(block: ResearchBoardBlock, role: ViewRole): string {
	if (block.kind === 'workspace_view') {
		switch (block.binding.view) {
			case 'comparison_matrix': return 'Bank overview';
			case 'metric_history': return 'Quarterly trends';
			case 'peer_distribution': return 'Peer position';
			case 'change_attribution': return 'What moved';
			case 'metric_relationship': return 'Compare two measures';
			case 'headquarters_geography': return 'Headquarters';
			case 'economic_context': return 'Economic context';
			case 'bank_context': return 'Bank details';
		}
	}
	if (block.kind === 'history') return 'Quarterly trends';
	if (block.kind === 'exact_table') return 'Bank comparison';
	if (block.kind === 'analysis') return block.title || 'Analysis';
	return role === 'context' ? 'Context' : block.title || 'Views';
}

const ROLE_SPAN: Record<ViewRole, number> = { lead: 8, support: 4, contrast: 6, reference: 4, multiples: 12, context: 12, investigation: 12 };
const OWN_STRIP: ViewRole[] = ['multiples', 'investigation'];

function legacySpan(span: string | number | undefined): number | null {
	if (typeof span === 'number') return span;
	switch (span) { case 'quarter': return 3; case 'half': return 6; case 'three_quarter': return 9; case 'full': return 12; default: return null; }
}

/**
 * Compose strips from an ordered block list. Roles carry intent; spans are derived
 * unless a person or agent set one explicitly. Takeaways attach to the strip of the
 * first block they reference, or the strip they follow.
 */
export function composeStrips(blocks: readonly ResearchBoardBlock[], overrides: Record<string, BlockLayoutOverride>, columns = 12): Strip[] {
	const strips: Strip[] = [];
	const byId = new Map<string, Strip>();
	let current: Strip | null = null;
	let counter = 0;
	const roleOf = (b: ResearchBoardBlock) => overrides[b.id]?.role ?? inferRole(b);
	const newStrip = (title: string, id?: string) => { const s: Strip = { id: id ?? `s${counter++}`, title, blocks: [], notes: [] }; strips.push(s); byId.set(s.id, s); return s; };
	const used = (s: Strip) => s.blocks.reduce((a, b) => a + b.span, 0);

	// A block's stored span (set by a person, a template, or an agent tool) is an explicit choice.
	// Blocks placed with a role (templates, the + View menu) let the role decide the width instead.
	const explicitSpan = (b: ResearchBoardBlock) => overrides[b.id]?.span ?? (overrides[b.id]?.role ? null : legacySpan((b as { span?: string | number }).span));

	for (const block of blocks) {
		if (block.kind === 'takeaway') {
			const target = block.referenceBlockIds.map((id) => strips.find((s) => s.blocks.some((b) => b.block.id === id))).find(Boolean) ?? current ?? newStrip('Notes');
			target.notes.push(block);
			continue;
		}
		const role = roleOf(block);
		const ov = overrides[block.id];
		// A wide exact table reads better on its own row than squeezed beside a chart.
		const wideTable = block.kind === 'exact_table' && block.binding.metrics.length > 3 && ov?.span == null;
		const wanted = wideTable ? columns : explicitSpan(block) ?? ROLE_SPAN[role];
		if (ov?.strip) {
			current = byId.get(ov.strip) ?? newStrip(ov.stripTitle ?? defaultStripTitle(block, role), ov.strip);
			if (ov.stripTitle) current.title = ov.stripTitle;
		} else if (!current || wanted >= columns || OWN_STRIP.includes(role) || current.blocks.some((b) => OWN_STRIP.includes(b.role) || b.span >= columns) || used(current) + wanted > columns) {
			current = newStrip(ov?.stripTitle ?? defaultStripTitle(block, role));
		}
		current.blocks.push({ block, role, span: wanted });
	}

	// Normalize spans within each strip so every row is disciplined on the 12-column field.
	for (const strip of strips) {
		if (strip.blocks.length === 1 && overrides[strip.blocks[0].block.id]?.span == null) { strip.blocks[0].span = Math.max(6, strip.blocks[0].span); }
		const explicit = strip.blocks.filter((b) => explicitSpan(b.block) != null);
		const flexible = strip.blocks.filter((b) => explicitSpan(b.block) == null);
		// Explicit spans that no longer fit (a plate grew while its neighbor kept a stored width) give way
		// from the widest down, so a strip never wraps onto a second visual row.
		const minSpan = 3;
		const budget = columns - flexible.length * minSpan;
		let over = explicit.reduce((a, b) => a + b.span, 0) - budget;
		while (over > 0 && explicit.some((b) => b.span > minSpan)) {
			const widest = explicit.reduce((w, b) => (b.span > w.span ? b : w), explicit[0]);
			widest.span -= 1; over -= 1;
		}
		const explicitTotal = explicit.reduce((a, b) => a + b.span, 0);
		let remaining = Math.max(0, columns - explicitTotal);
		if (!flexible.length) continue;
		if (flexible.length === 1) { flexible[0].span = Math.max(3, remaining || columns); continue; }
		const weights = flexible.map((b) => ROLE_SPAN[b.role]);
		const weightSum = weights.reduce((a, b) => a + b, 0);
		let assigned = 0;
		flexible.forEach((b, i) => {
			const span = i === flexible.length - 1 ? remaining - assigned : Math.max(3, Math.round((weights[i] / weightSum) * remaining));
			b.span = Math.max(3, Math.min(span, remaining - assigned - (flexible.length - 1 - i) * 3));
			assigned += b.span;
		});
	}
	return strips;
}

/** Collapse spans for narrower viewports: 6-column tablets and single-column phones. */
export function responsiveSpan(span: number, columns: 12 | 6 | 1): number {
	if (columns === 12) return span;
	if (columns === 6) return span >= 9 ? 6 : span >= 5 ? 3 : 3;
	return 1;
}

export function readLegacySpan(block: ResearchBoardBlock): number | null {
	return legacySpan((block as { span?: string | number }).span);
}
