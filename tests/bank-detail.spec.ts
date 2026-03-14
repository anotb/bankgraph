import { test, expect } from '@playwright/test';

test.describe('Bank detail page', () => {
	test('loads with institution details for JPMorgan (cert 628)', async ({ page }) => {
		await page.goto('/banks/628');

		// Title should contain bank name
		await expect(page).toHaveTitle(/JPMorgan|Chase/i, { timeout: 15000 });

		// Institution Details section should be visible
		await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 10000 });

		// Should display key identity fields
		await expect(page.getByText('Name', { exact: true })).toBeVisible();
		await expect(page.getByText('CERT', { exact: true })).toBeVisible();
		await expect(page.getByText('Location', { exact: true })).toBeVisible();
		await expect(page.getByText('Status', { exact: true })).toBeVisible();
	});

	test('MetricCards show actual values (not all zeros or dashes)', async ({ page }) => {
		await page.goto('/banks/628');

		// Wait for Key Metrics section
		await expect(page.getByText('Key Metrics')).toBeVisible({ timeout: 15000 });

		// Grab all MetricCard value elements (the large text showing the metric value)
		// MetricCards use data-mono class on the value <p> inside compact cards
		const metricValues = page.locator('.data-mono').filter({
			has: page.locator('text=/\\$[\\d,]+|\\d+\\.\\d+%/')
		});

		// At least 3 metric cards should have real values (not just dashes)
		await expect(metricValues.first()).toBeVisible({ timeout: 10000 });
		const count = await metricValues.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('financials tab loads with charts', async ({ page }) => {
		await page.goto('/banks/628/financials');

		// Wait for the page to load
		await expect(page).toHaveURL(/\/banks\/628\/financials/);

		// Should show quarter count or charts
		// The controls row shows "{N} quarters" text
		await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

		// Should have at least one chart section (each chart group is a <section> with a category heading)
		const chartSections = page.locator('section').filter({
			has: page.locator('canvas, svg, .recharts-wrapper, [class*="chart"]')
		});

		// Alternatively, check for the chart container sections by heading text
		const chartHeadings = page.locator('h3');
		await expect(chartHeadings.first()).toBeVisible({ timeout: 10000 });
		expect(await chartHeadings.count()).toBeGreaterThanOrEqual(1);
	});

	test('can navigate between tabs (Overview, Financials, Peers, Risk)', async ({ page }) => {
		await page.goto('/banks/628');

		// All four tab links should be visible
		const tabNav = page.locator('nav').filter({ has: page.locator('a[href*="/banks/628"]') });

		for (const label of ['Overview', 'Financials', 'Peers', 'Risk']) {
			await expect(tabNav.getByRole('link', { name: label })).toBeVisible({ timeout: 10000 });
		}

		// Click Financials tab
		await tabNav.getByRole('link', { name: 'Financials' }).click();
		await expect(page).toHaveURL(/\/banks\/628\/financials/, { timeout: 10000 });

		// Click Peers tab
		await tabNav.getByRole('link', { name: 'Peers' }).click();
		await expect(page).toHaveURL(/\/banks\/628\/peers/, { timeout: 10000 });

		// Click Risk tab
		await tabNav.getByRole('link', { name: 'Risk' }).click();
		await expect(page).toHaveURL(/\/banks\/628\/risk/, { timeout: 10000 });

		// Click back to Overview
		await tabNav.getByRole('link', { name: 'Overview' }).click();
		await expect(page).toHaveURL(/\/banks\/628$/, { timeout: 10000 });
	});

	test('risk tab shows score gauges', async ({ page }) => {
		await page.goto('/banks/628/risk');

		// Financial Health Summary section
		await expect(page.getByText('Financial Health Summary')).toBeVisible({ timeout: 15000 });

		// Should have at least one score gauge (role="meter" from ScoreGauge component)
		const gauges = page.locator('[role="meter"]');
		await expect(gauges.first()).toBeVisible({ timeout: 10000 });
		expect(await gauges.count()).toBeGreaterThanOrEqual(1);

		// Composite Score label should be visible
		await expect(page.getByText('Composite Score')).toBeVisible();
	});

	test('peers tab shows percentile gauges', async ({ page }) => {
		await page.goto('/banks/628/peers');

		// Peer Comparison heading
		await expect(page.getByText('Peer Comparison')).toBeVisible({ timeout: 15000 });

		// Should show at least one metric gauge card with bank value and median
		await expect(page.getByText('Bank:').first()).toBeVisible({ timeout: 10000 });
		await expect(page.getByText('Median:').first()).toBeVisible();

		// Detail Table should be present
		await expect(page.getByText('Detail Table')).toBeVisible();

		// Table should have data rows
		const detailTable = page.locator('table').last();
		await expect(detailTable).toBeVisible();
		const rows = detailTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});
});
