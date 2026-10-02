import { and, asc, eq, sql, sum } from 'drizzle-orm';
import type { Db } from './db';
import { courseFiles, courses, timetables } from './db/schema';
import { FILE_MAX_BYTES } from '$lib/files';
import { hmacSha256Hex, newNonce, sha256Hex } from './hmac';

export { FILE_MAX_BYTES };
export const USER_QUOTA_BYTES = 100 * 1024 * 1024;
const NAME_MAX = 100;
const QUOTA_MESSAGE = `資料は全部で${USER_QUOTA_BYTES / 1024 / 1024}MBまでです。いらない資料を消してください`;

// What can be kept with a course. PDFs and images open in the browser; Office files download.
const TYPES: Record<string, 'inline' | 'attachment'> = {
	'application/pdf': 'inline',
	'image/jpeg': 'inline',
	'image/png': 'inline',
	'image/webp': 'inline',
	'image/gif': 'inline',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'attachment',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'attachment',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'attachment'
};

export function filesEnabled(env: Env) {
	return !!env.FILES_URL && !!env.FILES_SECRET;
}

// One signed request to relay/files.php. The signature covers a one-time nonce and, for a
// put, the file's hash, so it can't be reused or attached to other bytes.
async function storage(env: Env, action: 'put' | 'get' | 'delete', key: string, body?: ArrayBuffer) {
	if (!env.FILES_URL || !env.FILES_SECRET) throw new Error('File storage is not configured');
	const size = body ? String(body.byteLength) : '';
	const hash = body ? await sha256Hex(body) : '';
	const timestamp = String(Math.floor(Date.now() / 1000));
	const nonce = newNonce();
	const url = new URL(env.FILES_URL);
	url.searchParams.set('action', action);
	url.searchParams.set('key', key);
	if (size) url.searchParams.set('size', size);
	if (hash) url.searchParams.set('sha256', hash);
	return fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/octet-stream',
			'x-koma-timestamp': timestamp,
			'x-koma-nonce': nonce,
			'x-koma-signature': await hmacSha256Hex(env.FILES_SECRET, `${timestamp}.${nonce}.${action}.${key}.${size}.${hash}`)
		},
		body,
		signal: AbortSignal.timeout(30_000)
	});
}

export function listFiles(db: Db, courseId: string) {
	return db
		.select({
			id: courseFiles.id,
			name: courseFiles.name,
			mime: courseFiles.mime,
			size: courseFiles.size,
			createdAt: courseFiles.createdAt
		})
		.from(courseFiles)
		.where(eq(courseFiles.courseId, courseId))
		.orderBy(asc(courseFiles.createdAt));
}

// Bytes kept across all of the user's timetables
export async function usedBytes(db: Db, userId: string) {
	const row = await db
		.select({ total: sum(courseFiles.size) })
		.from(courseFiles)
		.innerJoin(courses, eq(courseFiles.courseId, courses.id))
		.innerJoin(timetables, eq(courses.timetableId, timetables.id))
		.where(eq(timetables.userId, userId))
		.get();
	return Number(row?.total ?? 0);
}

function randomKey() {
	return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The caller has checked the course is the user's. Returns a message when the file is refused.
export async function saveFile(
	env: Env,
	db: Db,
	{ userId, courseId, name, mime, body }: { userId: string; courseId: string; name: string; mime: string; body: ArrayBuffer }
): Promise<string | null> {
	if (!(mime in TYPES)) return 'PDF・画像・Word・PowerPoint・Excel のファイルを選んでください';
	if (!body.byteLength) return 'ファイルが空です';
	if (body.byteLength > FILE_MAX_BYTES) return `1つのファイルは${FILE_MAX_BYTES / 1024 / 1024}MBまでです`;
	// Checked here first so a file that clearly won't fit isn't sent to the storage at all
	if ((await usedBytes(db, userId)) + body.byteLength > USER_QUOTA_BYTES) return QUOTA_MESSAGE;
	const cleanName = [...name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim()].slice(0, NAME_MAX).join('') || '資料';

	const storageKey = randomKey();
	const res = await storage(env, 'put', storageKey, body);
	if (!res.ok) throw new Error(`File storage responded ${res.status}: ${await res.text()}`);
	// Counted and saved in one statement, so uploads at the same moment can't pass the quota together
	let saved;
	try {
		saved = await db.run(sql`
			insert into ${courseFiles} (id, course_id, storage_key, name, mime, size)
			select ${crypto.randomUUID()}, ${courseId}, ${storageKey}, ${cleanName}, ${mime}, ${body.byteLength}
			where (
				select coalesce(sum(f.size), 0) from ${courseFiles} f
				join ${courses} c on c.id = f.course_id
				join ${timetables} t on t.id = c.timetable_id
				where t.user_id = ${userId}
			) + ${body.byteLength} <= ${USER_QUOTA_BYTES}`);
	} catch (e) {
		await storage(env, 'delete', storageKey).catch(() => {});
		throw e;
	}
	if (!saved.meta.changes) {
		await storage(env, 'delete', storageKey).catch(() => {});
		return QUOTA_MESSAGE;
	}
	return null;
}

// The file as a response for the browser. Nothing from the file can run on this site: only
// types that can't hold page scripts are shown, the rest download, and none are sniffed.
// PDFs skip the sandbox, which stops browsers' PDF viewers; their scripts stay in the viewer.
export async function openFile(env: Env, db: Db, courseId: string, fileId: string) {
	const file = await db
		.select()
		.from(courseFiles)
		.where(and(eq(courseFiles.id, fileId), eq(courseFiles.courseId, courseId)))
		.get();
	if (!file) return null;
	const res = await storage(env, 'get', file.storageKey);
	if (!res.ok) throw new Error(`File storage responded ${res.status}`);
	const disposition = TYPES[file.mime] ?? 'attachment';
	return new Response(res.body, {
		headers: {
			'content-type': file.mime,
			'content-length': res.headers.get('content-length') ?? String(file.size),
			'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
			...(file.mime === 'application/pdf' ? {} : { 'content-security-policy': 'sandbox' }),
			'x-content-type-options': 'nosniff',
			// Not kept by the browser: who may open it is asked each time, and a copy would stay
			// on the device after signing out or another account signing in
			'cache-control': 'private, no-store'
		}
	});
}

// Removes the stored bytes first, so a failure never leaves a file nobody can see or delete.
// Bytes already gone count as removed (files.php answers ok), so trying again is safe.
async function removeStored(env: Env, keys: string[]) {
	for (const key of keys) {
		const res = await storage(env, 'delete', key);
		if (!res.ok) throw new Error(`File storage responded ${res.status}`);
	}
}

export async function deleteFile(env: Env, db: Db, courseId: string, fileId: string) {
	const file = await db
		.select({ storageKey: courseFiles.storageKey })
		.from(courseFiles)
		.where(and(eq(courseFiles.id, fileId), eq(courseFiles.courseId, courseId)))
		.get();
	if (!file) return;
	await removeStored(env, [file.storageKey]);
	await db.delete(courseFiles).where(eq(courseFiles.id, fileId));
}

/**
 * Before a course is deleted: up to `limit` of its files, each one's row going with its stored
 * bytes, so a failure part way leaves the course with exactly the files that are still there
 * (and doing it again carries on). Says how many are left. One call stays under the Free
 * plan's 50 outside requests.
 */
export async function deleteCourseFiles(env: Env, db: Db, courseId: string, limit = 40) {
	const files = await db
		.select({ id: courseFiles.id, storageKey: courseFiles.storageKey })
		.from(courseFiles)
		.where(eq(courseFiles.courseId, courseId))
		.limit(limit + 1);
	for (const file of files.slice(0, limit)) {
		await removeStored(env, [file.storageKey]);
		await db.delete(courseFiles).where(eq(courseFiles.id, file.id));
	}
	return Math.max(files.length - limit, 0);
}

/**
 * Deletes up to `limit` of the user's stored files (the rental server first, then the rows)
 * and says how many are left. One call stays under the Free plan's 50 outside requests.
 */
export async function removeUserFiles(env: Env, db: Db, userId: string, limit = 40) {
	const files = await db
		.select({ id: courseFiles.id, storageKey: courseFiles.storageKey })
		.from(courseFiles)
		.innerJoin(courses, eq(courses.id, courseFiles.courseId))
		.innerJoin(timetables, eq(timetables.id, courses.timetableId))
		.where(eq(timetables.userId, userId))
		.limit(limit + 1);
	const batch = files.slice(0, limit);
	if (batch.length && !filesEnabled(env)) throw new Error('File storage is not configured');
	for (const file of batch) {
		await removeStored(env, [file.storageKey]);
		await db.delete(courseFiles).where(eq(courseFiles.id, file.id));
	}
	return files.length - batch.length;
}
