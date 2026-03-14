/**
 * Read a CSS custom property value from the document root at call time.
 * Always call inside $effect (or equivalent runtime context) so the value
 * reflects the active theme rather than the module-load theme.
 */
export function getCSSVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Collect all chart palette colors (--chart-1 through --chart-10) at runtime.
 */
export function getChartPalette(): string[] {
	return Array.from({ length: 10 }, (_, i) => getCSSVar(`--chart-${i + 1}`));
}
