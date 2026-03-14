import { test, expect } from '@playwright/test';

test.describe('Export button', () => {
	test('export button visible on financials page', async ({ page }) => {
		await page.goto('/banks/628/financials');
		await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		await expect(exportBtn).toContainText('Export');
	});

	test('clicking export shows format options (CSV, JSON)', async ({ page }) => {
		await page.goto('/banks/628/financials');
		await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

		const exportBtn = page.getByLabel('Export data');
		await exportBtn.click();

		const menu = page.locator('[role="menu"]');
		await expect(menu).toBeVisible({ timeout: 3000 });

		await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Download JSON' })).toBeVisible();
	});

	test('export button visible on compare page', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');
		await expect(page.getByText('Latest Quarter Comparison')).toBeVisible({ timeout: 20000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
	});

	test('financials CSV API returns valid CSV', async ({ request }) => {
		const res = await request.get('/api/v1/banks/628/financials?format=csv');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/csv');
		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
		// Should have header row with cert,repdte
		expect(body.split('\n')[0]).toContain('repdte');
	});

	test('compare CSV API returns valid CSV', async ({ request }) => {
		const res = await request.get('/api/v1/compare?certs=628,3510&metrics=roa,roe&format=csv');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/csv');
		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
		expect(body.split('\n')[0]).toContain('cert');
	});

	test('export button visible on banks list page', async ({ page }) => {
		await page.goto('/banks');
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		await expect(exportBtn).toContainText('Export');
	});

	test('clicking export on banks list shows CSV and JSON options', async ({ page }) => {
		await page.goto('/banks');
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const exportBtn = page.getByLabel('Export data');
		await exportBtn.click();

		const menu = page.locator('[role="menu"]');
		await expect(menu).toBeVisible({ timeout: 3000 });

		await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Download JSON' })).toBeVisible();
	});

	test('banks list CSV API returns valid CSV', async ({ request }) => {
		const res = await request.get('/api/v1/banks?format=csv');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/csv');
		const body = await res.text();
		expect(body.length).toBeGreaterThan(0);
		// Should have header row with bank-related fields
		const header = body.split('\n')[0];
		expect(header).toContain('name');
	});
});
