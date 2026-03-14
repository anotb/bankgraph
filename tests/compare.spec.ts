import { test, expect } from '@playwright/test';

test.describe('Compare page', () => {
	test('clicking a popular comparison loads banks', { tag: '@flaky' }, async ({ page }) => {
		await page.goto('/compare');

		// Click the first popular comparison button by text content
		const popularButton = page.locator('button', { hasText: 'JPMorgan vs Bank of America' });
		await expect(popularButton).toBeVisible();
		await popularButton.click();

		// Wait for comparison data to load - the loading state or results should appear
		// URL should contain certs parameter
		await expect(page).toHaveURL(/certs=/, { timeout: 15000 });

		// Selected banks should appear (look for remove buttons)
		const removeButtons = page.locator('button[aria-label^="Remove"]');
		await expect(removeButtons.first()).toBeVisible({ timeout: 10000 });
		expect(await removeButtons.count()).toBeGreaterThanOrEqual(2);
	});

	test('comparison table appears when banks are loaded', async ({ page }) => {
		// Navigate directly with certs in URL
		await page.goto('/compare?certs=628,3510');

		// Wait for comparison data to load
		await expect(page.getByText('Latest Quarter Comparison')).toBeVisible({ timeout: 20000 });

		// A table should be rendered
		const table = page.locator('table').last();
		await expect(table).toBeVisible();

		// Should have data rows
		const rows = table.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});

	test('comparison charts section appears', async ({ page }) => {
		await page.goto('/compare?certs=628,3510');

		// Charts section should appear
		await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 20000 });
	});

	test('can remove a bank from comparison', async ({ page }) => {
		await page.goto('/compare');

		const popularButton = page.locator('button', { hasText: 'JPMorgan vs Bank of America' });
		await popularButton.click();

		// Wait for chips to load
		const removeButtons = page.locator('button[aria-label^="Remove"]');
		await expect(removeButtons.first()).toBeVisible({ timeout: 15000 });
		const initialCount = await removeButtons.count();

		// Remove the first bank
		await removeButtons.first().click();

		// Should have one fewer
		await expect(removeButtons).toHaveCount(initialCount - 1, { timeout: 5000 });
	});
});
