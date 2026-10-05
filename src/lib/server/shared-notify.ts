import { and, eq, ne } from 'drizzle-orm';
import type { Db } from './db';
import { courses, sharedCourses, timetables } from './db/schema';
import { notifyLater } from './notify';

/**
 * Tells everyone else syncing these shared courses that one was changed (notify kind
 * sharedChange), after the response has gone out. The link opens their own copy of the class.
 */
export function notifySharedChanged(platform: App.Platform | undefined, db: Db, editorId: string, sharedCourseIds: (string | null | undefined)[]) {
	for (const id of new Set(sharedCourseIds)) {
		if (!id || !platform) continue;
		platform.ctx.waitUntil(
			(async () => {
				const [course, rows] = await Promise.all([
					db.select({ title: sharedCourses.title }).from(sharedCourses).where(eq(sharedCourses.id, id)).get(),
					db
						.selectDistinct({ userId: timetables.userId })
						.from(courses)
						.innerJoin(timetables, eq(timetables.id, courses.timetableId))
						.where(and(eq(courses.sharedCourseId, id), eq(courses.syncMode, 'synced'), ne(timetables.userId, editorId)))
				]);
				if (!course || !rows.length) return;
				notifyLater(
					platform,
					db,
					rows.map((r) => r.userId),
					'sharedChange',
					{ title: '授業の内容が変わりました', body: `「${course.title}」をほかの人が直しました`, url: `/courses/synced/${id}`, tag: `shared-${id}` }
				);
			})().catch((e) => console.error('shared change notice failed', e))
		);
	}
}
