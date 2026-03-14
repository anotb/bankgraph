import { test, expect } from '@playwright/test';

test.describe('Power mode toggle', () => {
	test.beforeEach(async ({ page }) => {
		// Clear localStorage to start in accessible mode
		await page.goto('/banks');
		await page.evaluate(() => localStorage.removeItem('bde-mode'));
		await page.reload();
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
	});

	test('toggle button shows "Power Mode" text in accessible mode', async ({ page }) => {
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await expect(toggleBtn).toBeVisible({ timeout: 10000 });
		await expect(toggleBtn).toContainText('Power Mode');
	});

	test('clicking toggle switches to power mode', async ({ page }) => {
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await expect(toggleBtn).toBeVisible({ timeout: 10000 });

		await toggleBtn.click();

		// Button text should now show "Accessible" (meaning we're in power mode)
		await expect(toggleBtn).toContainText('Accessible');
		await expect(toggleBtn).toHaveAttribute(
			'aria-label',
			/Current mode: power/i
		);
	});

	test('power mode shows extra columns in bank table', async ({ page }) => {
		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// In accessible mode, powerOnly columns should NOT be visible
		await expect(table.locator('th').filter({ hasText: 'ROE' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NIM' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NPL' })).not.toBeVisible();

		// Switch to power mode
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await toggleBtn.click();

		// Power-only columns should now be visible
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 5000 });
		await expect(table.locator('th').filter({ hasText: 'NIM' })).toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NPL' })).toBeVisible();
	});

	test('power mode enables column visibility picker', async ({ page }) => {
		// In accessible mode, no column picker should be visible
		await expect(
			page.getByRole('button', { name: 'Toggle column visibility' })
		).not.toBeVisible();

		// Switch to power mode
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await toggleBtn.click();

		// Column picker gear icon should now be visible
		const colPickerBtn = page.getByRole('button', { name: 'Toggle column visibility' });
		await expect(colPickerBtn).toBeVisible({ timeout: 5000 });
	});

	test('toggling back to accessible mode hides power-only features', async ({ page }) => {
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await expect(toggleBtn).toBeVisible({ timeout: 10000 });

		// Toggle ON
		await toggleBtn.click();
		await expect(toggleBtn).toContainText('Accessible');

		const table = page.locator('table');
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 5000 });

		// Toggle OFF
		await toggleBtn.click();
		await expect(toggleBtn).toContainText('Power Mode');

		// Power-only columns should be hidden again
		await expect(table.locator('th').filter({ hasText: 'ROE' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NIM' })).not.toBeVisible();
	});

	test('power mode persists across navigation', async ({ page }) => {
		// Enable power mode on /banks
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await expect(toggleBtn).toBeVisible({ timeout: 10000 });
		await toggleBtn.click();
		await expect(toggleBtn).toContainText('Accessible');

		// Navigate to /industry
		await page.getByRole('link', { name: 'Industry' }).click();
		await expect(page).toHaveURL(/\/industry/, { timeout: 10000 });
		await expect(page.locator('h1')).toContainText('Industry Overview', { timeout: 15000 });

		// Toggle should still show "Accessible" (meaning power mode is active)
		const toggleAfterNav = page.getByRole('button', { name: /Current mode: power/i });
		await expect(toggleAfterNav).toBeVisible({ timeout: 10000 });
		await expect(toggleAfterNav).toContainText('Accessible');

		// Navigate to /banks and verify power-only columns are still visible
		await page.getByRole('link', { name: 'Banks' }).click();
		await expect(page).toHaveURL(/\/banks/, { timeout: 10000 });

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 5000 });
	});

	test('power mode shows gradient indicator in nav bar', async ({ page }) => {
		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible({ timeout: 10000 });

		// In accessible mode, no gradient bar
		const gradientBar = nav.locator(
			'div.bg-gradient-to-r.from-transparent.via-\\[--accent\\].to-transparent'
		);
		await expect(gradientBar).not.toBeVisible();

		// Switch to power mode
		const toggleBtn = page.getByRole('button', { name: /Current mode: accessible/i });
		await toggleBtn.click();

		// Gradient indicator should appear
		await expect(gradientBar).toBeVisible({ timeout: 5000 });
	});
});
