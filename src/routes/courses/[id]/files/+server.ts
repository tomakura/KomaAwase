import { error, json } from '@sveltejs/kit';
import { readLimited } from '$lib/server/body';
import { findOwnedCourse } from '$lib/server/courses';
import { FILE_MAX_BYTES, filesEnabled, saveFile } from '$lib/server/files';
import type { RequestHandler } from './$types';

// Upload: the body is the file itself, with its type in Content-Type and its name,
// URI-encoded, in X-File-Name. A raw body keeps the Worker from parsing multipart.
export const POST: RequestHandler = async ({ locals, params, request, platform, url }) => {
	if (!locals.user) error(401, 'ログインしてください');
	// Only this site's pages may upload (SvelteKit checks this for forms, not for fetch).
	if (request.headers.get('origin') !== url.origin) error(403, 'forbidden');
	const env = platform?.env;
	if (!env || !filesEnabled(env)) error(503, '資料はまだ使えません');
	if (!(await findOwnedCourse(locals.db, locals.user.id, params.id))) error(404, '授業が見つかりません');

	const tooBig = () => json({ message: `1つのファイルは${FILE_MAX_BYTES / 1024 / 1024}MBまでです` }, { status: 413 });
	if (Number(request.headers.get('content-length')) > FILE_MAX_BYTES) return tooBig();
	// Read as it arrives: a body with no (or a wrong) Content-Length is cut off at the limit too
	const bytes = await readLimited(request.body, FILE_MAX_BYTES);
	if (!bytes) return tooBig();
	let name = '';
	try {
		name = decodeURIComponent(request.headers.get('x-file-name') ?? '');
	} catch {
		// keep the default name
	}
	const message = await saveFile(env, locals.db, {
		userId: locals.user.id,
		courseId: params.id,
		name,
		mime: (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
		body: bytes.buffer as ArrayBuffer
	});
	if (message) return json({ message }, { status: 400 });
	return json({ ok: true });
};
