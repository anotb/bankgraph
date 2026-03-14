import { test, expect } from '@playwright/test';

test.describe('Industry page', () => {
	test('loads with segment stats', async ({ page }) => {
		await page.goto('/industry');

		await expect(page).toHaveTitle(/Industry/);
		await expect(page.locator('h1')).toContainText('Industry Overview');

		// Industry Snapshot section with MetricCards
		await expect(page.getByText('Industry Snapshot')).toBeVisible({ timeout: 15000 });

		// Should show total/active banks count
		await expect(page.getByText('Total Banks')).toBeVisible();
		await expect(page.getByText('Active Banks')).toBeVisible();

		// Segment Breakdown table should be present
		await expect(page.getByText('Segment Breakdown')).toBeVisible({ timeout: 10000 });

		// Table should have segment rows (Community, Regional, Large)
		const segmentTable = page.locator('table').first();
		await expect(segmentTable).toBeVisible();
		const rows = segmentTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(2);
	});

	test('has at least one chart or data visualization', async ({ page }) => {
		await page.goto('/industry');

		// The Distributions section should have horizontal bar charts
		await expect(page.getByText('Distributions')).toBeVisible({ timeout: 15000 });

		// Should have chart containers (canvas or svg elements from chart components)
		// HorizontalBarChart renders div bars, so look for the chart headings
		const chartHeadings = page.locator('h3');
		await expect(chartHeadings.first()).toBeVisible({ timeout: 10000 });

		// At least one distribution chart heading should be visible
		const distributionLabels = ['Banks by Asset Size', 'Top States by Bank Count', 'Primary Regulator'];
		let foundChart = false;
		for (const label of distributionLabels) {
			const heading = page.getByText(label);
			if (await heading.isVisible().catch(() => false)) {
				foundChart = true;
				break;
			}
		}
		expect(foundChart).toBe(true);
	});

	test('failures link navigates to failures page', async ({ page }) => {
		await page.goto('/industry');

		// Look for the "View all failures" link
		const failuresLink = page.getByRole('link', { name: /View all failures/i });

		// If the bank failures section exists (it's conditional on failureCount > 0)
		const failuresSection = page.getByText('Bank Failures');
		const hasFails = await failuresSection.isVisible({ timeout: 5000 }).catch(() => false);

		if (hasFails) {
			await expect(failuresLink).toBeVisible({ timeout: 5000 });
			await failuresLink.click();
			await expect(page).toHaveURL(/\/industry\/failures/, { timeout: 10000 });
		} else {
			// If no failures data, navigate directly to failures page
			await page.goto('/industry/failures');
			await expect(page).toHaveURL(/\/industry\/failures/);
		}
	});

	test('failures page shows failure records', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page).toHaveTitle(/Failures/i, { timeout: 10000 });
		await expect(page.locator('h1')).toContainText('Bank Failures');

		// Should show count text like "X failed institutions since records began"
		await expect(page.getByText(/\d+ failed institutions/)).toBeVisible({ timeout: 15000 });

		// Should have a data table with failure records
		const table = page.locator('table');
		await expect(table.first()).toBeVisible({ timeout: 10000 });

		// Table should have header columns
		const headers = table.first().locator('th');
		expect(await headers.count()).toBeGreaterThanOrEqual(3);

		// Should have data rows
		const rows = table.first().locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});
});
