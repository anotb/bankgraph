import { test, expect } from '@playwright/test';

test.describe('Dark mode toggle', () => {
	test('toggle button exists and is accessible', async ({ page }) => {
		await page.goto('/');

		const toggle = page.locator('button[aria-label^="Switch to"]');
		await expect(toggle).toBeVisible();

		const title = await toggle.getAttribute('title');
		expect(title).toBeTruthy();
		expect(title).toMatch(/Switch to (dark|light) mode/);
	});

	test('clicking toggle changes theme', async ({ page }) => {
		await page.goto('/');

		const toggle = page.locator('button[aria-label^="Switch to"]');
		await expect(toggle).toBeVisible();

		// Read current aria-label to know current state
		const label1 = await toggle.getAttribute('aria-label');
		expect(label1).toBeTruthy();

		// Click toggle
		await toggle.click();
		await page.waitForTimeout(300);

		// Label should change (Switch to dark -> Switch to light, or vice versa)
		const label2 = await toggle.getAttribute('aria-label');
		expect(label2).toBeTruthy();
		expect(label2).not.toBe(label1);

		// Click again to toggle back
		await toggle.click();
		await page.waitForTimeout(300);

		const label3 = await toggle.getAttribute('aria-label');
		expect(label3).toBe(label1);
	});
});
