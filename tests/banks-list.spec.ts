import { test, expect } from '@playwright/test';

test.describe('Banks listing page', () => {
	test('banks page loads with a table', async ({ page }) => {
		await page.goto('/banks');

		await expect(page).toHaveTitle(/Banks/);
		await expect(page.locator('h1')).toContainText('Banks');

		// Table should be visible with header columns
		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Should have expected columns: Name, State, Total Assets, etc.
		const headers = table.locator('th');
		expect(await headers.count()).toBeGreaterThanOrEqual(3);
		await expect(headers.filter({ hasText: 'Name' })).toBeVisible();
		await expect(headers.filter({ hasText: 'Total Assets' })).toBeVisible();
	});

	test('table has bank names and CERT numbers in data', async ({ request }) => {
		// Verify the API returns rows with name and cert
		const res = await request.get('/api/v1/banks?limit=5');
		expect(res.status()).toBe(200);

		const json = await res.json();
		expect(json.data).toBeDefined();
		expect(json.data.length).toBeGreaterThan(0);

		for (const bank of json.data) {
			expect(bank.name).toBeTruthy();
			expect(bank.cert).toBeTruthy();
			expect(typeof bank.cert).toBe('number');
		}
	});

	test('clicking a bank row navigates to detail page', async ({ page }) => {
		await page.goto('/banks');

		// Wait for table rows to fully load (cursor-pointer indicates clickable)
		const clickableRow = page.locator('table tbody tr.cursor-pointer').first();
		await expect(clickableRow).toBeVisible({ timeout: 15000 });

		// Small delay for hydration to complete
		await page.waitForTimeout(500);

		await clickableRow.click();

		// Should navigate to /banks/{cert}
		await expect(page).toHaveURL(/\/banks\/\d+/, { timeout: 15000 });

		// Detail page should show institution details
		await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 15000 });
	});

	test('pagination indicator shows result count', async ({ page }) => {
		await page.goto('/banks');

		// Wait for table to load
		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Pagination shows "Showing X-Y of Z results"
		await expect(page.getByText(/Showing \d+.+\d+ of [\d,]+ results/)).toBeVisible({ timeout: 5000 });

		// Previous/Next buttons should exist
		await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
	});

	test('bank count indicator shows total banks', async ({ page }) => {
		await page.goto('/banks');

		// The filter bar shows "{N} banks" text
		await expect(page.getByText(/[\d,]+ banks?/)).toBeVisible({ timeout: 10000 });
	});

	test('filters are visible (state, asset size, status)', async ({ page }) => {
		await page.goto('/banks');

		// State dropdown
		const stateSelect = page.locator('select').filter({ hasText: 'All states' });
		await expect(stateSelect).toBeVisible();

		// Asset size dropdown
		const assetSelect = page.locator('select').filter({ hasText: 'All sizes' });
		await expect(assetSelect).toBeVisible();

		// Status dropdown
		const statusSelect = page.locator('select').filter({ hasText: 'Active only' });
		await expect(statusSelect).toBeVisible();
	});
});
