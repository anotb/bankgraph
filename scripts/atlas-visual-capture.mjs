#!/usr/bin/env node
/**
 * Captures the Atlas surfaces at every review width in day and night for
 * before/after comparison of a visual pass.
 *
 *   node scripts/atlas-visual-capture.mjs http://localhost:5180 ./output/visual/after [routeFilter]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5180';
const out = process.argv[3] ?? './output/visual';
const filter = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });

const widths = [1600, 1366, 1024, 768, 390];
const routes = [
	['front', '/'],
	['system', '/system'],
	['economy', '/economy'],
	['methods', '/methods'],
	['institutions', '/banks?state=TX'],
	['bank-628', '/bank/628'],
	['board-empty', '/b?fresh=1'],
	['board-onebank', '/b?template=one_bank&certs=628'],
	['board-failures', '/b?template=failure_analogues'],
	['board-compare', '/b?template=peer_comparison&certs=628,3511,3510']
].filter(([name]) => !filter || name.includes(filter));
const browser = await chromium.launch();
const findings = [];
for (const night of [false, true]) {
	const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
	await ctx.addInitScript((n) => { try { localStorage.setItem('atlas.night', n ? '1' : '0'); } catch {} }, night);
	const page = await ctx.newPage();
	for (const [name, path] of routes) {
		for (const width of widths) {
			await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
			if (name.startsWith('board')) { await page.goto(`${base}/b`); await page.evaluate(() => { localStorage.removeItem('bankgraph-workspace-v1'); localStorage.removeItem('atlas.layout.v1'); }); }
			await page.goto(`${base}${path.replace('?fresh=1', '')}`);
			await page.waitForTimeout(name.startsWith('board') || name.startsWith('bank') ? 7000 : name === 'economy' ? 5000 : 2500);
			const scroll = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, board: document.querySelector('.board')?.scrollWidth ?? 0, boardW: document.querySelector('.board')?.clientWidth ?? 0 }));
			if (scroll.doc > scroll.win + 1) findings.push(`${name} @${width} ${night ? 'night' : 'day'}: horizontal overflow ${scroll.doc}px > ${scroll.win}px`);
			if (scroll.board > scroll.boardW + 1) findings.push(`${name} @${width} ${night ? 'night' : 'day'}: board overflow ${scroll.board}px > ${scroll.boardW}px`);
			await page.screenshot({ path: join(out, `${name}-${width}${night ? '-night' : ''}.png`), fullPage: false });
			// A second, unrolled capture: the board scrolls internally, so open it up for the full-length review image.
			if (name.startsWith('board') || name.startsWith('bank') || width <= 390) {
				try {
					await page.addStyleTag({ content: 'main.board{height:auto!important}.shell{display:block!important}.board{overflow:visible!important}' });
					await page.screenshot({ path: join(out, `${name}-${width}${night ? '-night' : ''}-full.png`), fullPage: true });
				} catch (err) { findings.push(`${name} @${width} ${night ? 'night' : 'day'}: full capture failed (${String(err?.message ?? err).split('\n')[0]})`); }
			}
		}
	}
	await ctx.close();
}
await browser.close();
writeFileSync(join(out, 'findings.txt'), findings.join('\n') + '\n');
console.log(findings.length ? findings.join('\n') : 'no overflow findings');
