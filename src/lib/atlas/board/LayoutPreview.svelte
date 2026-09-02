<script lang="ts">
	/** A miniature of a template's composition, drawn from its real rows and view kinds. */
	import type { BoardTemplate, ViewKind } from '$lib/atlas/templates';
	let { template, height = 44 }: { template: BoardTemplate; height?: number } = $props();
	const SPAN: Record<string, number> = { lead: 8, support: 4, contrast: 6, reference: 4, multiples: 12, context: 12, investigation: 12 };
	function spans(views: BoardTemplate['strips'][number]['views']): number[] {
		if (views.length === 1) return [12];
		const raw = views.map((v) => typeof v.options?.columns === 'number' ? v.options.columns : SPAN[v.role] ?? 6); const sum = raw.reduce((a, b) => a + b, 0);
		return raw.map((r) => Math.max(2, Math.round((r / sum) * 12)));
	}
	function glyph(kind: ViewKind): 'line' | 'bars' | 'dots' | 'grid' | 'map' | 'text' {
		switch (kind) {
			case 'history': case 'economy': case 'failure_pattern': return 'line';
			case 'attribution': case 'composition': case 'cohort_change': return 'bars';
			case 'distribution': case 'relationship': return 'dots';
			case 'geography': return 'map';
			case 'record': return 'text';
			default: return 'grid';
		}
	}
</script>

<div class="pv" style="height:{height}px" aria-hidden="true">
	{#each template.strips as strip}
		<div class="r">
			{#each strip.views as v, i}
				{@const g = glyph(v.kind)}
				<div class="c g-{g}" style="flex:{spans(strip.views)[i]}">
					{#if g === 'line'}<svg viewBox="0 0 40 16" preserveAspectRatio="none"><path d="M1 12 L9 9 L17 11 L25 5 L33 7 L39 3" /></svg>
					{:else if g === 'bars'}<svg viewBox="0 0 40 16" preserveAspectRatio="none"><rect x="2" y="3" width="26" height="3" /><rect x="2" y="8" width="16" height="3" /><rect x="2" y="13" width="8" height="2" /></svg>
					{:else if g === 'dots'}<svg viewBox="0 0 40 16"><circle cx="8" cy="9" r="1.6" /><circle cx="14" cy="7" r="1.6" /><circle cx="19" cy="10" r="1.6" /><circle cx="23" cy="8" r="1.6" /><circle cx="30" cy="9" r="1.6" /><circle cx="35" cy="6" r="2.4" class="f" /></svg>
					{:else if g === 'map'}<svg viewBox="0 0 40 16"><rect x="4" y="3" width="6" height="5" /><rect x="11" y="3" width="6" height="5" /><rect x="18" y="3" width="6" height="5" class="f" /><rect x="25" y="3" width="6" height="5" /><rect x="11" y="9" width="6" height="5" /><rect x="18" y="9" width="6" height="5" /><rect x="25" y="9" width="6" height="5" class="f" /></svg>
					{:else if g === 'text'}<svg viewBox="0 0 40 16" preserveAspectRatio="none"><rect x="2" y="3" width="34" height="2" /><rect x="2" y="8" width="26" height="2" /><rect x="2" y="13" width="30" height="2" /></svg>
					{:else}<svg viewBox="0 0 40 16" preserveAspectRatio="none"><rect x="2" y="2" width="36" height="3" /><rect x="2" y="7" width="36" height="3" /><rect x="2" y="12" width="36" height="3" /></svg>{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.pv { display: grid; gap: 3px; }
	.r { display: flex; gap: 3px; min-height: 0; }
	.c { background: var(--surface-3); border-radius: 2px; min-width: 0; overflow: hidden; display: flex; align-items: center; }
	.c svg { width: 100%; height: 100%; fill: var(--ink-4); stroke: none; }
	.c.g-line svg path { fill: none; stroke: var(--ink-3); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
	.c svg .f { fill: var(--accent); }
</style>
