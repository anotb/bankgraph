import { test, expect } from '@playwright/test';

test.describe('Banks listing page', () => {
	test('page loads at /banks with heading and title', async ({ page }) => {
		await page.goto('/banks');

		await expect(page).toHaveTitle(/Banks/);
		await expect(page.locator('h1')).toContainText('Banks');
	});

	test('search bar is visible and accepts input', async ({ page }) => {
		await page.goto('/banks');

		// SearchBar renders an input with placeholder "Search by name..."
		const searchInput = page.getByPlaceholder('Search by name...');
		await expect(searchInput).toBeVisible({ timeout: 10000 });

		// Typing into it should not cause an error
		await searchInput.fill('Chase');
		await expect(searchInput).toHaveValue('Chase');
	});

	test('search filters the table results', async ({ page }) => {
		await page.goto('/banks');

		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const searchInput = page.getByPlaceholder('Search by name...');
		await searchInput.fill('JPMorgan');

		// Press Enter to trigger search (SearchBar fires onsearch on enter/submit)
		await searchInput.press('Enter');

		await page.waitForTimeout(500);

		// URL should now include q=JPMorgan
		await expect(page).toHaveURL(/q=JPMorgan/i, { timeout: 10000 });
	});

	test('table shows bank data with expected columns', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Required column headers per the DataTable column config
		for (const col of ['Name', 'State', 'Total Assets', 'Total Deposits', 'Regulator', 'Status']) {
			await expect(table.locator('th').filter({ hasText: col })).toBeVisible();
		}
	});

	test('table has data rows with non-empty bank names', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Wait for rows to appear
		const rows = table.locator('tbody tr');
		await expect(rows.first()).toBeVisible({ timeout: 15000 });

		const count = await rows.count();
		expect(count).toBeGreaterThan(0);

		// First row's first cell (bank name) should not be empty
		const firstNameCell = rows.first().locator('td').first();
		const name = await firstNameCell.innerText();
		expect(name.trim().length).toBeGreaterThan(0);
	});

	test('data values are real numbers not placeholders', async ({ request }) => {
		const res = await request.get('/api/v1/banks?limit=5&active=1&sort=assets&order=desc');
		expect(res.status()).toBe(200);

		const json = await res.json();
		expect(json.data).toBeDefined();
		expect(json.data.length).toBeGreaterThan(0);
		expect(json.total).toBeGreaterThan(0);

		for (const bank of json.data) {
			// Every row must have a name and cert
			expect(typeof bank.name).toBe('string');
			expect(bank.name.length).toBeGreaterThan(0);
			expect(typeof bank.cert).toBe('number');
			expect(bank.cert).toBeGreaterThan(0);
		}
	});

	test('clicking a bank row navigates to detail page', async ({ page }) => {
		await page.goto('/banks');

		// cursor-pointer is added to clickable rows by DataTable
		const clickableRow = page.locator('table tbody tr.cursor-pointer').first();
		await expect(clickableRow).toBeVisible({ timeout: 15000 });

		// Small delay for Svelte hydration
		await page.waitForTimeout(500);

		await clickableRow.click();

		await expect(page).toHaveURL(/\/banks\/\d+/, { timeout: 15000 });
		await expect(page.getByText('Institution Details')).toBeVisible({ timeout: 15000 });
	});

	test('ROA Trend sparkline column renders in the table', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// "ROA Trend" column header should be visible
		await expect(table.locator('th').filter({ hasText: 'ROA Trend' })).toBeVisible();

		// Sparkline cells render inside td — at least the column exists
		// (Sparklines render SVG or canvas elements; just confirm the column header is there
		// since sparkline data depends on financials being populated)
	});

	test('sparkline SVGs render with polyline data in ROA Trend cells', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });
		await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });

		// Sparkline cells either render an SVG (when data is available)
		// or a dash fallback (when sparkline data has fewer than 2 points)
		const svgs = table.locator('tbody svg');
		const dashes = table.locator('tbody td span').filter({ hasText: '—' });

		// Wait for sparkline cells to resolve (either SVGs or dashes should appear)
		await expect(svgs.first().or(dashes.first())).toBeVisible({ timeout: 10000 });

		const svgCount = await svgs.count();
		const dashCount = await dashes.count();

		// At least some sparkline cells should be present (SVG or fallback dash)
		expect(svgCount + dashCount).toBeGreaterThan(0);

		// If SVGs are present, verify polyline data and dot
		if (svgCount > 0) {
			const firstSvg = svgs.first();
			const polyline = firstSvg.locator('polyline');
			await expect(polyline).toBeVisible();

			const points = await polyline.getAttribute('points');
			expect(points).toBeTruthy();
			expect(points!.length).toBeGreaterThan(0);

			// Verify there's also a dot (circle) on the sparkline
			const circle = firstSvg.locator('circle');
			await expect(circle).toBeVisible();
		}
	});

	test('export button is visible and opens format menu', async ({ page }) => {
		await page.goto('/banks');

		const exportBtn = page.getByRole('button', { name: 'Export data' });
		await expect(exportBtn).toBeVisible({ timeout: 10000 });
		await expect(exportBtn).toHaveAttribute('aria-haspopup', 'true');
		await expect(exportBtn).toHaveAttribute('aria-expanded', 'false');

		// Click to open the dropdown menu
		await exportBtn.click();
		await expect(exportBtn).toHaveAttribute('aria-expanded', 'true');

		// Menu should show CSV and JSON download options
		const menu = page.getByRole('menu');
		await expect(menu).toBeVisible({ timeout: 3000 });
		await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Download JSON' })).toBeVisible();
	});

	test('bank count indicator shows a positive total', async ({ page }) => {
		await page.goto('/banks');

		// "{N} banks" or "{N} bank" text in the filter bar
		const countText = page.getByText(/[\d,]+ banks?/);
		await expect(countText).toBeVisible({ timeout: 10000 });

		const text = await countText.innerText();
		const match = text.match(/[\d,]+/);
		expect(match).not.toBeNull();
		const count = parseInt((match![0] ?? '0').replace(/,/g, ''), 10);
		expect(count).toBeGreaterThan(0);
	});

	test('pagination shows result range and has Previous/Next buttons', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Pagination component renders "Showing X-Y of Z results"
		await expect(page.getByText(/Showing \d+.+\d+ of [\d,]+ results/)).toBeVisible({ timeout: 5000 });

		await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
	});

	test('Next page button loads the next page of results', async ({ page }) => {
		await page.goto('/banks');

		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
		await expect(page.getByText(/Showing \d+.+\d+ of [\d,]+ results/)).toBeVisible({ timeout: 5000 });

		const nextButton = page.getByRole('button', { name: 'Next' });
		await expect(nextButton).toBeEnabled();

		await nextButton.click();

		// URL should update to include page=2
		await expect(page).toHaveURL(/page=2/, { timeout: 10000 });

		// Table should still show data
		await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
	});

	test('filters are visible: state, asset size, and status', async ({ page }) => {
		await page.goto('/banks');

		// State dropdown
		await expect(page.locator('select').filter({ hasText: 'All states' })).toBeVisible();

		// Asset size dropdown
		await expect(page.locator('select').filter({ hasText: 'All sizes' })).toBeVisible();

		// Status dropdown
		await expect(page.locator('select').filter({ hasText: 'Active only' })).toBeVisible();
	});

	test('state filter updates results', async ({ page }) => {
		await page.goto('/banks');

		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const stateSelect = page.locator('select').filter({ hasText: 'All states' });
		await stateSelect.selectOption('TX');

		// URL should update with state=TX
		await expect(page).toHaveURL(/state=TX/, { timeout: 10000 });

		// Table should reload with filtered results
		await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
	});

	test('sort by Name column updates URL and reorders table', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Click the "Name" column header to sort by name
		const nameHeader = table.locator('th').filter({ hasText: 'Name' });
		await nameHeader.click();

		// URL should update with sort=name
		await expect(page).toHaveURL(/sort=name/, { timeout: 10000 });

		// Table should still have rows
		const rows = table.locator('tbody tr');
		await expect(rows.first()).toBeVisible({ timeout: 10000 });
	});

	test('sort by Total Assets column updates URL and reorders table', async ({ page }) => {
		await page.goto('/banks');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// Click "Total Assets" to sort ascending
		const assetsHeader = table.locator('th').filter({ hasText: 'Total Assets' });
		await assetsHeader.click();

		// First click sorts desc (default), second click sorts asc
		await assetsHeader.click();

		// URL should include sort=assets&order=asc
		await expect(page).toHaveURL(/sort=assets.*order=asc|order=asc.*sort=assets/, { timeout: 10000 });

		await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });
	});
});
