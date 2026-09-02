import { test, expect } from '@playwright/test';

// The ModeToggle has aria-label="Current mode: {mode}. Switch to {other} mode"
function modeToggleBtn(page: import('@playwright/test').Page) {
	return page.getByRole('button', { name: /Current mode:/i });
}

// Click the toggle and verify it actually switched by waiting for the button text to change
async function enablePowerMode(page: import('@playwright/test').Page) {
	const btn = modeToggleBtn(page);
	await expect(btn).toContainText('Power Mode', { timeout: 10000 });
	// Small delay for Svelte hydration to attach onclick handler
	await page.waitForTimeout(500);
	await btn.click();
	await expect(btn).toContainText('Accessible', { timeout: 10000 });
}

test.describe('Power mode toggle', () => {
	test.beforeEach(async ({ page }) => {
		// Clear localStorage to ensure accessible mode, then load /banks
		await page.goto('/banks');
		await page.evaluate(() => localStorage.removeItem('bde-mode'));
		await page.reload();
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
		await expect(modeToggleBtn(page)).toBeVisible({ timeout: 10000 });
	});

	test('toggle button shows "Power Mode" text in accessible mode', async ({ page }) => {
		const btn = modeToggleBtn(page);
		await expect(btn).toContainText('Power Mode');
		await expect(btn).toHaveAttribute('title', /Switch to Power mode/i);
	});

	test('clicking toggle switches to power mode', async ({ page }) => {
		await enablePowerMode(page);

		const btn = modeToggleBtn(page);
		await expect(btn).toContainText('Accessible');
		await expect(btn).toHaveAttribute('title', /Switch to Accessible mode/i);
	});

	test('power mode shows extra columns in bank table', async ({ page }) => {
		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });

		// In accessible mode, powerOnly columns should NOT be visible
		await expect(table.locator('th').filter({ hasText: 'ROE' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NIM' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'Noncurrent loans' })).not.toBeVisible();

		// Switch to power mode
		await enablePowerMode(page);

		// Power-only columns should now be visible
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 10000 });
		await expect(table.locator('th').filter({ hasText: 'NIM' })).toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'Noncurrent loans' })).toBeVisible();
	});

	test('power mode enables column visibility picker', async ({ page }) => {
		// In accessible mode, no column picker
		await expect(
			page.getByRole('button', { name: 'Toggle column visibility' })
		).not.toBeVisible();

		// Switch to power mode
		await enablePowerMode(page);

		// Column picker gear icon should appear
		await expect(
			page.getByRole('button', { name: 'Toggle column visibility' })
		).toBeVisible({ timeout: 10000 });
	});

	test('toggling back to accessible mode hides power-only features', async ({ page }) => {
		// Toggle ON
		await enablePowerMode(page);

		const table = page.locator('table');
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 10000 });

		// Toggle OFF
		const btn = modeToggleBtn(page);
		await btn.click();
		await expect(btn).toContainText('Power Mode', { timeout: 10000 });

		// Power-only columns should be hidden again
		await expect(table.locator('th').filter({ hasText: 'ROE' })).not.toBeVisible();
		await expect(table.locator('th').filter({ hasText: 'NIM' })).not.toBeVisible();
	});

	test('power mode persists across navigation', async ({ page }) => {
		// Enable power mode on /banks
		await enablePowerMode(page);

		// Navigate to /industry
		await page.getByRole('link', { name: 'Banking system' }).click();
		await expect(page).toHaveURL(/\/industry/, { timeout: 10000 });
		await expect(page.locator('h1')).toContainText('Banking system', { timeout: 15000 });

		// Toggle should still show "Accessible" (power mode persisted)
		await expect(modeToggleBtn(page)).toContainText('Accessible', { timeout: 10000 });

		// Navigate back to /banks and verify power-only columns are still visible
		await page.getByRole('link', { name: /Discover/ }).click();
		await expect(page).toHaveURL(/\/banks/, { timeout: 10000 });

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 10000 });
		await expect(table.locator('th').filter({ hasText: 'ROE' })).toBeVisible({ timeout: 10000 });
	});

	test('power mode shows gradient indicator in nav bar', async ({ page }) => {
		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible({ timeout: 10000 });

		// In accessible mode, no gradient bar (it's a 1px div only rendered in power mode)
		const gradientBar = nav.locator('.h-\\[1px\\]');
		await expect(gradientBar).not.toBeVisible();

		// Switch to power mode
		await enablePowerMode(page);

		// Gradient indicator should appear
		await expect(gradientBar).toBeVisible({ timeout: 10000 });
	});
});
