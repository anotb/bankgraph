import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCSSVar, getChartPalette } from './chart-colors';

describe('getCSSVar', () => {
	let getComputedStyleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			getPropertyValue: (name: string) => {
				const vars: Record<string, string> = {
					'--accent': ' #0d7d7d ',
					'--surface-0': '#ffffff',
					'--chart-1': '#2db5a8',
					'--chart-2': '#e06c3a',
				};
				return vars[name] ?? '';
			},
		} as unknown as CSSStyleDeclaration);
	});

	afterEach(() => {
		getComputedStyleSpy.mockRestore();
	});

	it('reads a CSS variable from document root', () => {
		expect(getCSSVar('--accent')).toBe('#0d7d7d');
	});

	it('trims whitespace from the value', () => {
		// The mock returns ' #0d7d7d ' with spaces for --accent
		expect(getCSSVar('--accent')).not.toMatch(/^\s|\s$/);
	});

	it('returns empty string for undefined variables', () => {
		expect(getCSSVar('--nonexistent')).toBe('');
	});

	it('calls getComputedStyle on document.documentElement', () => {
		getCSSVar('--surface-0');
		expect(getComputedStyleSpy).toHaveBeenCalledWith(document.documentElement);
	});
});

describe('getChartPalette', () => {
	let getComputedStyleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			getPropertyValue: (name: string) => {
				// Return distinct colors for --chart-1 through --chart-10
				const match = name.match(/^--chart-(\d+)$/);
				if (match) {
					const idx = parseInt(match[1]);
					return `hsl(${idx * 36}, 70%, 50%)`;
				}
				return '';
			},
		} as unknown as CSSStyleDeclaration);
	});

	afterEach(() => {
		getComputedStyleSpy.mockRestore();
	});

	it('returns an array of 10 colors', () => {
		const palette = getChartPalette();
		expect(palette).toHaveLength(10);
	});

	it('reads --chart-1 through --chart-10', () => {
		const palette = getChartPalette();
		expect(palette[0]).toBe('hsl(36, 70%, 50%)');
		expect(palette[9]).toBe('hsl(360, 70%, 50%)');
	});

	it('returns all distinct values', () => {
		const palette = getChartPalette();
		const unique = new Set(palette);
		expect(unique.size).toBe(10);
	});

	it('returns trimmed strings', () => {
		const palette = getChartPalette();
		for (const color of palette) {
			expect(color).toBe(color.trim());
		}
	});
});
