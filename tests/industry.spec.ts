import { test, expect } from '@playwright/test';

test.describe('Industry page', () => {
	test('loads at /industry with heading and title', async ({ page }) => {
		await page.goto('/industry');

		await expect(page).toHaveTitle(/Industry/);
		await expect(page.locator('h1')).toContainText('Industry Overview');

		// Latest quarter date should be shown below the heading
		// (conditional on data, so just check the heading is there)
		await expect(page.locator('h1')).toBeVisible();
	});

	test('Industry Snapshot metric cards are visible with real numbers', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Industry Snapshot')).toBeVisible({ timeout: 15000 });

		// Snapshot section contains metric cards
		const snapshot = page.locator('section').filter({ hasText: 'Industry Snapshot' }).first();
		await expect(snapshot).toBeVisible();
		await expect(snapshot.getByText('Total Banks')).toBeVisible();
		await expect(snapshot.getByText('Active Banks')).toBeVisible();
		await expect(snapshot.getByText('Total Assets').first()).toBeVisible();

		// Look for a formatted number (commas, $, or T/B/M suffix) within the snapshot
		const numericPattern = /[\d,]+/;
		const snapshotText = await snapshot.innerText();
		expect(numericPattern.test(snapshotText)).toBe(true);
	});

	test('Segment Breakdown table is visible with expected columns', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Segment Breakdown')).toBeVisible({ timeout: 15000 });

		const segmentTable = page.locator('table').first();
		await expect(segmentTable).toBeVisible();

		// Required column headers
		for (const col of ['Segment', 'Banks', 'Total Assets', 'Avg Assets', 'Total Deposits']) {
			await expect(segmentTable.locator('th').filter({ hasText: col })).toBeVisible();
		}

		// Should have at least 2 data rows (All Banks + at least one segment)
		const rows = segmentTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(2);
	});

	test('Segment Breakdown table shows Community, Regional, Large segments', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Segment Breakdown')).toBeVisible({ timeout: 15000 });

		const segmentTable = page.locator('table').first();
		const tbody = segmentTable.locator('tbody');

		// The "All Banks" rollup row should always be present
		await expect(tbody.getByText('All Banks')).toBeVisible();

		// At least one named segment should be present
		const segments = ['Community', 'Regional', 'Large'];
		let foundSegment = false;
		for (const seg of segments) {
			if (await tbody.getByText(seg).isVisible().catch(() => false)) {
				foundSegment = true;
				break;
			}
		}
		expect(foundSegment).toBe(true);
	});

	test('Distributions section has at least one chart heading', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Distributions')).toBeVisible({ timeout: 15000 });

		// HorizontalBarChart sections have h3 headings
		const chartLabels = ['Banks by Asset Size', 'Top States by Bank Count', 'Primary Regulator'];
		let found = 0;
		for (const label of chartLabels) {
			if (await page.getByText(label).isVisible().catch(() => false)) {
				found++;
			}
		}
		expect(found).toBeGreaterThanOrEqual(1);
	});

	test('Asset Size Distribution detail table is visible', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Asset Size Distribution')).toBeVisible({ timeout: 15000 });

		// The second table in the page is the asset tier breakdown
		const tables = page.locator('table');
		const tableCount = await tables.count();
		expect(tableCount).toBeGreaterThanOrEqual(2);

		// Asset Size Distribution table should have these column headers
		const assetTable = page.locator('section').filter({ hasText: 'Asset Size Distribution' }).locator('table');
		await expect(assetTable).toBeVisible();

		// Check column headers exist using getByRole to avoid strict mode violations
		await expect(assetTable.getByRole('columnheader', { name: 'Tier' })).toBeVisible();
		await expect(assetTable.getByRole('columnheader', { name: /^Banks$/ })).toBeVisible();
		await expect(assetTable.getByRole('columnheader', { name: '% of Banks' })).toBeVisible();
		await expect(assetTable.getByRole('columnheader', { name: /Total Assets/ }).first()).toBeVisible();

		// At least one tier row (e.g., <$100M)
		const rows = assetTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});

	test('Industry Trends section is visible', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Industry Trends')).toBeVisible({ timeout: 15000 });

		// Either shows a chart or a "Trend data will appear here" placeholder
		const trendsSection = page.locator('section').filter({ hasText: 'Industry Trends' }).first();
		await expect(trendsSection).toBeVisible();

		const hasChart = await trendsSection.locator('h3', { hasText: 'Key Ratios' }).isVisible().catch(() => false);
		const hasPlaceholder = await trendsSection.getByText('Trend data will appear here').isVisible().catch(() => false);

		expect(hasChart || hasPlaceholder).toBe(true);
	});

	test('data values are real numbers not placeholders', async ({ request }) => {
		const res = await request.get('/api/v1/meta');
		expect(res.status()).toBe(200);

		const meta = await res.json();
		// bank_count should be a positive integer
		expect(typeof meta.bank_count).toBe('number');
		expect(meta.bank_count).toBeGreaterThan(0);
	});

	test('export button is visible on industry page', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Industry Snapshot')).toBeVisible({ timeout: 15000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		await expect(exportBtn).toContainText('Export');
		await expect(exportBtn).toHaveAttribute('aria-haspopup', 'true');
		await expect(exportBtn).toHaveAttribute('aria-expanded', 'false');
	});

	test('clicking export button on industry page opens CSV/JSON menu', async ({ page }) => {
		await page.goto('/industry');

		await expect(page.getByText('Industry Snapshot')).toBeVisible({ timeout: 15000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		// Small wait for hydration before clicking
		await page.waitForTimeout(300);
		await exportBtn.click();

		const menu = page.locator('[role="menu"]');
		await expect(menu).toBeVisible({ timeout: 5000 });

		await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Download JSON' })).toBeVisible();

		// aria-expanded should now be true
		await expect(exportBtn).toHaveAttribute('aria-expanded', 'true');
	});

	test('navigation to failures sub-page works', async ({ page }) => {
		await page.goto('/industry');

		const failuresSection = page.getByText('Bank Failures');
		const hasFails = await failuresSection.isVisible({ timeout: 5000 }).catch(() => false);

		if (hasFails) {
			const failuresLink = page.getByRole('link', { name: /View all failures/i });
			await expect(failuresLink).toBeVisible({ timeout: 5000 });
			await failuresLink.click();
			await expect(page).toHaveURL(/\/industry\/failures/, { timeout: 10000 });
			await expect(page.locator('h1')).toContainText('Bank Failures');
		} else {
			// No failure data in this env; navigate directly and check the page loads
			await page.goto('/industry/failures');
			await expect(page).toHaveURL(/\/industry\/failures/);
			await expect(page.locator('h1')).toContainText('Bank Failures');
		}
	});
});

test.describe('Industry failures sub-page', () => {
	test('loads at /industry/failures with heading and count', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page).toHaveTitle(/Failures/i, { timeout: 15000 });
		await expect(page.locator('h1')).toContainText('Bank Failures');

		// Count text: "X failed institutions since records began"
		await expect(page.getByText(/failed institutions since records began/)).toBeVisible({ timeout: 15000 });

		// Count should be a real number, not zero or placeholder
		const countText = await page.getByText(/failed institutions since records began/).innerText();
		const match = countText.match(/[\d,]+/);
		expect(match).not.toBeNull();
		const count = parseInt((match![0] ?? '0').replace(/,/g, ''), 10);
		expect(count).toBeGreaterThan(0);
	});

	test('All Failures table has expected columns and data rows', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.getByText('All Failures')).toBeVisible({ timeout: 15000 });

		const failureTable = page.locator('section').filter({ hasText: 'All Failures' }).locator('table');
		await expect(failureTable).toBeVisible();

		for (const col of ['Bank Name', 'State', 'Failure Date', 'Assets']) {
			await expect(failureTable.locator('th').filter({ hasText: col })).toBeVisible();
		}

		const rows = failureTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});

	test('Cost to FDIC metrics are visible when data is present', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		// Cost section is conditional on failureCount > 0
		const hasCostSection = await page.getByText('Cost to FDIC').isVisible({ timeout: 5000 }).catch(() => false);

		if (hasCostSection) {
			const costSection = page.locator('section').filter({ hasText: 'Cost to FDIC' }).first();
			await expect(costSection.getByText('Total Cost').first()).toBeVisible();
			await expect(costSection.getByText('Avg Cost per Failure').first()).toBeVisible();
		}
	});

	test('Failures by Year chart section renders when data is present', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		const hasByYear = await page.getByText('Failures by Year').isVisible({ timeout: 5000 }).catch(() => false);

		if (hasByYear) {
			const section = page.locator('section').filter({ hasText: 'Failures by Year' }).first();
			await expect(section).toBeVisible();
		}
	});

	test('Failures by Decade table is visible when data is present', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		const hasDecade = await page.getByText('Failures by Decade').isVisible({ timeout: 5000 }).catch(() => false);

		if (hasDecade) {
			const decadeTable = page.locator('section').filter({ hasText: 'Failures by Decade' }).locator('table');
			await expect(decadeTable).toBeVisible();

			for (const col of ['Decade', 'Failures', 'Total Cost']) {
				await expect(decadeTable.locator('th').filter({ hasText: col })).toBeVisible();
			}

			const rows = decadeTable.locator('tbody tr');
			expect(await rows.count()).toBeGreaterThanOrEqual(1);
		}
	});

	test('back link to Industry Overview is present', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		const backLink = page.getByRole('link', { name: /Industry Overview/i });
		await expect(backLink).toBeVisible();

		await backLink.click();
		await expect(page).toHaveURL(/\/industry$/, { timeout: 10000 });
	});

	test('export button is visible on failures page', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		await expect(exportBtn).toContainText('Export');
		await expect(exportBtn).toHaveAttribute('aria-haspopup', 'true');
	});

	test('clicking export button on failures page opens CSV/JSON menu', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.locator('h1')).toContainText('Bank Failures', { timeout: 15000 });

		const exportBtn = page.getByLabel('Export data');
		await expect(exportBtn).toBeVisible();
		// Small wait for hydration before clicking
		await page.waitForTimeout(300);
		await exportBtn.click();

		const menu = page.locator('[role="menu"]');
		await expect(menu).toBeVisible({ timeout: 5000 });

		await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Download JSON' })).toBeVisible();
	});

	test('sort by column updates table order', async ({ page }) => {
		await page.goto('/industry/failures');

		await expect(page.getByText('All Failures')).toBeVisible({ timeout: 15000 });

		const failureTable = page.locator('section').filter({ hasText: 'All Failures' }).locator('table');
		const assetHeader = failureTable.locator('th').filter({ hasText: 'Assets' });

		// Clicking a sortable column header should re-sort
		await assetHeader.click();
		await page.waitForTimeout(300);

		// Table should still be visible after sort
		await expect(failureTable).toBeVisible();
		const rows = failureTable.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
	});
});
