import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_STORAGE_KEY = 'bankgraph-workspace-v1';
const LAYOUT_STORAGE_KEY = 'atlas.layout.v1';
const THEME_STORAGE_KEY = 'atlas.night';

async function expectNoDocumentOverflow(page: Page) {
	const widths = await page.evaluate(() => ({
		viewport: document.documentElement.clientWidth,
		document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
	}));
	expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

function boardViews(page: Page) {
	return page.locator('article[data-block]');
}

async function openOneBankBoard(page: Page) {
	await page.goto('/b?template=one_bank&certs=900001');
	await expect(page.getByRole('textbox', { name: 'Board question' })).toBeVisible();
	await expect(boardViews(page)).toHaveCount(5);
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(({ workspace, layout, theme }) => {
		localStorage.removeItem(workspace);
		localStorage.removeItem(layout);
		localStorage.setItem(theme, '0');
	}, { workspace: WORKSPACE_STORAGE_KEY, layout: LAYOUT_STORAGE_KEY, theme: THEME_STORAGE_KEY });
});

test('the public product opens a blank board and its primary routes share the Atlas shell', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Bankgraph home' })).toBeVisible();
	await page.getByRole('link', { name: 'Blank board' }).first().click();
	await expect(page).toHaveURL('/b');
	await expect(page.getByRole('textbox', { name: 'Board question' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Start with a bank or a cohort' })).toBeVisible();
	await page.getByRole('button', { name: /^One bank/ }).click();
	await expect(boardViews(page).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Start with a bank or a cohort' })).not.toBeVisible();

	for (const path of ['/banks', '/system', '/economy', '/methods', '/bank/900001']) {
		const response = await page.goto(path);
		expect(response?.ok(), path).toBe(true);
		await expect(page.locator('main#main')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Bankgraph home' })).toBeVisible();
	}

	expect(pageErrors).toEqual([]);
});

test('a person can add, rearrange, clear, and restore live board views', async ({ page }) => {
	await openOneBankBoard(page);
	const views = boardViews(page);
	const originalIds = await views.evaluateAll((items) => items.map((item) => item.getAttribute('data-block')));

	await page.getByRole('button', { name: 'Add view', exact: true }).click();
	await page.getByRole('menuitem', { name: /The economy/ }).click();
	await expect(views).toHaveCount(6);

	// Reorder within a populated strip so the workspace order and visible row both change.
	const movable = page.locator(`article[data-block="${originalIds[1]}"]`);
	await movable.hover();
	await movable.getByRole('button', { name: 'More' }).click();
	await movable.getByRole('button', { name: 'Move down' }).click();
	await expect.poll(async () => (await views.nth(1).getAttribute('data-block'))).toBe(originalIds[2]);
	await expect.poll(async () => (await views.nth(2).getAttribute('data-block'))).toBe(originalIds[1]);

	await page.getByRole('button', { name: 'Clear board', exact: true }).first().click();
	await expect(views).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Start with a bank or a cohort' })).toBeVisible();

	const undoNotice = page.getByRole('status').filter({ hasText: /Cleared 6 views/ });
	await undoNotice.getByRole('button', { name: 'Undo' }).click();
	await expect(views).toHaveCount(6);
	await expect(views).toContainText(['The economy']);
});

test('the theme control changes the whole work surface and survives navigation', async ({ page }) => {
	await page.goto('/b');
	await expect(page.getByRole('heading', { name: 'Start with a bank or a cohort' })).toBeVisible();
	const colorsBefore = await page.evaluate(() => ({
		body: getComputedStyle(document.body).backgroundColor,
		plate: getComputedStyle(document.querySelector('.plate')!).backgroundColor,
		topbar: getComputedStyle(document.querySelector('.topbar')!).backgroundColor
	}));

	await page.getByRole('button', { name: 'Switch to night' }).click();
	await expect(page.locator('html')).toHaveClass(/night/);
	await expect.poll(() => page.evaluate(() => localStorage.getItem('atlas.night'))).toBe('1');
	const colorsAfter = await page.evaluate(() => ({
		body: getComputedStyle(document.body).backgroundColor,
		plate: getComputedStyle(document.querySelector('.plate')!).backgroundColor,
		topbar: getComputedStyle(document.querySelector('.topbar')!).backgroundColor
	}));
	expect(colorsAfter.body).not.toBe(colorsBefore.body);
	expect(colorsAfter.plate).not.toBe(colorsBefore.plate);
	expect(colorsAfter.topbar).not.toBe(colorsBefore.topbar);

	await page.getByRole('link', { name: 'Economy', exact: true }).click();
	await expect(page).toHaveURL('/economy');
	await expect(page.locator('html')).toHaveClass(/night/);
	await expect(page.getByRole('button', { name: 'Switch to day' })).toBeVisible();
});

test.describe('responsive product surfaces', () => {
	for (const width of [390, 1024, 1600]) {
		test(`${width}px keeps pages contained and board tables inside their views`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			for (const path of ['/', '/banks', '/system', '/economy', '/methods']) {
				await page.goto(path);
				await expectNoDocumentOverflow(page);
			}

			await openOneBankBoard(page);
			await expectNoDocumentOverflow(page);
			const tableView = boardViews(page).filter({ has: page.locator('table') }).first();
			await expect(tableView).toBeVisible();
			const containment = await tableView.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth };
			});
			expect(containment.left).toBeGreaterThanOrEqual(0);
			expect(containment.right).toBeLessThanOrEqual(containment.viewport + 1);
		});
	}
});
