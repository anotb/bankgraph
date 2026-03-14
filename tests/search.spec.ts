import { test, expect } from '@playwright/test';

test.describe('Search functionality', () => {
	test('typing in search bar shows autocomplete dropdown', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Search by name, city, or state...');
		await expect(searchInput).toBeVisible();

		// Type character by character to trigger input events properly
		await searchInput.click();
		await searchInput.pressSequentially('Chase', { delay: 50 });

		// Wait for autocomplete dropdown (debounce is 300ms + API response time)
		const dropdown = page.locator('[role="listbox"]');
		await expect(dropdown).toBeVisible({ timeout: 10000 });

		// Should have at least one option
		const options = dropdown.locator('[role="option"]');
		await expect(options.first()).toBeVisible({ timeout: 5000 });
	});

	test('selecting an autocomplete result navigates to bank detail', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Search by name, city, or state...');
		await searchInput.click();
		await searchInput.pressSequentially('Chase', { delay: 50 });

		// Wait for results
		const dropdown = page.locator('[role="listbox"]');
		await expect(dropdown).toBeVisible({ timeout: 10000 });

		const firstOption = dropdown.locator('[role="option"]').first();
		await expect(firstOption).toBeVisible({ timeout: 5000 });
		await firstOption.click();

		// Should navigate to a bank detail page
		await expect(page).toHaveURL(/\/banks\/\d+/, { timeout: 10000 });
	});

	test('clear button closes dropdown and resets input', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Search by name, city, or state...');
		await searchInput.click();
		await searchInput.pressSequentially('Wells', { delay: 50 });

		// Wait for dropdown
		const dropdown = page.locator('[role="listbox"]');
		await expect(dropdown).toBeVisible({ timeout: 10000 });

		// Click clear button
		const clearButton = page.getByLabel('Clear search');
		await expect(clearButton).toBeVisible();
		await clearButton.click();

		// Dropdown should be gone
		await expect(dropdown).not.toBeVisible({ timeout: 3000 });

		// Input should be empty
		await expect(searchInput).toHaveValue('');
	});

	test('banks page search shows autocomplete', async ({ page }) => {
		await page.goto('/banks');

		const searchInput = page.getByPlaceholder('Search by name...');
		await expect(searchInput).toBeVisible();

		await searchInput.click();
		await searchInput.pressSequentially('National', { delay: 50 });

		// Wait for autocomplete
		const dropdown = page.locator('[role="listbox"]');
		await expect(dropdown).toBeVisible({ timeout: 10000 });
	});
});
