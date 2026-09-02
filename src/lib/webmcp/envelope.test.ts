import { describe, expect, it } from 'vitest';
import { createResultEnvelope } from './envelope';

describe('WebMCP result serialization', () => {
	it('preserves repeated references while bounding actual cycles', () => {
		const values = [628, 3510, 3511];
		const cyclic: { label: string; self?: unknown } = { label: 'cycle' };
		cyclic.self = cyclic;

		const result = createResultEnvelope({
			summary: 'Structured board data.',
			data: { binding: { certs: values }, anchors: { certs: values }, cyclic }
		}, 10_000);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toMatchObject({
			binding: { certs: [628, 3510, 3511] },
			anchors: { certs: [628, 3510, 3511] },
			cyclic: { label: 'cycle', self: '[Circular]' }
		});
	});
});
