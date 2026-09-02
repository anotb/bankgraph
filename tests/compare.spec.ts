import { expect, test } from '@playwright/test';

const COMPARE_URL = '/compare';
const TWO_BANKS = '/compare?certs=628,3510';

test.describe('Quick bank comparison', () => {
	test('starts with a real bank finder and current-data comparisons', async ({ page }) => {
		await page.goto(COMPARE_URL);

		await expect(page).toHaveTitle('Quick bank comparison | Bankgraph');
		await expect(page.getByRole('heading', { name: 'Quick bank comparison' })).toBeVisible();
		await expect(page.getByLabel('Add a bank')).toBeVisible();
		await expect(page.getByText('0 of 10 selected')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Start with a useful comparison' })).toBeVisible();
		await expect(page.getByRole('button', { name: /vs/ }).first()).toBeVisible();
	});

	test('bank finder supports keyboard selection and removal', async ({ page }) => {
		await page.goto(COMPARE_URL);
		const finder = page.getByLabel('Add a bank');
		await finder.fill('JPMorgan');
		const firstResult = page.getByRole('option').first();
		await expect(firstResult).toBeVisible();
		await finder.press('ArrowDown');
		await finder.press('Enter');

		await expect(page.getByText('1 of 10 selected')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1);
		await expect(page).toHaveURL(/certs=\d+/);
	});

	test('serializes banks, measures, and period in the comparison URL', async ({ page }) => {
		await page.goto('/compare?certs=628,3510&metrics=asset,nclnlsr&from=20240331&to=20260630');

		await expect(page.getByText('2 of 10 selected')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Assets/ })).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: /^Noncurrent loans/ })).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/metrics=asset(%2C|,)nclnlsr/);
		await expect(page).toHaveURL(/from=20240331/);
		await expect(page).toHaveURL(/to=20260630/);
	});

	test('shows a horizontally navigable snapshot and one linked history', async ({ page }) => {
		await page.goto(TWO_BANKS);

		await expect(page.getByRole('heading', { name: 'Latest report in the selected period' })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('region', { name: 'Scrollable latest-report comparison' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: /Difference/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Return on assets over time' })).toBeVisible();
		await expect(page.getByRole('region', { name: /Scrollable quarterly values/ })).toBeVisible();
		await expect(page.locator('canvas').first()).toBeVisible();
	});

	test('focuses a measure from the matrix without changing the bank selection', async ({ page }) => {
		await page.goto(TWO_BANKS);
		await expect(page.getByRole('heading', { name: 'Return on assets over time' })).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: /Net interest margin NIMY/ }).click();
		await expect(page.getByRole('heading', { name: 'Net interest margin over time' })).toBeVisible();
		await expect(page.getByText('2 of 10 selected')).toBeVisible();
	});

	test('explains share state and carries the selection into Research', async ({ page }) => {
		await page.goto(TWO_BANKS);
		await expect(page.getByRole('heading', { name: 'Latest report in the selected period' })).toBeVisible({ timeout: 30_000 });

		await expect(page.getByText('This link includes the selected banks, measures, and period.')).toBeVisible();
		const workspace = page.getByRole('link', { name: 'Open full research workspace' }).first();
		await expect(workspace).toHaveAttribute('href', /^\/b\?ws=/);
	});

	test('keeps primary controls usable on a narrow screen', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(TWO_BANKS);
		await expect(page.getByRole('heading', { name: 'Latest report in the selected period' })).toBeVisible({ timeout: 30_000 });

		await expect(page.getByLabel('Add a bank')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
		await expect(page.getByRole('region', { name: 'Scrollable latest-report comparison' })).toBeVisible();
	});
});
