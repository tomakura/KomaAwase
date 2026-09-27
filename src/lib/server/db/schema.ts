// Tables follow docs/data-model.md. Only account/auth and timetable tables for now;
// shared courses, notes, friends and groups come with their features.
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

// --- accounts & auth ---

export const users = sqliteTable('users', {
	id: id(),
	email: text('email').notNull().unique(),
	nickname: text('nickname'),
	googleSub: text('google_sub').unique(),
	icon: text('icon'),
	theme: text('theme', { enum: ['system', 'light', 'dark'] })
		.notNull()
		.default('system'),
	// 1 = Monday ... 7 = Sunday
	daysShown: text('days_shown', { mode: 'json' })
		.$type<number[]>()
		.notNull()
		.default(sql`'[1,2,3,4,5]'`),
	createdAt: createdAt()
});

export const passkeys = sqliteTable(
	'passkeys',
	{
		// WebAuthn credential ID (base64url)
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// base64url; Workers has no Node Buffer for blob columns
		publicKey: text('public_key').notNull(),
		counter: integer('counter').notNull().default(0),
		transports: text('transports', { mode: 'json' }).$type<string[]>(),
		deviceType: text('device_type'),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
		name: text('name'),
		createdAt: createdAt(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('passkeys_user_idx').on(t.userId)]
);

// id is the SHA-256 of the cookie token, so a leaked table can't be replayed.
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// WebAuthn challenges, looked up by an id kept in a short-lived cookie.
export const authChallenges = sqliteTable('auth_challenges', {
	id: id(),
	challenge: text('challenge').notNull(),
	userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

// Email sign-in links. id is the SHA-256 of the token in the link.
export const emailTokens = sqliteTable('email_tokens', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

// --- universities & timetables ---

export const universities = sqliteTable('universities', {
	id: id(),
	name: text('name').notNull(),
	// matched exactly or as dot-separated subdomains, never by plain suffix
	emailDomains: text('email_domains', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
	termPreset: text('term_preset', { mode: 'json' }).$type<{ name: string }[]>(),
	periodPreset: text('period_preset', { mode: 'json' }).$type<{ number: number; start: string; end: string }[]>()
});

export const timetables = sqliteTable(
	'timetables',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		universityId: text('university_id').references(() => universities.id),
		year: integer('year').notNull(),
		name: text('name').notNull(),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [index('timetables_user_idx').on(t.userId)]
);

export const terms = sqliteTable(
	'terms',
	{
		id: id(),
		timetableId: text('timetable_id')
			.notNull()
			.references(() => timetables.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		startDate: text('start_date'), // YYYY-MM-DD
		endDate: text('end_date'),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index('terms_timetable_idx').on(t.timetableId)]
);

export const periods = sqliteTable(
	'periods',
	{
		id: id(),
		timetableId: text('timetable_id')
			.notNull()
			.references(() => timetables.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(), // 0限 is allowed
		startTime: text('start_time').notNull(), // HH:MM
		endTime: text('end_time').notNull()
	},
	(t) => [uniqueIndex('periods_timetable_number_idx').on(t.timetableId, t.number)]
);

export const courses = sqliteTable(
	'courses',
	{
		id: id(),
		timetableId: text('timetable_id')
			.notNull()
			.references(() => timetables.id, { onDelete: 'cascade' }),
		// references shared_courses once that table exists
		sharedCourseId: text('shared_course_id'),
		syncMode: text('sync_mode', { enum: ['synced', 'personal'] })
			.notNull()
			.default('personal'),
		title: text('title').notNull(),
		color: text('color').notNull().default('gray'),
		createdAt: createdAt()
	},
	(t) => [index('courses_timetable_idx').on(t.timetableId)]
);

export const courseTerms = sqliteTable(
	'course_terms',
	{
		courseId: text('course_id')
			.notNull()
			.references(() => courses.id, { onDelete: 'cascade' }),
		termId: text('term_id')
			.notNull()
			.references(() => terms.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.courseId, t.termId] })]
);

// No rows = on-demand / intensive course.
export const courseSlots = sqliteTable(
	'course_slots',
	{
		id: id(),
		courseId: text('course_id')
			.notNull()
			.references(() => courses.id, { onDelete: 'cascade' }),
		weekday: integer('weekday').notNull(), // 1 = Monday ... 7 = Sunday
		periodNumber: integer('period_number').notNull(),
		span: integer('span').notNull().default(1),
		weekPattern: text('week_pattern', { enum: ['every', 'odd', 'even'] })
			.notNull()
			.default('every'),
		room: text('room')
	},
	(t) => [index('course_slots_course_idx').on(t.courseId)]
);

export const courseTeachers = sqliteTable(
	'course_teachers',
	{
		id: id(),
		courseId: text('course_id')
			.notNull()
			.references(() => courses.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index('course_teachers_course_idx').on(t.courseId)]
);
