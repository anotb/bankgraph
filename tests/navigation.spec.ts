import { test, expect } from '@playwright/test';

test.describe('Navigation smoke tests', () => {
	test('landing page loads with expected title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Bankgraph/);
		await expect(page.locator('[aria-label="Bankgraph"]')).toBeVisible();
	});

	test('nav bar has all main links', async ({ page }) => {
		await page.goto('/');
		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible();

		for (const label of ['Research', 'Discover', 'Banking system', 'Economy', 'Data & methods']) {
			await expect(nav.getByRole('link', { name: label })).toBeVisible();
		}
	});

	test('/banks page loads with a table', async ({ page }) => {
		await page.goto('/banks');
		await expect(page).toHaveTitle(/Find banks/);
		await expect(page.locator('h1')).toContainText('Find banks');

		// Table should be visible with header columns
		const table = page.locator('table');
		await expect(table).toBeVisible();
		const headerCount = await table.locator('th').count();
		expect(headerCount).toBeGreaterThanOrEqual(3);
	});

	test('/industry page loads', async ({ page }) => {
		await page.goto('/industry');
		await expect(page).toHaveTitle(/Banking system/);
		await expect(page.locator('h1')).toContainText('Banking system');
	});

	test('/macro page loads', async ({ page }) => {
		await page.goto('/macro');
		await expect(page).toHaveTitle(/Economy/);
		await expect(page.locator('h1')).toContainText('Economy');
	});

	test('/compare page loads with empty state', async ({ page }) => {
		await page.goto('/compare');
		await expect(page).toHaveTitle(/Compare/);
		await expect(page.locator('h1')).toContainText('Bank Comparison');

		// Should show empty state prompt
		await expect(page.getByText('Compare up to 10 banks side-by-side')).toBeVisible();
		// Should show popular comparisons
		await expect(page.getByText('Popular comparisons')).toBeVisible();
	});

	test('/glossary page loads with field definitions', async ({ page }) => {
		await page.goto('/glossary');
		await expect(page).toHaveTitle(/Data definitions/);
		await expect(page.locator('h1')).toContainText('Data & methods');

		// Should have search input
		await expect(page.getByPlaceholder('Search fields...')).toBeVisible();

		// Should have at least one field definition section
		const sections = page.locator('section');
		expect(await sections.count()).toBeGreaterThanOrEqual(1);
	});

	test('clicking a bank in the listing navigates to detail page', async ({ page }) => {
		await page.goto('/banks');

		// Wait for clickable (hydrated) rows
		const firstRow = page.locator('table tbody tr.cursor-pointer').first();
		await expect(firstRow).toBeVisible({ timeout: 15000 });

		// Small delay for hydration to complete
		await page.waitForTimeout(500);

		await firstRow.click();

		// Should navigate to /banks/[cert]
		await expect(page).toHaveURL(/\/banks\/\d+/, { timeout: 15000 });

		// Detail page should show institution details
		await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 10000 });
	});

	test('landing page has explore navigation cards', async ({ page }) => {
		await page.goto('/');

		// The "Explore" section heading
		const exploreHeading = page.locator('h2', { hasText: 'Explore' });
		await expect(exploreHeading).toBeVisible();

		// Each nav card should be a link in the explore section
		for (const path of ['/banks', '/industry', '/macro', '/compare', '/glossary']) {
			const link = page.locator(`section a[href="${path}"]`).first();
			await expect(link).toBeVisible();
		}
	});
});
