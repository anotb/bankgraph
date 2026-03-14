import { test, expect } from '@playwright/test';

test.describe('Compare page', () => {
	test('loads with two banks via URL params', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');

		// Page title and heading
		await expect(page).toHaveTitle(/Compare/);
		await expect(page.locator('h1')).toContainText('Bank Comparison');

		// Both banks should appear as selected chips (remove buttons present)
		const removeButtons = page.locator('button[aria-label^="Remove"]');
		await expect(removeButtons.first()).toBeVisible({ timeout: 20000 });
		expect(await removeButtons.count()).toBe(2);
	});

	test('Latest Quarter Comparison section appears with bank data', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');

		// Wait for comparison data to load (banks load first, then data fetches)
		await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 30000 });

		// Latest Quarter Comparison table
		await expect(page.getByText('Latest Quarter Comparison')).toBeVisible({ timeout: 10000 });

		// Default metrics (ROA, ROE, NIM) should appear in metric selector pills
		await expect(page.getByRole('button', { name: 'ROA' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'ROE' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'NIM' })).toBeVisible();
	});

	test('charts render with ECharts canvas', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');

		// Charts section heading
		await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 20000 });

		// ECharts renders into canvas elements inside chart containers
		const canvases = page.locator('canvas');
		await expect(canvases.first()).toBeVisible({ timeout: 10000 });
		expect(await canvases.count()).toBeGreaterThanOrEqual(1);
	});

	test('export button is visible when comparison data loads', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');

		await expect(page.getByText('Latest Quarter Comparison')).toBeVisible({ timeout: 20000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
	});

	test('can navigate to compare from the nav', async ({ page }) => {
		await page.goto('/');

		const nav = page.locator('nav[aria-label="Main"]');
		const compareLink = nav.getByRole('link', { name: 'Compare' });
		await expect(compareLink).toBeVisible();

		await compareLink.click();
		await expect(page).toHaveURL(/\/compare/, { timeout: 10000 });
		await expect(page.locator('h1')).toContainText('Bank Comparison');

		// Empty state should show when no banks are selected
		await expect(page.getByText('Compare up to 10 banks side-by-side')).toBeVisible();
	});
});
