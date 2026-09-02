<script lang="ts">
	import AgentToolsStatus from './AgentToolsStatus.svelte';
	import type { WebMcpToolHost } from '$lib/webmcp';

	let { host, scope, prompts, ctaHref = '/b', ctaLabel = 'Open the research board' }: { host: WebMcpToolHost | null; scope: string; prompts: readonly string[]; ctaHref?: string; ctaLabel?: string } = $props();
	let copied = $state<number | null>(null);

	async function copyPrompt(prompt: string, index: number) {
		try { await navigator.clipboard.writeText(prompt); copied = index; window.setTimeout(() => { if (copied === index) copied = null; }, 1600); }
		catch { copied = null; }
	}
</script>

<section class="agent-panel" aria-labelledby="agent-panel-title">
	<div class="agent-panel__intro">
		<p class="eyebrow">CHATGPT + BANKGRAPH</p>
		<h2 id="agent-panel-title">ChatGPT builds the analysis in Bankgraph</h2>
		<p>Ask a question in ChatGPT while Bankgraph is open. Through WebMCP, ChatGPT can add live charts, exact tables, comparisons, and takeaways tied to the views they draw from. The work stays in your Research board, where you can inspect it, edit it, and continue the analysis.</p>
		<AgentToolsStatus {host} {scope} />
		<a class="agent-panel__cta" href={ctaHref}>{ctaLabel} <span aria-hidden="true">→</span></a>
	</div>
	<div class="agent-panel__prompts">
		<header><h3>Start with a research question</h3><p>Use one in ChatGPT while Bankgraph is open.</p></header>
		<ol>
			{#each prompts as prompt, index}
				<li><span>{String(index + 1).padStart(2, '0')}</span><p>{prompt}</p><button type="button" onclick={() => copyPrompt(prompt, index)} aria-label={`Copy prompt ${index + 1}`}>{copied === index ? 'Copied' : 'Copy'}</button></li>
			{/each}
		</ol>
	</div>
</section>

<style>
	.agent-panel { display: grid; grid-template-columns: minmax(18rem, .7fr) minmax(0, 1fr); gap: clamp(2rem, 6vw, 6rem); padding: 3rem 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
	.eyebrow { margin: 0 0 .7rem; color: var(--accent); font: 700 11px/1 var(--font-mono); letter-spacing: .1em; }
	h2 { max-width: 18ch; margin: 0; color: var(--text-primary); font-size: clamp(1.45rem, 2.5vw, 2.2rem); line-height: 1.08; letter-spacing: -.03em; }
	.agent-panel__intro > p:not(.eyebrow) { max-width: 62ch; margin: 1rem 0 1.2rem; color: var(--text-secondary); font-size: .8rem; line-height: 1.7; }
	.agent-panel__cta { display: inline-flex; gap: .55rem; margin-top: 1.35rem; color: var(--accent); font-size: .75rem; font-weight: 700; text-decoration: none; }
	.agent-panel__cta span { transition: transform .16s ease; }
	.agent-panel__cta:hover span { transform: translateX(3px); }
	.agent-panel__prompts { border-top: 1px solid var(--border); }
	.agent-panel__prompts header { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; padding: .9rem 0; border-bottom: 1px solid var(--border-muted); }
	.agent-panel__prompts h3 { margin: 0; font-size: .8rem; }
	.agent-panel__prompts header p { margin: 0; color: var(--text-tertiary); font-size: 11px; }
	ol { list-style: none; margin: 0; padding: 0; }
	li { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr) auto; gap: .8rem; align-items: start; padding: .9rem 0; border-bottom: 1px solid var(--border-muted); }
	li > span { color: var(--text-tertiary); font: 600 11px/1.5 var(--font-mono); }
	li p { margin: 0; color: var(--text-secondary); font-size: .76rem; line-height: 1.55; }
	li button { min-width: 3.3rem; border: 1px solid var(--border); background: transparent; color: var(--text-tertiary); padding: .3rem .55rem; font-size: 11px; cursor: pointer; }
	li button:hover { border-color: var(--accent); color: var(--accent); }
	@media (max-width: 780px) { .agent-panel { grid-template-columns: 1fr; gap: 2.2rem; } .agent-panel__prompts header { display: block; } .agent-panel__prompts header p { margin-top: .25rem; } }
	@media (max-width: 470px) { li { grid-template-columns: 1.25rem 1fr; } li button { grid-column: 2; justify-self: start; } }
	@media (prefers-reduced-motion: reduce) { .agent-panel__cta span { transition: none; } }
</style>
