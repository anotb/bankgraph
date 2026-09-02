import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/critical',
	testMatch: ['critical-journeys.spec.ts', 'webmcp-native.spec.ts'],
	timeout: 45_000,
	expect: {
		timeout: 10_000
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? 'github' : 'list',
	outputDir: './output/playwright/test-results',
	use: {
		baseURL: 'http://127.0.0.1:4174',
		screenshot: 'only-on-failure',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' }
		}
	],
	webServer: {
		command: 'node scripts/start-seeded-e2e.mjs',
		url: 'http://127.0.0.1:4174/b',
		reuseExistingServer: false,
		timeout: 120_000
	}
});
