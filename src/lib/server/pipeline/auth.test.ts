import { createHash, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPipelineBearer } from './auth';

const testSubtle = {
	async digest(_algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
		const view = ArrayBuffer.isView(data)
			? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
			: Buffer.from(data);
		const digest = createHash('sha256').update(view).digest();
		return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength) as ArrayBuffer;
	},
	timingSafeEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
		return timingSafeEqual(
			Buffer.from(left.buffer, left.byteOffset, left.byteLength),
			Buffer.from(right.buffer, right.byteOffset, right.byteLength)
		);
	}
};

describe('verifyPipelineBearer', () => {
	it('accepts the exact bearer secret', async () => {
		await expect(verifyPipelineBearer('Bearer private-value', 'private-value', testSubtle)).resolves.toBe(true);
	});

	it.each([null, '', 'Basic private-value', 'Bearer ', 'Bearer wrong-value'])(
		'rejects invalid authorization %j',
		async (authorization) => {
			await expect(verifyPipelineBearer(authorization, 'private-value', testSubtle)).resolves.toBe(false);
		}
	);
});
