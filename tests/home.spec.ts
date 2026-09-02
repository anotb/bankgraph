import { test, expect } from '@playwright/test';

test.describe('Home / landing page', () => {
	test('landing page loads with title', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Bankgraph/);
		await expect(page.locator('[aria-label="Bankgraph"]')).toBeVisible();
	});

	test('search bar is visible and accessible', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Search by name, city, or state...');
		await expect(searchInput).toBeVisible();

		// Should be focusable
		await searchInput.click();
		await expect(searchInput).toBeFocused();
	});

	test('industry snapshot shows non-zero values', async ({ page }) => {
		await page.goto('/');

		// "Industry at a Glance" section heading
		await expect(page.getByText('Industry at a Glance')).toBeVisible({ timeout: 15000 });

		// Active Banks card should be visible (labels are uppercase in CSS so use case-insensitive)
		await expect(page.getByText('Active Banks', { exact: false })).toBeVisible({ timeout: 15000 });

		// Should have at least 3 MetricCards (Active Banks, Total Assets, Total Deposits, etc.)
		// MetricCard labels use uppercase tracking-wider styling
		const metricLabels = page.locator('p').filter({ hasText: /ACTIVE BANKS|TOTAL ASSETS|TOTAL DEPOSITS|LATEST DATA/i });
		await expect(metricLabels.first()).toBeVisible({ timeout: 15000 });
		expect(await metricLabels.count()).toBeGreaterThanOrEqual(3);
	});

	test('largest banks section has entries', async ({ page }) => {
		await page.goto('/');

		// Section heading
		await expect(page.getByText('Largest Banks by Assets')).toBeVisible({ timeout: 15000 });

		// The list is rendered as a div with links, not a <table>
		// Each bank is an <a> tag inside the list
		const bankLinks = page.locator('section:has(h2:has-text("Largest Banks by Assets")) a[href^="/banks/"]');
		await expect(bankLinks.first()).toBeVisible({ timeout: 15000 });

		// Should have multiple bank entries
		const count = await bankLinks.count();
		expect(count).toBeGreaterThanOrEqual(5);
	});

	test('navigation links work (Banks, Industry, Compare, Macro)', async ({ page }) => {
		await page.goto('/');

		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible();

		// Test each nav link
		for (const label of ['Banks', 'Industry', 'Compare', 'Macro']) {
			const link = nav.getByRole('link', { name: label });
			await expect(link).toBeVisible();
		}

		// Click Banks link and verify navigation
		await nav.getByRole('link', { name: 'Banks' }).click();
		await expect(page).toHaveURL(/\/banks/, { timeout: 10000 });

		// Go back and click Industry
		await page.goto('/');
		await nav.getByRole('link', { name: 'Industry' }).click();
		await expect(page).toHaveURL(/\/industry/, { timeout: 10000 });

		// Go back and click Compare
		await page.goto('/');
		await nav.getByRole('link', { name: 'Compare' }).click();
		await expect(page).toHaveURL(/\/compare/, { timeout: 10000 });

		// Go back and click Macro
		await page.goto('/');
		await nav.getByRole('link', { name: 'Macro' }).click();
		await expect(page).toHaveURL(/\/macro/, { timeout: 10000 });
	});
});
