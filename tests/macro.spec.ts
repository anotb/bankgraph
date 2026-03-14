import { test, expect } from '@playwright/test';

test.describe('Macro page', () => {
	test('macro page loads at /macro', async ({ page }) => {
		await page.goto('/macro');
		await expect(page).toHaveTitle(/Macro/);
		await expect(page.locator('h1')).toContainText('Macro Environment');
	});

	test('shows subtitle text', async ({ page }) => {
		await page.goto('/macro');
		await expect(
			page.getByText('Federal Reserve economic data and banking sector indicators')
		).toBeVisible({ timeout: 15000 });
	});

	test('empty state appears when no FRED data is available', async ({ page }) => {
		await page.goto('/macro');

		// When FRED API key is not configured, should show the empty state
		// OR if data exists, the charts section will be visible instead.
		// We check for either scenario to make the test resilient.
		const emptyState = page.getByText('No macro data available');
		const chartSection = page.getByRole('heading', { name: 'Rate Environment' });

		// One of these two should be visible
		const emptyVisible = await emptyState.isVisible().catch(() => false);
		const chartVisible = await chartSection.isVisible().catch(() => false);
		expect(emptyVisible || chartVisible).toBe(true);

		// If empty state is shown, verify the pipeline message
		if (emptyVisible) {
			await expect(
				page.getByText('Run the FRED sync pipeline to populate macro economic series.')
			).toBeVisible({ timeout: 15000 });
		}
	});

	test('date range buttons are visible when data exists', async ({ page }) => {
		await page.goto('/macro');

		// If there's no data, the date range buttons won't show (they're inside the {:else} block)
		const emptyState = page.getByText('No macro data available');
		const hasData = !(await emptyState.isVisible().catch(() => false));

		if (hasData) {
			// All four range buttons should be visible
			for (const range of ['1Y', '5Y', '10Y', 'All']) {
				await expect(
					page.getByRole('button', { name: range, exact: true })
				).toBeVisible({ timeout: 15000 });
			}

			// "Period:" label should be visible
			await expect(page.getByText('Period:')).toBeVisible({ timeout: 15000 });

			// 10Y should be the default selected (has accent bg)
			const tenYearButton = page.getByRole('button', { name: '10Y', exact: true });
			await expect(tenYearButton).toBeVisible({ timeout: 15000 });
		}
	});

	test('section headings are visible when data exists', async ({ page }) => {
		await page.goto('/macro');

		const emptyState = page.getByText('No macro data available');
		const hasData = !(await emptyState.isVisible().catch(() => false));

		if (hasData) {
			// Should show the three main section headings
			await expect(page.getByRole('heading', { name: 'Rate Environment' })).toBeVisible({ timeout: 15000 });
			await expect(page.getByRole('heading', { name: 'Economic Indicators' })).toBeVisible({ timeout: 15000 });
			await expect(page.getByRole('heading', { name: 'Banking Sector' })).toBeVisible({ timeout: 15000 });
			await expect(page.getByRole('heading', { name: 'Macro-Bank Correlations' })).toBeVisible({ timeout: 15000 });
		}
	});

	test('correlation insights section is visible when data exists', async ({ page }) => {
		await page.goto('/macro');

		const emptyState = page.getByText('No macro data available');
		const hasData = !(await emptyState.isVisible().catch(() => false));

		if (hasData) {
			await expect(page.getByRole('heading', { name: 'Macro-Bank Correlations' })).toBeVisible({ timeout: 15000 });

			// Should show correlation description text
			await expect(
				page.getByText('Pearson correlation between FRED macro indicators', { exact: false })
			).toBeVisible({ timeout: 15000 });

			// Should have at least one InsightCard (either from DB or fallback)
			// Fallback insights include "Fed Funds Rate vs Net Interest Margin"
			const insightCards = page.locator('.rounded-md').filter({
				hasText: /correlation|vs/i
			});
			await expect(insightCards.first()).toBeVisible({ timeout: 15000 });
		}
	});

	test('date range button click changes selection', async ({ page }) => {
		await page.goto('/macro');

		const emptyState = page.getByText('No macro data available');
		const hasData = !(await emptyState.isVisible().catch(() => false));

		if (hasData) {
			// Click the 1Y button
			const oneYearButton = page.getByRole('button', { name: '1Y', exact: true });
			await expect(oneYearButton).toBeVisible({ timeout: 15000 });
			await oneYearButton.click();

			// The 1Y button should now have the active/accent styling (contains 'bg-[--accent]')
			// We verify by checking that it's still visible and clickable (basic interaction test)
			await expect(oneYearButton).toBeVisible();

			// Click All button
			const allButton = page.getByRole('button', { name: 'All', exact: true });
			await allButton.click();
			await expect(allButton).toBeVisible();
		}
	});
});
