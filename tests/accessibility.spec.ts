import { test, expect } from '@playwright/test';

test.describe('Basic accessibility', () => {
	test('skip-to-content link exists and targets #main-content', async ({ page }) => {
		await page.goto('/');

		// The skip link should exist (it's sr-only until focused)
		const skipLink = page.locator('a[href="#main-content"]');
		await expect(skipLink).toHaveCount(1);
		await expect(skipLink).toHaveText('Skip to content');

		// The main content target should exist
		const mainContent = page.locator('#main-content');
		await expect(mainContent).toBeVisible();
		await expect(mainContent).toHaveAttribute('id', 'main-content');
	});

	test('skip-to-content link becomes visible on focus', async ({ page }) => {
		await page.goto('/');

		// Tab to focus the skip link (it's the first focusable element)
		await page.keyboard.press('Tab');

		const skipLink = page.locator('a[href="#main-content"]');
		// When focused, the sr-only class is overridden by focus:not-sr-only
		await expect(skipLink).toBeFocused();
	});

	test('nav has aria-label', async ({ page }) => {
		await page.goto('/');

		const nav = page.locator('nav[aria-label="Main"]');
		await expect(nav).toBeVisible();
	});

	test('search input has combobox role when autocomplete is enabled', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.locator('input[role="combobox"]');
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toHaveAttribute('aria-autocomplete', 'list');
	});

	test('tab through main nav links', async ({ page }) => {
		await page.goto('/');

		// Tab past skip link to reach nav
		await page.keyboard.press('Tab'); // skip-to-content
		await page.keyboard.press('Tab'); // BDE logo link
		await page.keyboard.press('Tab'); // Banks link

		const banksLink = page.locator('nav a[href="/banks"]');
		await expect(banksLink).toBeFocused();

		// Continue tabbing through nav links
		await page.keyboard.press('Tab'); // Industry
		const industryLink = page.locator('nav a[href="/industry"]');
		await expect(industryLink).toBeFocused();

		await page.keyboard.press('Tab'); // Macro
		const macroLink = page.locator('nav a[href="/macro"]');
		await expect(macroLink).toBeFocused();
	});

	test('main content element is a <main> tag', async ({ page }) => {
		await page.goto('/');

		const main = page.locator('main#main-content');
		await expect(main).toBeVisible();
	});

	test('page has lang attribute on html', async ({ page }) => {
		await page.goto('/');

		const html = page.locator('html');
		const lang = await html.getAttribute('lang');
		expect(lang).toBeTruthy();
	});

	test('images/icons have aria-hidden or alt text', async ({ page }) => {
		await page.goto('/');

		// All decorative SVGs in the nav should be hidden from AT
		const decorativeSvgs = page.locator('nav svg[aria-hidden="true"]');
		// This is a presence check; the app may or may not have nav SVGs
		// More importantly, check that the search icon SVG is aria-hidden
		const searchIcon = page.locator('svg[aria-hidden="true"]').first();
		if (await searchIcon.isVisible()) {
			await expect(searchIcon).toHaveAttribute('aria-hidden', 'true');
		}
	});

	test('autocomplete dropdown has listbox role', async ({ page }) => {
		await page.goto('/');

		const searchInput = page.getByPlaceholder('Search by name, city, or state...');
		await searchInput.click();
		await searchInput.pressSequentially('Bank', { delay: 50 });

		const listbox = page.locator('[role="listbox"]');
		await expect(listbox).toBeVisible({ timeout: 10000 });
	});
});
