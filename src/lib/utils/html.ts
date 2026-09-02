/**
 * Escape a value before interpolating it into an HTML string.
 *
 * ECharts parses string tooltip formatters as HTML, so every dynamic value in
 * those formatters must pass through this helper (including style attributes).
 */
export function escapeHtml(value: unknown): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const SAFE_CSS_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-]+\)|var\(--[a-z0-9-]+\)|[a-z]+)$/i;

/** Allow only simple color tokens before placing one in an inline style. */
export function safeCssColor(value: unknown): string {
	const color = String(value).trim();
	return SAFE_CSS_COLOR.test(color) ? escapeHtml(color) : 'currentColor';
}
