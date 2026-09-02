import { test, expect } from '@playwright/test';

test.describe('Economy page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/macro');
	});

	test('loads the analytical surface and its four views', async ({ page }) => {
		await expect(page).toHaveTitle(/Economy/);
		await expect(page.getByRole('heading', { name: 'Economy', level: 1 })).toBeVisible();
		await expect(page.getByText('Trace the rates, prices, employment, and bank balance sheets', { exact: false })).toBeVisible();
		for (const name of ['Overview', 'Series explorer', 'Bank context', 'Sources']) {
			await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
		}
	});

	test('shows an honest empty state or a complete overview', async ({ page }) => {
		const emptyState = page.getByRole('heading', { name: 'Economic series are unavailable' });
		const hasData = !(await emptyState.isVisible().catch(() => false));
		if (!hasData) {
			await expect(page.getByText('The published release does not include direct-agency observations.')).toBeVisible();
			await expect(page.getByRole('link', { name: 'Open readiness status' })).toHaveAttribute('href', '/api/v1/ready');
			return;
		}
		await expect(page.getByRole('heading', { name: 'Latest reported readings' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Rates and the yield curve' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Inflation and unemployment' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Bank credit, loans, and deposits' })).toBeVisible();
	});

	test('changes the time window and opens custom dates when data is loaded', async ({ page }) => {
		test.skip(await page.getByRole('heading', { name: 'Economic series are unavailable' }).isVisible().catch(() => false));
		const oneYear = page.getByRole('button', { name: '1Y', exact: true });
		await oneYear.click();
		await expect(oneYear).toHaveAttribute('aria-pressed', 'true');
		const custom = page.getByRole('button', { name: 'Custom', exact: true });
		await custom.click();
		await expect(custom).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByLabel('From')).toBeVisible();
		await expect(page.getByLabel('To')).toBeVisible();
	});

	test('supports progressively deeper exploration when data is loaded', async ({ page }) => {
		test.skip(await page.getByRole('heading', { name: 'Economic series are unavailable' }).isVisible().catch(() => false));
		await page.getByRole('button', { name: /^Series explorer/ }).click();
		await expect(page.getByRole('combobox', { name: 'First series' })).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Second series' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Aligned relationship check' })).toBeVisible();
		await expect(page.getByText('Minimum to report r')).toBeVisible();
		await page.getByRole('button', { name: /^Bank context/ }).click();
		await expect(page.getByRole('searchbox', { name: 'Bank name, city, state, or certificate' })).toBeVisible();
		await page.getByRole('button', { name: /^Sources/ }).click();
		await expect(page.getByRole('heading', { name: 'Definitions, provenance, and coverage' })).toBeVisible();
		await expect(page.getByRole('table')).toBeVisible();
	});
});
