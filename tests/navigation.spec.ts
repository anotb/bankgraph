import { test, expect } from '@playwright/test';

test.describe('Navigation smoke tests', () => {
	test('landing page loads with expected title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle('Bank Data Explorer');
		await expect(page.locator('h1')).toContainText('Bank Data Explorer');
	});

	test('nav bar has all main links', async ({ page }) => {
		await page.goto('/');
		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible();

		for (const label of ['Banks', 'Industry', 'Macro', 'Compare', 'Glossary']) {
			await expect(nav.getByRole('link', { name: label })).toBeVisible();
		}
	});

	test('/banks page loads with a table', async ({ page }) => {
		await page.goto('/banks');
		await expect(page).toHaveTitle(/Banks/);
		await expect(page.locator('h1')).toContainText('Banks');

		// Table should be visible with header columns
		const table = page.locator('table');
		await expect(table).toBeVisible();
		const headerCount = await table.locator('th').count();
		expect(headerCount).toBeGreaterThanOrEqual(3);
	});

	test('/industry page loads', async ({ page }) => {
		await page.goto('/industry');
		await expect(page).toHaveTitle(/Industry/);
		await expect(page.locator('h1')).toContainText('Industry Overview');
	});

	test('/macro page loads', async ({ page }) => {
		await page.goto('/macro');
		await expect(page).toHaveTitle(/Macro/);
		await expect(page.locator('h1')).toContainText('Macro Environment');
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
		await expect(page).toHaveTitle(/Glossary/);
		await expect(page.locator('h1')).toContainText('Field Glossary');

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
