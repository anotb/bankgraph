<script lang="ts">
	import { agentPresence } from '$lib/atlas/agent.svelte';

	let { compact = false }: { compact?: boolean } = $props();
	let open = $state(false);
	let phase = $derived(agentPresence.phase);
	let current = $derived(agentPresence.current);
	$effect(() => { agentPresence.detect(); });

	const prompts = [
		'Show how banks that failed between 2007 and 2012 changed in their last eight quarters, then find active banks with similar paths.',
		'Was last quarter’s change in U.S. bank deposits broad or concentrated in a few institutions? Build the board.',
		'Find active banks whose deposits fell in three of the last four quarters while noncurrent loans rose, and compare them with peers.'
	];
	async function copy(text: string) { try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ } }
	const label = $derived(phase === 'working' && current ? `${current.label}…` : phase === 'done' ? 'Agent' : phase === 'unsupported' ? 'Connect an agent' : 'Agent ready');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />
<div class="wrap">
	<button type="button" class="tile tile--{phase}" aria-expanded={open} onclick={() => (open = !open)}>
		<i aria-hidden="true"></i><span class="lbl">{label}</span>
	</button>
	{#if open}
		<div class="scrim" onclick={() => (open = false)} role="presentation"></div>
		<div class="pop panel" role="dialog" aria-label="Work with an agent">
			{#if phase === 'unsupported'}
				<h3>Work with an agent</h3>
				<p>In a browser that supports WebMCP, an assistant such as ChatGPT or Claude can search institutions, define a cohort, add and arrange views on this board, and read what you change. The board stays here.</p>
				<p class="meta">This browser doesn't expose WebMCP{agentPresence.reason ? ` (${agentPresence.reason.replace(/-/g, ' ')})` : ''}. Open Bankgraph in one that does, or use the questions below in any assistant and paste a board link.</p>
			{:else if phase === 'working' && current}
				<h3>{current.label}…</h3>
				<p class="meta">Keep editing if you like; the agent reads your changes before its next step.</p>
			{:else if phase === 'done'}
				<h3>{agentPresence.completedCount} steps on this board</h3>
				<ol class="steps">{#each agentPresence.steps.filter((s) => s.status !== 'active').slice(-8) as step}<li class:failed={step.status === 'failure'}>{step.label}</li>{/each}</ol>
			{:else}
				<h3>Agent ready</h3>
				<p>{agentPresence.registered} tools are registered for this page. Ask a question in your assistant with this tab open and it will build here.</p>
			{/if}
			<div class="cap" style="margin-top:12px">Questions to try</div>
			<ul class="prompts">{#each prompts as prompt}<li><span>{prompt}</span><button type="button" class="btn sm quiet" onclick={() => copy(prompt)}>Copy</button></li>{/each}</ul>
		</div>
	{/if}
</div>

<style>
	.wrap { position: relative; }
	.tile { display: inline-flex; align-items: center; gap: 7px; height: 28px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface); color: var(--ink-2); padding: 0 10px 0 9px; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; max-width: 240px; transition: border-color 140ms ease-out, color 140ms ease-out; }
	.tile:hover { border-color: var(--ink-4); color: var(--ink); }
	.tile i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-4); flex: none; }
	.tile--ready i { background: var(--favorable); }
	.tile--working { border-color: var(--accent); color: var(--ink); }
	.tile--working i { background: var(--accent); animation: breathe 1.2s ease-in-out infinite; }
	.tile--done i { background: var(--accent); }
	.tile--stopped i { background: var(--caution); }
	.lbl { overflow: hidden; text-overflow: ellipsis; }
	.scrim { position: fixed; inset: 0; z-index: 39; }
	.panel { position: absolute; right: 0; top: calc(100% + 8px); width: 380px; font-size: 12.5px; line-height: 1.5; color: var(--ink-2); }
	.panel h3 { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
	.panel p { margin: 0 0 8px; }
	.meta { color: var(--ink-3); font-size: 12px; }
	.steps { margin: 0; padding-left: 18px; font-size: 12px; }
	.steps li.failed { color: var(--caution); }
	.prompts { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
	.prompts li { display: flex; gap: 8px; align-items: flex-start; border-top: 1px solid var(--rule-2); padding-top: 6px; font-size: 12px; color: var(--ink); }
	.prompts li span { flex: 1; }
	@keyframes breathe { 50% { opacity: .35; } }
	@media (max-width: 640px) { .panel { position: fixed; left: 8px; right: 8px; top: 56px; width: auto; } .tile { max-width: 150px; } }
</style>
