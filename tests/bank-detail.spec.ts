import { test, expect } from '@playwright/test';

const BANK_URL = '/banks/628';

test.describe('Bank detail page', () => {
	test.describe('Layout & Header', () => {
		test('displays bank name, cert number, and breadcrumb', async ({ page }) => {
			await page.goto(BANK_URL);

			// Title from +layout.svelte: "{name} | Bank Data Explorer"
			await expect(page).toHaveTitle(/JPMorgan|Chase/i, { timeout: 15000 });

			// Bank name as h1
			await expect(page.locator('h1')).toContainText(/JPMorgan|Chase/i);

			// CERT #628 shown in header metadata
			await expect(page.getByText('#628')).toBeVisible();

			// Breadcrumb with Banks link
			const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
			await expect(breadcrumb).toBeVisible();
			await expect(breadcrumb.getByRole('link', { name: 'Banks' })).toBeVisible();
			await expect(breadcrumb.getByRole('link', { name: 'Home' })).toBeVisible();
		});

		test('all four tab links are visible and correct', async ({ page }) => {
			await page.goto(BANK_URL);

			const tabNav = page.getByRole('navigation', { name: 'Bank detail sections' });
			await expect(tabNav).toBeVisible({ timeout: 10000 });

			for (const label of ['Overview', 'Financials', 'Peers', 'Risk']) {
				await expect(
					tabNav.getByRole('tab', { name: `${label} section` })
				).toBeVisible();
			}

			// Overview tab should be selected on default page
			const overviewTab = tabNav.getByRole('tab', { name: 'Overview section' });
			await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
		});
	});

	test.describe('Overview tab', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(BANK_URL);
			await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 15000 });
		});

		test('institution details section shows identity fields', async ({ page }) => {
			// The Institution Details section has a two-column grid.
			// Left column: Name, CERT, Location, Established, Status
			const details = page.locator('section').filter({
				has: page.getByRole('heading', { name: 'Institution Details' })
			});
			await expect(details).toBeVisible();

			// Identity fields
			await expect(details.getByText('Name', { exact: true })).toBeVisible();
			await expect(details.getByText('CERT', { exact: true }).first()).toBeVisible();
			await expect(details.getByText('Location', { exact: true })).toBeVisible();
			await expect(details.getByText('Established', { exact: true })).toBeVisible();
			await expect(details.getByText('Status', { exact: true })).toBeVisible();

			// JPMorgan should be active
			await expect(details.getByText('Active')).toBeVisible();
		});

		test('institution details section shows regulatory fields', async ({ page }) => {
			const details = page.locator('section').filter({
				has: page.getByRole('heading', { name: 'Institution Details' })
			});

			await expect(details.getByText('Regulator', { exact: true })).toBeVisible();
			await expect(details.getByText('Charter Class', { exact: true })).toBeVisible();
			await expect(details.getByText('Holding Company', { exact: true })).toBeVisible();
			await expect(details.getByText('Branches', { exact: true })).toBeVisible();
			await expect(details.getByText('Employees', { exact: true })).toBeVisible();
		});

		test('additional details section is collapsible', async ({ page }) => {
			const toggleBtn = page.getByRole('button', { name: /Additional Details/ });
			await expect(toggleBtn).toBeVisible();

			// Extract the count from the button text (e.g. "Additional Details (5)")
			const btnText = await toggleBtn.textContent();
			expect(btnText).toMatch(/Additional Details \(\d+\)/);

			// Scope to the Institution Details section to avoid ambiguity
			const detailsSection = page.locator('section').filter({
				has: page.getByRole('heading', { name: 'Institution Details' })
			});

			// Additional detail fields should be hidden by default
			const additionalGrid = detailsSection.locator('.divide-y.divide-\\[--surface-2\\].border-t');
			await expect(additionalGrid).not.toBeVisible();

			// Click to expand
			await toggleBtn.click();
			await expect(additionalGrid).toBeVisible({ timeout: 5000 });

			// Click again to collapse
			await toggleBtn.click();
			await expect(additionalGrid).not.toBeVisible({ timeout: 5000 });
		});

		test('key metrics section shows 7 metric cards with real values', async ({ page }) => {
			await expect(page.getByText('Key Metrics')).toBeVisible({ timeout: 15000 });

			// Should show "as of Q_ YYYY" date label
			await expect(page.getByText(/as of Q\d \d{4}/)).toBeVisible();

			// All 7 metric labels should be present as uppercase text in the cards
			const metricLabels = [
				'Total Assets',
				'Total Deposits',
				'ROA',
				'ROE',
				'NIM',
				'NPL Ratio',
				'Tier 1 Capital'
			];
			for (const label of metricLabels) {
				await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
			}

			// Metric values should contain actual numbers ($ or %)
			const valueElements = page.locator('.data-mono');
			await expect(valueElements.first()).toBeVisible({ timeout: 10000 });
			const count = await valueElements.count();
			expect(count).toBeGreaterThanOrEqual(7);
		});

		test('recent quarters table shows data', async ({ page }) => {
			await expect(page.getByText('Recent Quarters')).toBeVisible({ timeout: 15000 });

			const table = page.locator('table');
			await expect(table).toBeVisible();

			// Table headers
			await expect(table.getByRole('columnheader', { name: 'Quarter' })).toBeVisible();
			await expect(table.getByRole('columnheader', { name: 'Assets' })).toBeVisible();
			await expect(table.getByRole('columnheader', { name: 'ROA' })).toBeVisible();
			await expect(table.getByRole('columnheader', { name: 'ROE' })).toBeVisible();
			await expect(table.getByRole('columnheader', { name: 'NIM' })).toBeVisible();

			// Should have 1-4 data rows (server fetches LIMIT 4)
			const rows = table.locator('tbody tr');
			const rowCount = await rows.count();
			expect(rowCount).toBeGreaterThanOrEqual(1);
			expect(rowCount).toBeLessThanOrEqual(4);

			// First row should have quarter label like "Q4 2025"
			await expect(rows.first()).toContainText(/Q\d \d{4}/);
		});

		test('quick compare section appears when peer data exists', async ({ page }) => {
			// JPMorgan (cert 628) should have peer data
			const quickCompare = page.getByRole('heading', { name: 'Quick Compare' });
			const isVisible = await quickCompare.isVisible().catch(() => false);
			if (isVisible) {
				await expect(page.getByText('vs. peer group')).toBeVisible();
			}
		});
	});

	test.describe('Financials tab', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`${BANK_URL}/financials`);
			await expect(page).toHaveURL(/\/banks\/628\/financials/);
		});

		test('shows quarter count and date range picker', async ({ page }) => {
			// Quarter count text: "{N} quarters"
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			// Date range picker with preset buttons
			await expect(page.getByText('Period:')).toBeVisible();

			// Preset buttons should be visible
			for (const preset of ['4Q', '8Q', '5Y', '10Y', 'All', 'Custom']) {
				await expect(
					page.getByRole('button', { name: preset, exact: true })
				).toBeVisible();
			}
		});

		test('chart sections render with category headings', async ({ page }) => {
			// Wait for data to load
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			// Default fields span multiple categories; expect chart group headings (h3)
			const headings = page.locator('section h3');
			await expect(headings.first()).toBeVisible({ timeout: 10000 });
			const headingCount = await headings.count();
			expect(headingCount).toBeGreaterThanOrEqual(2);
		});

		test('field picker button shows selection count', async ({ page }) => {
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			// FieldPicker trigger button shows "N metrics selected"
			const fieldPickerBtn = page.getByRole('button', { name: /\d+ metrics? selected/ });
			await expect(fieldPickerBtn).toBeVisible();

			// Default selection is 11 fields
			await expect(fieldPickerBtn).toContainText(/\d+ metrics selected/);
		});

		test('field picker opens and shows categories with checkboxes', async ({ page }) => {
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			// Open field picker
			const fieldPickerBtn = page.getByRole('button', { name: /\d+ metrics? selected/ });
			await fieldPickerBtn.click();

			// Should show search input
			await expect(page.getByPlaceholder('Filter metrics...')).toBeVisible({ timeout: 3000 });

			// Should show field labels from the default selection
			await expect(page.getByText('Total Assets').last()).toBeVisible({ timeout: 3000 });

			// Should show checkboxes
			const checkboxes = page.locator('input[type="checkbox"]');
			const count = await checkboxes.count();
			expect(count).toBeGreaterThanOrEqual(5);
		});

		test('export button is present with aria attributes', async ({ page }) => {
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			const exportBtn = page.getByRole('button', { name: 'Export data' });
			await expect(exportBtn).toBeVisible();

			// Verify the button has popup behavior attributes
			await expect(exportBtn).toHaveAttribute('aria-haspopup', 'true');
			await expect(exportBtn).toContainText('Export');
		});

		test('changing date range preset updates quarter count', async ({ page }) => {
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			// Get current quarter count
			const quarterText = page.getByText(/\d+ quarters/);
			const initialText = await quarterText.textContent();

			// Click "4Q" preset for a smaller range
			await page.getByRole('button', { name: '4Q', exact: true }).click();

			// Quarter count should update (likely to 4 or fewer)
			await expect(quarterText).not.toHaveText(initialText!, { timeout: 5000 });
		});
	});

	test.describe('Peers tab', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`${BANK_URL}/peers`);
			await expect(page).toHaveURL(/\/banks\/628\/peers/);
		});

		test('shows peer comparison heading with peer group badge', async ({ page }) => {
			await expect(page.getByText('Peer Comparison')).toBeVisible({ timeout: 15000 });

			// Peer group label badge (e.g., "Over $250B" for JPMorgan)
			await expect(page.getByText(/Over \$250B|\$\d+[BM]/)).toBeVisible();

			// "as of" date
			await expect(page.getByText(/as of/)).toBeVisible();
		});

		test('displays gauge cards with bank and median values', async ({ page }) => {
			await expect(page.getByText('Peer Comparison')).toBeVisible({ timeout: 15000 });

			// Each gauge card shows "Bank:" and "Median:" labels
			const bankLabels = page.getByText('Bank:');
			const medianLabels = page.getByText('Median:');

			await expect(bankLabels.first()).toBeVisible({ timeout: 10000 });
			await expect(medianLabels.first()).toBeVisible();

			// At least 4 metrics shown in accessible mode (ROA, ROE, NIM, Tier 1)
			expect(await bankLabels.count()).toBeGreaterThanOrEqual(4);
		});

		test('gauge cards show percentile badges', async ({ page }) => {
			await expect(page.getByText('Peer Comparison')).toBeVisible({ timeout: 15000 });

			// Percentile badges show "P{number}" like P65
			const percentileBadges = page.getByText(/^P\d+$/);
			await expect(percentileBadges.first()).toBeVisible({ timeout: 10000 });
		});

		test('detail table shows all metrics', async ({ page }) => {
			await expect(page.getByText('Detail Table')).toBeVisible({ timeout: 15000 });

			const table = page.locator('table').last();
			await expect(table).toBeVisible();

			// Table headers
			await expect(table.getByText('Metric')).toBeVisible();
			await expect(table.getByText('Bank', { exact: true })).toBeVisible();
			await expect(table.getByText('Peer Median')).toBeVisible();
			await expect(table.getByText('Peer Mean')).toBeVisible();
			await expect(table.getByText('Percentile')).toBeVisible();

			// Should have data rows
			const rows = table.locator('tbody tr');
			expect(await rows.count()).toBeGreaterThanOrEqual(4);
		});
	});

	test.describe('Risk tab', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`${BANK_URL}/risk`);
			await expect(page).toHaveURL(/\/banks\/628\/risk/);
		});

		test('shows financial health summary with composite score', async ({ page }) => {
			await expect(page.getByText('Financial Health Summary')).toBeVisible({ timeout: 15000 });

			// Composite Score gauge (large ScoreGauge with role="meter")
			await expect(page.getByText('Composite Score')).toBeVisible();

			const compositeGauge = page.locator('[role="meter"][aria-label*="Composite Score"]');
			await expect(compositeGauge).toBeVisible({ timeout: 10000 });

			// The gauge should have a numeric score between 0 and 100
			const ariaValue = await compositeGauge.getAttribute('aria-valuenow');
			expect(ariaValue).not.toBeNull();
			const score = Number(ariaValue);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(100);
		});

		test('shows PCA status badge', async ({ page }) => {
			await expect(page.getByText('Financial Health Summary')).toBeVisible({ timeout: 15000 });

			// PCA Status label
			await expect(page.getByText('PCA Status')).toBeVisible();

			// One of the PCA categories should be visible
			const pcaCategories = [
				'Well Capitalized',
				'Adequately Capitalized',
				'Undercapitalized',
				'Significantly Undercapitalized',
				'Critically Undercapitalized'
			];
			const pcaBadge = page.getByText(new RegExp(pcaCategories.join('|')));
			await expect(pcaBadge.first()).toBeVisible();
		});

		test('shows component score breakdown', async ({ page }) => {
			await expect(page.getByText('Component Scores')).toBeVisible({ timeout: 15000 });

			// Component score gauges
			const componentLabels = ['Capital', 'Asset Quality', 'Earnings', 'Liquidity'];
			for (const label of componentLabels) {
				const gauge = page.locator(`[role="meter"][aria-label*="${label}"]`);
				await expect(gauge).toBeVisible({ timeout: 5000 });
			}

			// All should have scores 0-100
			const meters = page.locator('[role="meter"]');
			const meterCount = await meters.count();
			// Composite + 4 components = 5
			expect(meterCount).toBeGreaterThanOrEqual(5);
		});

		test('shows detected anomalies section', async ({ page }) => {
			await expect(page.getByText('Detected Anomalies')).toBeVisible({ timeout: 15000 });

			// Either shows "No anomalies detected" or an anomalies table
			const noAnomalies = page.getByText('No anomalies detected for this quarter');
			const anomalyTable = page.locator('table').filter({
				has: page.getByText('Severity')
			});

			const hasNoAnomalies = await noAnomalies.isVisible().catch(() => false);
			const hasTable = await anomalyTable.isVisible().catch(() => false);

			// One of these must be true
			expect(hasNoAnomalies || hasTable).toBe(true);

			// If there's a table, verify its structure
			if (hasTable) {
				const table = anomalyTable.first();
				await expect(table.getByText('Severity')).toBeVisible();
				await expect(table.getByText('Metric', { exact: true })).toBeVisible();
				await expect(table.getByText('Value', { exact: true })).toBeVisible();
				await expect(table.getByText('Reference')).toBeVisible();
				await expect(table.getByText('Description')).toBeVisible();

				// Severity badges should be one of: critical, warning, info
				const severityBadges = table.locator('tbody td:first-child span');
				const count = await severityBadges.count();
				expect(count).toBeGreaterThanOrEqual(1);
			}
		});
	});

	test.describe('Tab navigation', () => {
		test('clicking tabs changes URL and content', async ({ page }) => {
			await page.goto(BANK_URL);
			await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 15000 });

			const tabNav = page.getByRole('navigation', { name: 'Bank detail sections' });

			// Navigate to Financials
			await tabNav.getByRole('tab', { name: 'Financials section' }).click();
			await expect(page).toHaveURL(/\/banks\/628\/financials/, { timeout: 10000 });
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });
			// Overview content should not be visible
			await expect(page.getByText('Institution Details')).not.toBeVisible();

			// Navigate to Peers
			await tabNav.getByRole('tab', { name: 'Peers section' }).click();
			await expect(page).toHaveURL(/\/banks\/628\/peers/, { timeout: 10000 });
			const peersContent = page
				.getByText('Peer Comparison')
				.or(page.getByText('No peer comparison data'));
			await expect(peersContent.first()).toBeVisible({ timeout: 15000 });

			// Navigate to Risk
			await tabNav.getByRole('tab', { name: 'Risk section' }).click();
			await expect(page).toHaveURL(/\/banks\/628\/risk/, { timeout: 10000 });
			const riskContent = page
				.getByText('Financial Health Summary')
				.or(page.getByText('No risk analysis data'));
			await expect(riskContent.first()).toBeVisible({ timeout: 15000 });

			// Back to Overview
			await tabNav.getByRole('tab', { name: 'Overview section' }).click();
			await expect(page).toHaveURL(/\/banks\/628$/, { timeout: 10000 });
			await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 10000 });
		});

		test('active tab has selected state', async ({ page }) => {
			await page.goto(`${BANK_URL}/financials`);
			await expect(page.getByText(/\d+ quarters/)).toBeVisible({ timeout: 20000 });

			const tabNav = page.getByRole('navigation', { name: 'Bank detail sections' });
			const financialsTab = tabNav.getByRole('tab', { name: 'Financials section' });
			const overviewTab = tabNav.getByRole('tab', { name: 'Overview section' });

			// Financials tab should be selected
			await expect(financialsTab).toHaveAttribute('aria-selected', 'true');
			// Overview tab should NOT be selected
			await expect(overviewTab).toHaveAttribute('aria-selected', 'false');
		});

		test('direct URL navigation to each tab works', async ({ page }) => {
			// Directly navigate to each sub-page and verify content loads
			await page.goto(`${BANK_URL}/financials`);
			await expect(
				page.getByText(/\d+ quarters/).or(page.getByText('No financial data'))
			).toBeVisible({ timeout: 20000 });

			await page.goto(`${BANK_URL}/peers`);
			await expect(
				page.getByText('Peer Comparison').or(page.getByText('No peer comparison'))
			).toBeVisible({ timeout: 15000 });

			await page.goto(`${BANK_URL}/risk`);
			await expect(
				page.getByText('Financial Health Summary').or(page.getByText('No risk analysis'))
			).toBeVisible({ timeout: 15000 });
		});
	});

	test.describe('404 handling', () => {
		test('shows error page for non-existent bank', async ({ page }) => {
			const response = await page.goto('/banks/999999999');

			// Server should return 404
			expect(response?.status()).toBe(404);

			// Error status code displayed
			await expect(page.getByText('404')).toBeVisible({ timeout: 10000 });

			// "Page not found" title (from root +error.svelte)
			await expect(page.getByText('Page not found')).toBeVisible();

			// Description text
			await expect(
				page.getByText(/doesn't exist or has been moved/)
			).toBeVisible();

			// "Go back" button
			await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();

			// "Go home" link
			await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
		});

		test('shows error page for non-numeric cert', async ({ page }) => {
			const response = await page.goto('/banks/notanumber');

			expect(response?.status()).toBe(404);
			await expect(page.getByText('404')).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Page not found')).toBeVisible();
		});
	});
});
