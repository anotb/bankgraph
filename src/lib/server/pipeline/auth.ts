export interface TimingSafeSubtleCrypto {
	digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>;
	timingSafeEqual(left: ArrayBufferView, right: ArrayBufferView): boolean;
}

const encoder = new TextEncoder();

function hasTimingSafeEqual(
	subtle: SubtleCrypto
): subtle is SubtleCrypto & TimingSafeSubtleCrypto {
	return 'timingSafeEqual' in subtle && typeof subtle.timingSafeEqual === 'function';
}

function workerSubtleCrypto(): TimingSafeSubtleCrypto {
	if (!hasTimingSafeEqual(crypto.subtle)) {
		throw new Error('Workers timing-safe crypto is unavailable');
	}
	return crypto.subtle;
}

/**
 * Compare a bearer credential without making the comparison time depend on
 * the length or contents of the configured secret.
 */
export async function verifyPipelineBearer(
	authorization: string | null,
	expectedSecret: string,
	subtle: TimingSafeSubtleCrypto = workerSubtleCrypto()
): Promise<boolean> {
	const hasBearerScheme = authorization?.startsWith('Bearer ') === true;
	const suppliedSecret = hasBearerScheme ? authorization!.slice('Bearer '.length) : '';
	const [suppliedDigest, expectedDigest] = await Promise.all([
		subtle.digest('SHA-256', encoder.encode(suppliedSecret)),
		subtle.digest('SHA-256', encoder.encode(expectedSecret))
	]);

	const equal = subtle.timingSafeEqual(
		new Uint8Array(suppliedDigest),
		new Uint8Array(expectedDigest)
	);
	return hasBearerScheme && suppliedSecret.length > 0 && expectedSecret.length > 0 && equal;
}
