const encoder = new TextEncoder();

/** UTF-8 byte length, which is what D1 and URL infrastructure enforce. */
export function utf8ByteLength(value: string): number {
	return encoder.encode(value).byteLength;
}
