import { describe, expect, it, vi } from 'vitest';
import { loadPublicPipelineState } from './public-pipeline-state';

describe('public pipeline metadata', () => {
	it('filters the private stage lease namespace in D1', async () => {
		const all = vi.fn(async () => ({
			results: [{ key: 'published_release', value: '20260630', updated_at: 'now' }]
		}));
		const bind = vi.fn(() => ({ all }));
		const prepare = vi.fn(() => ({ bind }));
		const rows = await loadPublicPipelineState({ prepare } as unknown as D1Database);

		expect(rows).toHaveLength(1);
		expect(prepare).toHaveBeenCalledWith(expect.stringContaining("key NOT GLOB 'pipeline:*'"));
	});
});
