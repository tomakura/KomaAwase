// Browser side of course files (資料). The size limit is shared with the server.

// Also checked by relay/files.php
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BY_EXTENSION: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	heic: 'image/heic',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export const FILE_ACCEPT = 'image/*,.pdf,.docx,.pptx,.xlsx';

async function shrink(file: File) {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		// JPEG has no transparency
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
	} finally {
		URL.revokeObjectURL(url);
	}
}

// Photos are shrunk to JPEG before upload: a phone photo of a blackboard drops from a few MB
// to a few hundred KB. HEIC and other types the server doesn't keep are converted too.
async function prepare(file: File) {
	const type = file.type || BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
	if (type.startsWith('image/') && type !== 'image/gif') {
		const shrunk = await shrink(file).catch(() => null);
		if (shrunk && (shrunk.size < file.size || !IMAGE_TYPES.includes(type))) {
			return { body: shrunk, type: 'image/jpeg', name: `${file.name.replace(/\.[^.]*$/, '')}.jpg` };
		}
	}
	return { body: file, type, name: file.name };
}

// Returns a message when the file wasn't kept.
export async function uploadFile(courseId: string, file: File): Promise<string | null> {
	const { body, type, name } = await prepare(file);
	// The server refuses these before reading them, which the browser sees as a failed request.
	if (body.size > FILE_MAX_BYTES) return `${name}：1つのファイルは${FILE_MAX_BYTES / 1024 / 1024}MBまでです`;
	const res = await fetch(`/courses/${courseId}/files`, {
		method: 'POST',
		headers: { 'content-type': type || 'application/octet-stream', 'x-file-name': encodeURIComponent(name) },
		body
	}).catch(() => null);
	if (res?.ok) return null;
	const data = (await res?.json().catch(() => null)) as { message?: string } | null;
	return `${name}：${data?.message ?? '送れませんでした。時間をおいてもう一度やり直してください'}`;
}

// 820KB, 2.1MB, 100MB
export function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
	return `${Number((bytes / 1024 / 1024).toFixed(1))}MB`;
}

// The label on a file's icon; images get a picture instead
export function fileBadge(mime: string) {
	if (mime === 'application/pdf') return 'PDF';
	if (mime.includes('wordprocessingml')) return 'DOC';
	if (mime.includes('presentationml')) return 'PPT';
	if (mime.includes('spreadsheetml')) return 'XLS';
	return null;
}
