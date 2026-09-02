#!/usr/bin/env node
/**
 * Drives the Atlas board through the WebMCP tool catalog the way an agent would,
 * using a document.modelContext shim (no real agent browser needed). Captures
 * screenshots at each stage so the human/agent collaboration can be reviewed.
 *
 *   node scripts/atlas-agent-demo.mjs http://localhost:5180 ./output/atlas-demo
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5180';
const outDir = process.argv[3] ?? './output/atlas-demo';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => {
	const active = new Map();
	Object.defineProperty(document, 'modelContext', {
		configurable: true,
		value: {
			async registerTool(tool, options) {
				if (active.has(tool.name)) throw new DOMException('duplicate tool', 'InvalidStateError');
				active.set(tool.name, tool);
				options?.signal?.addEventListener('abort', () => { if (active.get(tool.name) === tool) active.delete(tool.name); }, { once: true });
			}
		}
	});
	window.__agent = {
		names: () => [...active.keys()].sort(),
		invoke: async (name, input) => { const t = active.get(name); if (!t) throw new Error(`not registered: ${name}`); return t.execute(input, { signal: new AbortController().signal }); }
	};
});

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function invoke(name, input) {
	const res = await page.evaluate(({ name, input }) => window.__agent.invoke(name, input), { name, input });
	const ok = res?.ok !== false;
	log(ok ? '✓' : '✗', name, ok ? (res.summary ?? '') : JSON.stringify(res).slice(0, 300));
	if (!ok) throw new Error(`${name} failed: ${JSON.stringify(res).slice(0, 500)}`);
	return res;
}
async function shot(name) { await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true }); log('shot', name); }
const revision = async () => (await invoke('bankgraph.get_context', {})).data.revision;

await page.goto(`${base}/b`);
await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('bankgraph-analysis-results'); });
await page.goto(`${base}/b`);
await page.waitForFunction(() => (window.__agent?.names().length ?? 0) > 20, null, { timeout: 30000 });
log('tools registered:', (await page.evaluate(() => window.__agent.names())).length);
await shot('01-empty-board');

// 1. Read context, set the question.
let ctx = await invoke('bankgraph.get_context', {});
log('  revision', ctx.data.revision, 'question:', JSON.stringify(ctx.data.question));
await invoke('bankgraph.configure_screen', { question: 'How did banks that failed between 2007 and 2012 look in their last eight quarters, and which active banks have followed a similar path?', query: '', states: [], active: 'active', conditions: [], ifRevision: await revision() });

// 2. Run the event study; publish the study as a full-width investigation.
const fp = await invoke('bankgraph.analyze_failure_patterns', { startYear: 2007, endYear: 2012, quarters: 8, limit: 25, boardBlockId: 'fp-study', boardTitle: 'Before failure', boardView: 'event_study', boardSpan: 'full', boardFocus: false, ifRevision: await revision() });
const resultId = fp.data?.resultId ?? fp.data?.result?.id ?? fp.data?.analysis?.id;
log('  resultId', resultId, 'keys', Object.keys(fp.data ?? {}).join(','));
await page.waitForTimeout(1500);
await shot('02-agent-building');

// 3. Analogues and drivers.
await invoke('bankgraph.publish_result_view', { resultId, blockId: 'fp-analogues', title: 'Most similar active institutions', view: 'analogue_table', span: 'three_quarter', focus: false, ifRevision: await revision() });
await invoke('bankgraph.publish_result_view', { resultId, blockId: 'fp-drivers', title: 'Which measures drive similarity', view: 'summary', span: 'quarter', focus: false, ifRevision: await revision() });
await invoke('bankgraph.publish_result_view', { resultId, blockId: 'fp-traj', title: 'Top three against the failed median', view: 'event_trajectories', span: 'half', focus: false, ifRevision: await revision() });
await invoke('bankgraph.add_workspace_view', { blockId: 'fp-econ', title: 'The economy around the failures', view: 'economic_context', span: 'half', focus: false, ifRevision: await revision() });
let presentation = (await invoke('bankgraph.read_research_board', {})).data.presentation;
await invoke('bankgraph.configure_board_view', {
	blockId: 'fp-econ', width: 'half', height: 'standard', role: 'context', presentation: 'auto', followWorkspace: true,
	series: ['UST10Y2Y', 'BLS_UNRATE', 'FRB_FEDFUNDS'], ifRevision: await revision(), ifPresentationRevision: presentation.presentationRevision
});
await invoke('bankgraph.set_appearance', { theme: 'dark' });

// 4. Read the board and write two notes tied to views.
const board = await invoke('bankgraph.read_research_board', {});
log('  blocks:', (board.data?.blocks ?? []).map((b) => b.id).join(', '));
const study = await invoke('bankgraph.read_board_block', { blockId: 'fp-study', pageSize: 20 });
log('  study sections:', Object.keys(study.data ?? {}).join(','));
await invoke('bankgraph.upsert_takeaway', { blockId: 'note-study', title: 'What the eight quarters show', text: 'In the eight quarters before failure the median noncurrent loan ratio climbed steadily while return on assets turned negative roughly five quarters before the last filing. Capital ratios fell fastest in the final three quarters. These are medians of 468 institutions; the shaded band is the middle half.', referenceBlockIds: ['fp-study'], span: 'full', ifRevision: await revision() });
await invoke('bankgraph.upsert_takeaway', { blockId: 'note-analogues', title: 'How to read the analogues', text: 'The ranking is descriptive similarity of reported ratios over the last eight quarters. It is not a probability of failure: capital, reserves, supervisory actions, and funding access are outside the comparison.', referenceBlockIds: ['fp-analogues'], span: 'full', ifRevision: await revision() });
await invoke('bankgraph.arrange_research_board', { orderedBlockIds: ['fp-study', 'note-study', 'fp-analogues', 'fp-drivers', 'note-analogues', 'fp-traj', 'fp-econ'], focusMode: 'set', focusedBlockId: 'fp-analogues', ifRevision: await revision() });
await page.waitForTimeout(2500);
await shot('03-agent-complete');

// 5. The person edits: excludes the first analogue and renames a view; the agent reads the change.
const before = await revision();
await page.getByRole('button', { name: /^Cohort/ }).click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
const analogues = await invoke('bankgraph.read_board_block', { blockId: 'fp-analogues', pageSize: 3 });
const firstCert = analogues.data?.numerical?.items?.[0]?.cert ?? null;
log('  first analogue cert', firstCert);
if (!firstCert) throw new Error('The analogue view did not return a readable first bank.');
const addAnalogue = page.locator('[data-block="fp-analogues"]').getByRole('button', { name: 'Add' }).first();
await addAnalogue.click();
await page.waitForTimeout(800);
await shot('04-human-edit');
const after = await invoke('bankgraph.get_context', {});
log('  revision before human edit', before, 'after', after.data.revision, 'selected banks', JSON.stringify(after.data.selectedCerts ?? after.data.banks ?? null).slice(0, 120));
if (after.data.revision <= before || !(after.data.selectedCerts ?? []).includes(firstCert)) throw new Error('The human edit was not reflected in the shared agent context.');

await browser.close();
log('done →', outDir);
