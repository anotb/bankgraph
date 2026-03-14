import { test, expect } from '@playwright/test';

test.describe('Glossary page', () => {
	test('glossary page loads at /glossary', async ({ page }) => {
		await page.goto('/glossary');
		await expect(page).toHaveTitle(/Glossary/);
		await expect(page.locator('h1')).toContainText('Field Glossary');
	});

	test('shows field definitions with labels and descriptions', async ({ page }) => {
		await page.goto('/glossary');

		// Should have at least one field definition card
		const fieldCards = page.locator('h3');
		await expect(fieldCards.first()).toBeVisible({ timeout: 15000 });

		// Should have multiple fields
		const count = await fieldCards.count();
		expect(count).toBeGreaterThanOrEqual(5);

		// Each card should have a description paragraph
		const descriptions = page.locator('section .rounded-md p');
		await expect(descriptions.first()).toBeVisible({ timeout: 15000 });
	});

	test('search filter narrows results', async ({ page }) => {
		await page.goto('/glossary');

		const searchInput = page.getByPlaceholder('Search fields...');
		await expect(searchInput).toBeVisible({ timeout: 15000 });

		// Count total fields before search
		const allFields = page.locator('section h3');
		await expect(allFields.first()).toBeVisible({ timeout: 15000 });
		const totalCount = await allFields.count();

		// Type a specific term that should match fewer fields
		await searchInput.click();
		await searchInput.fill('Total Assets');

		// Should show the "Showing X of Y terms" text
		const resultCount = page.locator('text=/Showing \\d+ of \\d+ terms/');
		await expect(resultCount).toBeVisible({ timeout: 5000 });

		// Filtered count should be less than total
		const filteredFields = page.locator('section h3');
		const filteredCount = await filteredFields.count();
		expect(filteredCount).toBeLessThan(totalCount);
		expect(filteredCount).toBeGreaterThanOrEqual(1);
	});

	test('search with no results shows empty state', async ({ page }) => {
		await page.goto('/glossary');

		const searchInput = page.getByPlaceholder('Search fields...');
		await expect(searchInput).toBeVisible({ timeout: 15000 });

		await searchInput.fill('xyznonexistentterm123');

		await expect(page.getByText('No fields match your search.')).toBeVisible({ timeout: 5000 });
	});

	test('shows categories for different field types', async ({ page }) => {
		await page.goto('/glossary');

		// Category headings rendered as h2 elements inside sections
		const categoryHeadings = page.locator('section h2');
		await expect(categoryHeadings.first()).toBeVisible({ timeout: 15000 });

		// Should have multiple category groups
		const categoryCount = await categoryHeadings.count();
		expect(categoryCount).toBeGreaterThanOrEqual(3);

		// Check for known category labels
		await expect(page.getByRole('heading', { name: 'Balance Sheet' })).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('heading', { name: 'Performance Ratios' })).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('heading', { name: 'Capital Adequacy' })).toBeVisible({ timeout: 15000 });
	});

	test('field definitions show code keys and optional MDRM badges', async ({ page }) => {
		await page.goto('/glossary');

		// Each field card shows the code key in a <code> element
		const codeKeys = page.locator('section code');
		await expect(codeKeys.first()).toBeVisible({ timeout: 15000 });
		const codeCount = await codeKeys.count();
		expect(codeCount).toBeGreaterThanOrEqual(5);

		// At least one field should have an MDRM badge
		const mdrmBadge = page.locator('text=/MDRM /');
		await expect(mdrmBadge.first()).toBeVisible({ timeout: 15000 });
	});
});
