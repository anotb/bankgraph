import { test, expect } from '@playwright/test';

const BANK_URL = '/banks/900001';

async function openBank(page: import('@playwright/test').Page, path = '') {
	await page.goto(`${BANK_URL}${path}`);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('CI North Bank', {
		timeout: 20_000
	});
}

test.describe('Bank profile', () => {
	test('keeps identity, provenance, and working analysis actions together', async ({ page }) => {
		await openBank(page);

		await expect(page.getByText('CERT 900001', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('Latest report')).toBeVisible();
		await expect(page.getByRole('link', { name: /FDIC BankFind/ })).toHaveAttribute(
			'href',
			'https://banks.data.fdic.gov/bankfind-suite/institutiondetails/900001'
		);
		await expect(page.getByRole('link', { name: /Open in research/ })).toHaveAttribute(
			'href',
			/ws=/
		);
		await expect(page.getByRole('button', { name: /watchlist/ })).toHaveAttribute(
			'aria-pressed',
			/true|false/
		);
	});

	test('uses ordinary links for the four profile sections and marks the current page', async ({ page }) => {
		await openBank(page);
		const nav = page.getByRole('navigation', { name: 'Bank profile sections' });
		for (const label of ['Overview', 'Financial history', 'Peer context', 'Financial condition']) {
			await expect(nav.getByRole('link', { name: label })).toBeVisible();
		}
		await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
		await nav.getByRole('link', { name: 'Peer context' }).click();
		await expect(page).toHaveURL(/\/banks\/900001\/peers$/);
		await expect(nav.getByRole('link', { name: 'Peer context' })).toHaveAttribute('aria-current', 'page');
	});

	test('links the selected overview measure to its history and peer context', async ({ page }) => {
		await openBank(page);
		const measures = page.locator('.metric-strip[aria-label="Reported measures"]');
		const deposits = measures.getByRole('button', { name: /Deposits/ });
		await deposits.click();
		await expect(deposits).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.focus-chart').getByRole('heading', { name: 'Deposits' })).toBeVisible();
		await expect(page.getByRole('complementary', { name: /Peer context for Deposits/ })).toBeVisible();
	});

	test('shows an exact, scrollable quarterly record and a sourced institution record', async ({ page }) => {
		await openBank(page);
		const tableRegion = page.getByRole('region', { name: 'Scrollable quarterly financial table' });
		await expect(tableRegion).toHaveAttribute('tabindex', '0');
		const table = tableRegion.getByRole('table');
		await expect(table.getByRole('columnheader', { name: 'Noncurrent loans' })).toBeVisible();
		const rows = table.locator('tbody tr');
		expect(await rows.count()).toBeGreaterThanOrEqual(1);
		expect(await rows.count()).toBeLessThanOrEqual(8);
		await expect(page.getByRole('heading', { name: 'Institution record' })).toBeVisible();
		await expect(page.getByText('FDIC BankFind Suite and quarterly Call Report data')).toBeVisible();
	});

	test('financial history keeps field, period, chart, table, and export controls on one live selection', async ({ page }) => {
		await openBank(page, '/financials');
		await expect(page.getByRole('heading', { name: 'Financial history' })).toBeVisible();
		await expect(page.getByText(/\d+ quarters available/)).toBeVisible();
		await expect(page.getByRole('button', { name: /metrics? selected/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Export data' })).toBeVisible();
		await page.getByRole('button', { name: 'Exact table' }).click();
		await expect(page.getByRole('heading', { name: 'Exact reported values' })).toBeVisible();
		await expect(page.getByRole('table')).toBeVisible();
	});

	test('peer context discloses cohort construction, distributions, and exact ranks', async ({ page }) => {
		await openBank(page, '/peers');
		await expect(page.getByRole('heading', { name: 'Peer context' })).toBeVisible();
		await expect(page.getByText('Population', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Position within the cohort' })).toBeVisible();
		await expect(page.getByText(/not assessments of quality/)).toBeVisible();
		const table = page.getByRole('region', { name: 'Scrollable peer comparison table' }).getByRole('table');
		await expect(table.getByRole('columnheader', { name: 'Usable N' })).toBeVisible();
		expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(4);
	});

	test('financial condition separates disclosed indicators from supervisory conclusions', async ({ page }) => {
		await openBank(page, '/risk');
		const indicators = page.getByRole('heading', { name: 'Financial condition indicators' });
		const empty = page.getByText('No financial condition indicators available');
		await expect(indicators.or(empty).first()).toBeVisible();
		if (await indicators.isVisible()) {
			await expect(page.getByText('Capital-ratio reference screen')).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Component evidence' })).toBeVisible();
			await expect(page.getByText(/not supervisory ratings, credit ratings, or predictions of failure/)).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Reported-data signals' })).toBeVisible();
		} else {
			await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
		}
	});

	test('keeps the profile usable on a narrow viewport without moving tables into the page flow', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openBank(page);
		await expect(page.getByRole('navigation', { name: 'Bank profile sections' })).toBeVisible();
		await expect(page.getByRole('link', { name: /Open in research/ })).toBeVisible();
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflow).toBeLessThanOrEqual(2);
	});
});

test.describe('Bank profile errors', () => {
	test('gives an actionable 404 for an unknown institution', async ({ page }) => {
		const response = await page.goto('/banks/999999999');
		expect(response?.status()).toBe(404);
		const alert = page.getByRole('alert');
		await expect(alert.getByText('404', { exact: true })).toBeVisible();
		await expect(alert.getByRole('heading', { name: 'Page not found' })).toBeVisible();
		await expect(alert.getByRole('button', { name: 'Go back' })).toBeVisible();
		await expect(alert.getByRole('link', { name: 'Go home' })).toBeVisible();
	});
});
