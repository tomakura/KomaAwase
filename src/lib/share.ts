// Sharing a link: the phone's share sheet where there is one, else the clipboard.
// Returns what happened, for a short message.
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
	if (navigator.share) {
		try {
			await navigator.share({ url, text });
			return 'shared';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
		}
	}
	return copyText(url);
}

export async function copyText(text: string): Promise<'copied' | 'failed'> {
	try {
		await navigator.clipboard.writeText(text);
		return 'copied';
	} catch {
		return 'failed';
	}
}
