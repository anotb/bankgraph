import { test, expect } from '@playwright/test';

const COMPARE_URL = '/compare';

// JPMorgan Chase (628) and Bank of America (3510) — well-known, stable FDIC records
const CERT_A = 628;
const CERT_B = 3510;
const URL_WITH_TWO_BANKS = `${COMPARE_URL}?certs=${CERT_A},${CERT_B}`;

test.describe('Compare page', () => {
	test.describe('Empty state', () => {
		test('page loads with correct title and header', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page).toHaveTitle(/Compare/i, { timeout: 15000 });
			await expect(page.locator('h1')).toContainText('Bank Comparison');
		});

		test('shows empty state prompt when no banks selected', async ({ page }) => {
			await page.goto(COMPARE_URL);

			// Counter shows 0/10
			await expect(page.getByText('(0/10)')).toBeVisible({ timeout: 10000 });

			await expect(
				page.getByText('Compare up to 10 banks side-by-side')
			).toBeVisible();
			await expect(
				page.getByText('Start by searching for a bank above, or try a popular comparison')
			).toBeVisible();
		});

		test('shows popular comparison buttons in empty state', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByText('Popular comparisons')).toBeVisible({ timeout: 10000 });

			await expect(
				page.getByRole('button', { name: 'JPMorgan vs Bank of America' })
			).toBeVisible();
			await expect(
				page.getByRole('button', { name: 'Wells Fargo vs Citibank' })
			).toBeVisible();
			await expect(page.getByRole('button', { name: 'Top 4 Banks' })).toBeVisible();
		});

		test('does not show charts or table in empty state', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByText('(0/10)')).toBeVisible({ timeout: 10000 });

			await expect(page.getByText('Comparison Charts')).not.toBeVisible();
			await expect(page.getByText('Latest Quarter Comparison')).not.toBeVisible();
		});
	});

	test.describe('Search autocomplete', () => {
		test('search input is present and accepts text', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await expect(input).toBeVisible({ timeout: 10000 });
			await expect(input).toBeEnabled();

			await input.fill('Chase');
			await expect(input).toHaveValue('Chase');
		});

		test('dropdown does not appear for a single character', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('J');

			await expect(page.getByRole('listbox')).not.toBeVisible();
		});

		test('dropdown appears after typing 2+ characters', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JP');

			const dropdown = page.getByRole('listbox');
			await expect(dropdown).toBeVisible({ timeout: 5000 });
		});

		test('autocomplete shows bank results for a known name', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JPMorgan');

			const dropdown = page.getByRole('listbox');
			await expect(dropdown).toBeVisible({ timeout: 5000 });

			// Either results or "No results" — both are valid loaded states
			const hasResults = dropdown.getByRole('option').first();
			const noResults = dropdown.getByText('No results');
			await expect(hasResults.or(noResults)).toBeVisible({ timeout: 15000 });
		});

		test('clear button appears when input has text and clears it', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('Chase');

			const clearBtn = page.getByRole('button', { name: 'Clear search' });
			await expect(clearBtn).toBeVisible({ timeout: 5000 });

			await clearBtn.click();
			await expect(input).toHaveValue('');
			await expect(clearBtn).not.toBeVisible();
		});

		test('Escape key closes the dropdown', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('Chase');

			const dropdown = page.getByRole('listbox');
			await expect(dropdown).toBeVisible({ timeout: 5000 });

			await input.press('Escape');
			await expect(dropdown).not.toBeVisible();
		});

		test('keyboard arrow navigation highlights options', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JPMorgan');

			const dropdown = page.getByRole('listbox');
			await expect(dropdown).toBeVisible({ timeout: 5000 });

			// Wait for options to load
			const firstOption = dropdown.getByRole('option').first();
			await expect(firstOption).toBeVisible({ timeout: 15000 });

			await input.press('ArrowDown');
			// First option should now be highlighted (aria-selected true)
			await expect(firstOption).toHaveAttribute('aria-selected', 'true');
		});
	});

	test.describe('Adding banks', () => {
		test('adding one bank shows chip and updates counter', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JPMorgan');

			const dropdown = page.getByRole('listbox');
			const firstOption = dropdown.getByRole('option').first();
			await expect(firstOption).toBeVisible({ timeout: 15000 });
			await firstOption.click();

			// Counter updated to 1
			await expect(page.getByText('(1/10)')).toBeVisible({ timeout: 5000 });

			// Empty state copy shifts to "Add one more"
			await expect(page.getByText('Add one more bank to start comparing')).toBeVisible();
		});

		test('selected bank appears as a chip with a remove button', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JPMorgan');

			const dropdown = page.getByRole('listbox');
			const firstOption = dropdown.getByRole('option').first();
			await expect(firstOption).toBeVisible({ timeout: 15000 });
			await firstOption.click();

			// A remove button for the added bank should appear
			const removeButtons = page.getByRole('button', { name: /^Remove / });
			await expect(removeButtons).toHaveCount(1, { timeout: 5000 });
		});

		test('adding two banks triggers comparison data load', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			// Counter should reflect 2 selected banks
			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });

			// Loading state transitions to charts
			const loadingMsg = page.getByText('Loading comparison data...');
			const chartsHeading = page.getByText('Comparison Charts');
			await expect(loadingMsg.or(chartsHeading)).toBeVisible({ timeout: 20000 });
			await expect(chartsHeading).toBeVisible({ timeout: 30000 });
		});

		test('"Clear all" button appears when banks are selected', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });
			await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible({
				timeout: 10000
			});
		});
	});

	test.describe('Metric pills', () => {
		test('all 8 metric pills are visible', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			for (const label of [
				'ROA',
				'ROE',
				'NIM',
				'Efficiency Ratio',
				'NPL Ratio',
				'Capital Ratio',
				'Assets',
				'Deposits'
			]) {
				await expect(page.getByRole('button', { name: label })).toBeVisible();
			}
		});

		test('ROA, ROE, NIM are selected by default', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			for (const label of ['ROA', 'ROE', 'NIM']) {
				const btn = page.getByRole('button', { name: label });
				await expect(btn).toHaveClass(/bg-\[--accent\]/);
			}
		});

		test('non-default metric pills are not selected by default', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			for (const label of ['Assets', 'Deposits', 'Capital Ratio']) {
				const btn = page.getByRole('button', { name: label });
				await expect(btn).not.toHaveClass(/bg-\[--accent\] text-white/);
			}
		});

		test('clicking a deselected metric pill selects it', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			const assetsBtn = page.getByRole('button', { name: 'Assets' });
			await expect(assetsBtn).not.toHaveClass(/bg-\[--accent\] text-white/);

			await assetsBtn.click();
			await expect(assetsBtn).toHaveClass(/bg-\[--accent\]/);
		});

		test('clicking a selected metric pill deselects it when others remain', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			// ROA is selected by default; deselect it (ROE and NIM still remain)
			const roaBtn = page.getByRole('button', { name: 'ROA' });
			await expect(roaBtn).toHaveClass(/bg-\[--accent\]/);

			await roaBtn.click();
			await expect(roaBtn).not.toHaveClass(/bg-\[--accent\] text-white/);
		});

		test('cannot deselect the last remaining metric', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 10000 });

			// Deselect ROE and NIM, leaving only ROA
			await page.getByRole('button', { name: 'ROE' }).click();
			await page.getByRole('button', { name: 'NIM' }).click();

			const roaBtn = page.getByRole('button', { name: 'ROA' });
			// Attempt to deselect the last one — it should stay selected
			await roaBtn.click();
			await expect(roaBtn).toHaveClass(/bg-\[--accent\]/);
		});
	});

	test.describe('Charts', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);
			await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 30000 });
		});

		test('Comparison Charts section heading is visible', async ({ page }) => {
			const chartsSection = page.locator('section').filter({
				has: page.getByRole('heading', { name: 'Comparison Charts' })
			});
			await expect(chartsSection).toBeVisible();
		});

		test('chart cards are rendered for each selected metric', async ({ page }) => {
			// Default: ROA, ROE, NIM
			for (const label of ['ROA', 'ROE', 'NIM']) {
				await expect(page.getByRole('heading', { name: label, level: 3 })).toBeVisible();
			}
		});

		test('ECharts canvas elements are present', async ({ page }) => {
			const canvases = page.locator('canvas');
			await expect(canvases.first()).toBeVisible({ timeout: 10000 });
			expect(await canvases.count()).toBeGreaterThanOrEqual(1);
		});

		test('date range buttons are shown when data loads', async ({ page }) => {
			await expect(page.getByText('Period:')).toBeVisible();

			// DateRangePicker presets: 4Q, 8Q, 5Y, 10Y, All, Custom
			for (const range of ['4Q', '8Q', '5Y', '10Y', 'All']) {
				await expect(page.getByRole('button', { name: range, exact: true })).toBeVisible();
			}
		});

		test('10Y is the default selected date range', async ({ page }) => {
			const btn10Y = page.getByRole('button', { name: '10Y', exact: true });
			await expect(btn10Y).toHaveClass(/bg-\[--accent\]/);
		});

		test('clicking a different date range button selects it', async ({ page }) => {
			const btn5Y = page.getByRole('button', { name: '5Y', exact: true });
			await btn5Y.click();
			await expect(btn5Y).toHaveClass(/bg-\[--accent\]/);

			const btn10Y = page.getByRole('button', { name: '10Y', exact: true });
			await expect(btn10Y).not.toHaveClass(/bg-\[--accent\] text-white/);
		});

		test('Custom button reveals start and end quarter selects', async ({ page }) => {
			const customBtn = page.getByRole('button', { name: 'Custom', exact: true });
			await expect(customBtn).toBeVisible();

			await customBtn.click();
			await expect(customBtn).toHaveClass(/bg-\[--accent\]/);

			// Two select elements should appear with proper aria-labels
			const startSelect = page.getByLabel('Start quarter');
			const endSelect = page.getByLabel('End quarter');
			await expect(startSelect).toBeVisible({ timeout: 5000 });
			await expect(endSelect).toBeVisible({ timeout: 5000 });
		});

		test('adding a metric via pill shows a new chart card', async ({ page }) => {
			// Assets is not selected by default
			await expect(
				page.getByRole('heading', { name: 'Assets', level: 3 })
			).not.toBeVisible();

			await page.getByRole('button', { name: 'Assets' }).click();

			await expect(page.getByRole('heading', { name: 'Assets', level: 3 })).toBeVisible({
				timeout: 5000
			});
		});

		test('deselecting a metric removes its chart card', async ({ page }) => {
			// ROA chart is visible by default
			await expect(page.getByRole('heading', { name: 'ROA', level: 3 })).toBeVisible();

			await page.getByRole('button', { name: 'ROA' }).click();

			await expect(
				page.getByRole('heading', { name: 'ROA', level: 3 })
			).not.toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Comparison table', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);
			await expect(page.getByText('Latest Quarter Comparison')).toBeVisible({
				timeout: 30000
			});
		});

		test('table is visible with a Metric column header', async ({ page }) => {
			const table = page.locator('table');
			await expect(table).toBeVisible();
			await expect(table.getByText('Metric', { exact: true })).toBeVisible();
		});

		test('table header includes two bank name links', async ({ page }) => {
			const thead = page.locator('thead');
			const bankLinks = thead.getByRole('link');
			await expect(bankLinks).toHaveCount(2);
		});

		test('bank name links in header navigate to bank detail pages', async ({ page }) => {
			const thead = page.locator('thead');
			const firstBankLink = thead.getByRole('link').first();
			const href = await firstBankLink.getAttribute('href');
			expect(href).toMatch(/^\/banks\/\d+$/);
		});

		test('table body has rows for each selected metric', async ({ page }) => {
			const tbody = page.locator('tbody');
			// Default metrics: ROA, ROE, NIM (use first() since delta rows may duplicate names)
			await expect(tbody.getByText('ROA').first()).toBeVisible();
			await expect(tbody.getByText('ROE').first()).toBeVisible();
			await expect(tbody.getByText('NIM').first()).toBeVisible();
		});

		test('delta row is present when exactly 2 banks are selected', async ({ page }) => {
			await expect(page.getByText(/^Delta\s*\(/)).toBeVisible();
		});

		test('export button is visible when comparison data loads', async ({ page }) => {
			const exportBtn = page.getByLabel('Export data');
			await expect(exportBtn).toBeVisible();
		});
	});

	test.describe('Removing banks', () => {
		test('removing a bank updates the chip counter', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });

			const firstRemoveBtn = page.getByRole('button', { name: /^Remove / }).first();
			await firstRemoveBtn.click();

			await expect(page.getByText('(1/10)')).toBeVisible({ timeout: 5000 });
		});

		test('removing one of two banks shows "add one more" prompt', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });

			const firstRemoveBtn = page.getByRole('button', { name: /^Remove / }).first();
			await firstRemoveBtn.click();

			await expect(page.getByText('Add one more bank to start comparing')).toBeVisible({
				timeout: 5000
			});
		});

		test('"Clear all" removes all banks and returns to empty state', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 30000 });

			await page.getByRole('button', { name: 'Clear all' }).click();

			await expect(page.getByText('Comparison Charts')).not.toBeVisible({ timeout: 5000 });
			await expect(page.getByText('Compare up to 10 banks side-by-side')).toBeVisible();
			await expect(page.getByText('(0/10)')).toBeVisible();
		});

		test('remove button disappears once the last bank is cleared', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });

			await page.getByRole('button', { name: 'Clear all' }).click();

			await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0, {
				timeout: 5000
			});
		});
	});

	test.describe('URL params', () => {
		test('certs param pre-selects the specified banks on load', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			// Two banks loaded without any user interaction
			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });
			await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2, {
				timeout: 15000
			});
		});

		test('direct navigation with certs param loads comparison data', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			const loadingOrCharts = page
				.getByText('Loading comparison data...')
				.or(page.getByText('Comparison Charts'));

			await expect(loadingOrCharts).toBeVisible({ timeout: 20000 });
			await expect(page.getByText('Comparison Charts')).toBeVisible({ timeout: 30000 });
		});

		test('URL is updated when a bank is added via search', async ({ page }) => {
			await page.goto(COMPARE_URL);

			const input = page.getByPlaceholder('Search banks by name or cert...');
			await input.fill('JPMorgan');

			const dropdown = page.getByRole('listbox');
			const firstOption = dropdown.getByRole('option').first();
			await expect(firstOption).toBeVisible({ timeout: 15000 });
			await firstOption.click();

			// URL should now contain certs param
			await expect(page).toHaveURL(/[?&]certs=\d+/, { timeout: 5000 });
		});

		test('URL is cleared when all banks are removed', async ({ page }) => {
			await page.goto(URL_WITH_TWO_BANKS);

			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });

			await page.getByRole('button', { name: 'Clear all' }).click();

			// certs param should no longer appear in the URL
			await expect(page).not.toHaveURL(/certs=/, { timeout: 5000 });
		});

		test('popular comparison button loads banks and updates URL', async ({ page }) => {
			await page.goto(COMPARE_URL);

			await expect(
				page.getByRole('button', { name: 'JPMorgan vs Bank of America' })
			).toBeVisible({ timeout: 10000 });

			await page.getByRole('button', { name: 'JPMorgan vs Bank of America' }).click();

			await expect(page).toHaveURL(/[?&]certs=628(,|%2C)3510/, { timeout: 15000 });
			await expect(page.getByText('(2/10)')).toBeVisible({ timeout: 20000 });
		});
	});
});
