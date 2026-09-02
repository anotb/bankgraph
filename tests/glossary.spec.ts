import { test, expect } from '@playwright/test';

test.describe('Glossary page', () => {
	test('opens with current coverage and source provenance', async ({ page }) => {
		await page.goto('/glossary');
		await expect(page).toHaveTitle(/Data definitions/);
		await expect(page.locator('h1')).toContainText('Data & methods');
		await expect(page.getByText('FDIC reporting period')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Public sources, read directly' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'FDIC BankFind API' })).toBeVisible();
		await expect(page.locator('.macro-table tbody tr')).toHaveCount(14);
	});

	test('searches labels and source identifiers, then combines a category filter', async ({ page }) => {
		await page.goto('/glossary');
		const searchInput = page.getByRole('searchbox', { name: 'Search definitions' });
		await searchInput.fill('NCLNLSR');
		await expect(page.locator('.definition-row')).toHaveCount(1);
		await expect(page.getByText('Noncurrent Loan Ratio', { exact: true })).toBeVisible();

		await searchInput.fill('income');
		await page.getByRole('button', { name: /Performance Ratios/ }).click();
		expect(await page.locator('.definition-row').count()).toBeGreaterThan(0);
		await expect(page.getByRole('heading', { name: 'Performance Ratios' })).toBeVisible();
	});

	test('opens a stable field deep link with its exact provenance', async ({ page }) => {
		await page.goto('/glossary#field-roa');
		const definition = page.locator('#field-roa');
		await expect(definition).toHaveAttribute('open', '');
		await expect(definition.getByText('UBPR2170')).toBeVisible();
		await expect(definition.getByText('Formula')).toBeVisible();
	});

	test('gives a useful recovery when no definition matches', async ({ page }) => {
		await page.goto('/glossary');
		const searchInput = page.getByRole('searchbox', { name: 'Search definitions' });
		await searchInput.fill('xyznonexistentterm123');
		await expect(page.getByText('No definition matches “xyznonexistentterm123”.')).toBeVisible();
		await page.getByRole('button', { name: 'Clear search and filters' }).click();
		expect(await page.locator('.definition-row').count()).toBeGreaterThanOrEqual(20);
	});
});
