import { test, expect } from '@playwright/test';

test.describe('Search functionality', () => {
	test('search bar is visible on landing page', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Name, city, state, or FDIC certificate');
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toHaveAttribute('role', 'combobox');
	});

	test('typing triggers autocomplete dropdown', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Name, city, state, or FDIC certificate');
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

	test('autocomplete shows results with bank name, state, and CERT', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Name, city, state, or FDIC certificate');
		await searchInput.click();
		await searchInput.pressSequentially('jpmorgan', { delay: 50 });

		// Wait for results
		const dropdown = page.locator('[role="listbox"]');
		await expect(dropdown).toBeVisible({ timeout: 10000 });

		const firstOption = dropdown.locator('[role="option"]').first();
		await expect(firstOption).toBeVisible({ timeout: 5000 });

		// Each option has: bank name (left) + "STATE · CERT" (right)
		const optionText = await firstOption.textContent();
		expect(optionText).toBeTruthy();
		// Should contain a middot separator between state and cert
		expect(optionText).toMatch(/·/);
		// Should contain a number (the CERT)
		expect(optionText).toMatch(/\d+/);
	});

	test('selecting an autocomplete result navigates to /banks/{cert}', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Name, city, state, or FDIC certificate');
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

	test('search API returns results for query', async ({ request }) => {
		const res = await request.get('/api/v1/banks?q=chase&active=all&limit=8');
		expect(res.status()).toBe(200);

		const json = await res.json();
		expect(json.data).toBeDefined();
		expect(Array.isArray(json.data)).toBe(true);
		expect(json.data.length).toBeGreaterThan(0);

		// Each result should have name and cert
		const first = json.data[0];
		expect(first.name).toBeTruthy();
		expect(first.cert).toBeTruthy();
		expect(typeof first.cert).toBe('number');
	});

	test('search API resolves an exact FDIC certificate', async ({ request }) => {
		const res = await request.get('/api/v1/banks?q=628&active=all&limit=8');
		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.data[0]?.cert).toBe(628);
	});

	test('clear button closes dropdown and resets input', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Name, city, state, or FDIC certificate');
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
