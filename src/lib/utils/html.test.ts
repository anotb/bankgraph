import { describe, expect, it } from 'vitest';
import { escapeHtml, safeCssColor } from './html';

describe('escapeHtml', () => {
	it('neutralizes HTML elements, event handlers, and attribute breakouts', () => {
		const payload = `"><img src=x onerror="globalThis.pwned=true">'&`;
		const escaped = escapeHtml(payload);

		expect(escaped).toBe(
			'&quot;&gt;&lt;img src=x onerror=&quot;globalThis.pwned=true&quot;&gt;&#39;&amp;'
		);
		expect(escaped).not.toContain('<img');
		expect(escaped).not.toContain('">');
	});

	it('escapes values used in CSS style attributes', () => {
		expect(escapeHtml(`red\"></span><svg onload=alert(1)>`)).toBe(
			'red&quot;&gt;&lt;/span&gt;&lt;svg onload=alert(1)&gt;'
		);
	});

	it('stringifies safe numeric values without changing them', () => {
		expect(escapeHtml(-123.45)).toBe('-123.45');
	});
});

describe('safeCssColor', () => {
	it.each(['#0e7c7c', 'rgb(12, 34, 56)', 'rgba(12,34,56,0.5)', 'var(--warning)', 'currentColor'])(
		'preserves the supported color token %s',
		(color) => expect(safeCssColor(color)).toBe(color)
	);

	it('rejects CSS declaration and URL injection', () => {
		expect(safeCssColor('red;position:fixed;inset:0')).toBe('currentColor');
		expect(safeCssColor('url(javascript:alert(1))')).toBe('currentColor');
		expect(safeCssColor(`red\"></span><img src=x onerror=alert(1)>`)).toBe('currentColor');
	});
});
