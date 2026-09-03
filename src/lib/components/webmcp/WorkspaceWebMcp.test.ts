import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

describe('WorkspaceWebMcp', () => {
	it('keeps every high-level analysis capability in the stable dependency proxy', () => {
		const filename = resolve(process.cwd(), 'src/lib/components/webmcp/WorkspaceWebMcp.svelte');
		const source = readFileSync(filename, 'utf8');
		const compiled = compile(source, { filename, generate: 'client' });

		expect(compiled.warnings).toEqual([]);
		for (const capability of [
			'analyzeCohortChange',
			'findTemporalPatterns',
			'analyzeFinancialComposition',
			'analyzeFailurePatterns',
			'storeAnalysisResult',
			'prepareBoardHistory',
			'prepareBoardTable',
			'resolveAnalysisResultRef',
			'readAnalysisResultPage',
			'readBoardBlockData',
			'resolveBoardBlock'
		]) {
			expect(source).toContain(`${capability}:`);
			expect(source).toContain(`latestDependencies.${capability}`);
		}
	});
});
