/**
 * The body of a request as bytes, or null once it is longer than `max`. Read as it arrives, so
 * a body sent without Content-Length (or with a false one) is cut off at the limit instead of
 * being held in memory whole.
 */
export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (let read = await reader.read(); !read.done; read = await reader.read()) {
		length += read.value.byteLength;
		if (length > max) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(read.value);
	}
	const bytes = new Uint8Array(length);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return bytes;
}
