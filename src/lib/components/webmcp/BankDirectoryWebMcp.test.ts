import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

describe('BankDirectoryWebMcp', () => {
	it('compiles the directory data into one route-scoped WebMCP host', () => {
		const filename = resolve(
			process.cwd(),
			'src/lib/components/webmcp/BankDirectoryWebMcp.svelte'
		);
		const source = readFileSync(filename, 'utf8');
		const compiled = compile(source, { filename, generate: 'client' });

		expect(compiled.warnings).toEqual([]);
		expect(source).toContain('createBankDirectoryRouteTools(directory, bridge)');
		expect(source).toContain('<WebMcpHost scope="banks-directory" {tools} />');
	});
});
