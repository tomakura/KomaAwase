// What someone who shows only when they are busy gives instead of their classes: when each
// one is stays, and the title, room, color and link to a shared course, which tell the
// class apart, don't. Classes with no time (on demand) say nothing about being busy, so go.
export const BUSY_TITLE = '予定あり';

type Course = {
	title: string;
	color: string;
	slots: { room: string | null }[];
	sharedCourseId?: string | null;
	credits?: number | null;
};

export function busyOnly<C extends Course>(courses: C[]): C[] {
	return courses
		.filter((c) => c.slots.length > 0)
		.map((c) => ({
			...c,
			title: BUSY_TITLE,
			color: 'gray',
			slots: c.slots.map((s) => ({ ...s, room: null })),
			...('sharedCourseId' in c ? { sharedCourseId: null } : {}),
			...('credits' in c ? { credits: null } : {})
		}));
}
