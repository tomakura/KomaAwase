// Tables follow docs/data-model.md. Friends and groups come with their features.
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

// `photo` is when the user's photo (user_photos) was last set, which also busts caches
export type UserIcon = { color: string; text: string; photo?: number };

export const users = sqliteTable('users', {
	id: id(),
	email: text('email').notNull().unique(),
	nickname: text('nickname'),
	googleSub: text('google_sub').unique(),
	// A character on a color, or a photo; null until the user picks one (the nickname's first character is shown)
	icon: text('icon', { mode: 'json' }).$type<UserIcon>(),
	theme: text('theme', { enum: ['system', 'light', 'dark'] })
		.notNull()
		.default('system'),
	// 1 = Monday ... 7 = Sunday
	daysShown: text('days_shown', { mode: 'json' })
		.$type<number[]>()
		.notNull()
		.default(sql`'[1,2,3,4,5]'`),
	// The user's university; new timetables start from its preset. Not a foreign key: adding
	// one would rebuild the users table, which everything else references.
	universityId: text('university_id'),
	// Set when はじめの設定 is done
	setupAt: integer('setup_at', { mode: 'timestamp_ms' }),
	// In the link friends open to send a request. Made the first time it is needed.
	friendCode: text('friend_code').unique(),
	role: text('role', { enum: ['admin'] }),
	createdAt: createdAt()
});

// The icon photo: a 256px square JPEG made in the browser, base64. Kept apart from users,
// which every request reads.
export const userPhotos = sqliteTable('user_photos', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	jpeg: text('jpeg').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
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

export type TermPreset = { name: string; group?: string; start?: string; end?: string }[];
export type PeriodPreset = { number: number; start: string; end: string }[];

export const universities = sqliteTable(
	'universities',
	{
		id: id(),
		name: text('name').notNull(),
		// matched exactly or as dot-separated subdomains, never by plain suffix
		emailDomains: text('email_domains', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		// Dates are for one academic year and are copied only into a timetable of that year.
		termPreset: text('term_preset', { mode: 'json' }).$type<TermPreset>(),
		periodPreset: text('period_preset', { mode: 'json' }).$type<PeriodPreset>(),
		// 'user' for a university someone typed in; it has no presets
		source: text('source', { enum: ['preset', 'user'] })
			.notNull()
			.default('preset')
	},
	(t) => [uniqueIndex('universities_name_idx').on(t.name)]
);

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
	// One timetable per academic year
	(t) => [uniqueIndex('timetables_user_year_idx').on(t.userId, t.year)]
);

export const terms = sqliteTable(
	'terms',
	{
		id: id(),
		timetableId: text('timetable_id')
			.notNull()
			.references(() => timetables.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		// 前期 / 後期 for quarters; shown above the term tabs
		groupName: text('group_name'),
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
		// shared_courses.id. Not a foreign key: adding one would rebuild this table, and shared
		// courses are never deleted.
		sharedCourseId: text('shared_course_id'),
		syncMode: text('sync_mode', { enum: ['synced', 'personal'] })
			.notNull()
			.default('personal'),
		title: text('title').notNull(),
		color: text('color').notNull().default('gray'),
		// Only for courses without slots
		delivery: text('delivery', { enum: ['ondemand', 'intensive'] }),
		intensiveFrom: text('intensive_from'), // YYYY-MM-DD
		intensiveTo: text('intensive_to'),
		createdAt: createdAt()
	},
	(t) => [
		index('courses_timetable_idx').on(t.timetableId),
		index('courses_shared_course_idx').on(t.sharedCourseId)
	]
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

// Memos, tasks and cancellations. They belong to the course, so every slot shows the same ones.
export const courseNotes = sqliteTable(
	'course_notes',
	{
		id: id(),
		courseId: text('course_id')
			.notNull()
			.references(() => courses.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['memo', 'task', 'cancel'] }).notNull(),
		// memo: the day it is about; cancel: the day the class is cancelled (YYYY-MM-DD)
		date: text('date'),
		body: text('body').notNull().default(''),
		due: text('due'), // task, YYYY-MM-DD
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [index('course_notes_course_idx').on(t.courseId)]
);

// Files kept with a course. The bytes are on the rental server (relay/files.php) under
// storage_key; only the Worker can reach them.
export const courseFiles = sqliteTable(
	'course_files',
	{
		id: id(),
		courseId: text('course_id')
			.notNull()
			.references(() => courses.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull().unique(),
		name: text('name').notNull(),
		mime: text('mime').notNull(),
		size: integer('size').notNull(),
		createdAt: createdAt()
	},
	(t) => [index('course_files_course_idx').on(t.courseId)]
);

// --- shared course data, per university and year ---

export const sharedCourses = sqliteTable(
	'shared_courses',
	{
		id: id(),
		universityId: text('university_id')
			.notNull()
			.references(() => universities.id),
		year: integer('year').notNull(),
		code: text('code'), // course code in the syllabus
		title: text('title').notNull(),
		// Term names such as Q3, set when the course is added; only used to narrow searches
		terms: text('terms', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
		delivery: text('delivery', { enum: ['ondemand', 'intensive'] }),
		intensiveFrom: text('intensive_from'),
		intensiveTo: text('intensive_to'),
		source: text('source', { enum: ['syllabus', 'user'] }).notNull(),
		version: integer('version').notNull().default(1),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(t) => [index('shared_courses_university_year_idx').on(t.universityId, t.year)]
);

export const sharedCourseSlots = sqliteTable(
	'shared_course_slots',
	{
		id: id(),
		sharedCourseId: text('shared_course_id')
			.notNull()
			.references(() => sharedCourses.id, { onDelete: 'cascade' }),
		weekday: integer('weekday').notNull(),
		periodNumber: integer('period_number').notNull(),
		span: integer('span').notNull().default(1),
		// Every week, or only odd or even weeks of the term
		weekPattern: text('week_pattern', { enum: ['every', 'odd', 'even'] })
			.notNull()
			.default('every'),
		room: text('room')
	},
	(t) => [
		index('shared_course_slots_course_idx').on(t.sharedCourseId),
		index('shared_course_slots_slot_idx').on(t.weekday, t.periodNumber)
	]
);

export const sharedCourseTeachers = sqliteTable(
	'shared_course_teachers',
	{
		id: id(),
		sharedCourseId: text('shared_course_id')
			.notNull()
			.references(() => sharedCourses.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index('shared_course_teachers_course_idx').on(t.sharedCourseId)]
);

// Every change with the values before and after, so it can be undone.
// The user is cleared, not the edit, when their account is deleted.
export const sharedCourseEdits = sqliteTable(
	'shared_course_edits',
	{
		id: id(),
		sharedCourseId: text('shared_course_id')
			.notNull()
			.references(() => sharedCourses.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		diff: text('diff', { mode: 'json' }).$type<{ before: unknown; after: unknown }>().notNull(),
		createdAt: createdAt()
	},
	(t) => [index('shared_course_edits_course_idx').on(t.sharedCourseId)]
);

// --- friends & groups ---

// One row per pair of people, whoever asked; `pair` is the two ids in order.
// Timetables are visible to each other only once the request is accepted.
export const friendships = sqliteTable(
	'friendships',
	{
		id: id(),
		requesterId: text('requester_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		addresseeId: text('addressee_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		pair: text('pair').notNull().unique(),
		status: text('status', { enum: ['pending', 'accepted'] })
			.notNull()
			.default('pending'),
		createdAt: createdAt(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' })
	},
	(t) => [
		index('friendships_requester_idx').on(t.requesterId),
		index('friendships_addressee_idx').on(t.addresseeId)
	]
);

// Blocking wins over friendships and groups: neither sees the other's timetable.
export const blocks = sqliteTable(
	'blocks',
	{
		blockerId: text('blocker_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		blockedId: text('blocked_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('blocks_blocked_idx').on(t.blockedId)]
);

// Circles and seminars. The table isn't called `groups`, which SQLite also uses as a keyword.
export const groups = sqliteTable('friend_groups', {
	id: id(),
	name: text('name').notNull(),
	// Passed to the longest-standing member when the owner leaves
	ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
	inviteCode: text('invite_code').notNull().unique(),
	createdAt: createdAt()
});

export const groupMembers = sqliteTable(
	'group_members',
	{
		groupId: text('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// Whether the other members see this member's timetable; chosen when joining
		shareTimetable: integer('share_timetable', { mode: 'boolean' }).notNull().default(true),
		joinedAt: createdAt()
	},
	(t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)]
);

// --- operations ---

// Reports about people, groups and shared course data. The reporter is cleared, not the
// report, when their account is deleted.
export const reports = sqliteTable(
	'reports',
	{
		id: id(),
		reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
		targetType: text('target_type', { enum: ['user', 'group', 'shared_course'] }).notNull(),
		targetId: text('target_id').notNull(),
		reason: text('reason').notNull(),
		detail: text('detail'),
		status: text('status', { enum: ['open', 'closed'] })
			.notNull()
			.default('open'),
		createdAt: createdAt()
	},
	(t) => [index('reports_status_idx').on(t.status)]
);

// Screenshot imports waiting for, or back from, the AI. This table is the queue's source of
// truth: Queues messages only say which job to work on and last a day at most.
export const importJobs = sqliteTable(
	'import_jobs',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		timetableId: text('timetable_id')
			.notNull()
			.references(() => timetables.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['queued', 'processing', 'retry', 'done', 'failed'] })
			.notNull()
			.default('queued'),
		// The cropped screenshot as a JPEG data URL, cleared as soon as it has been read
		image: text('image'),
		provider: text('provider', { enum: ['groq', 'workers-ai'] }),
		result: text('result', { mode: 'json' }).$type<import('$lib/import').ImportedCourse[]>(),
		error: text('error'),
		attempts: integer('attempts').notNull().default(0),
		retryAt: integer('retry_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		// When the results were saved to the timetable or put aside
		closedAt: integer('closed_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('import_jobs_user_idx').on(t.userId), index('import_jobs_status_idx').on(t.status)]
);

// Bug reports and requests from the app. The sender is cleared, not the message, when their
// account is deleted.
export const feedback = sqliteTable(
	'feedback',
	{
		id: id(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		kind: text('kind', { enum: ['bug', 'request', 'other'] }).notNull(),
		body: text('body').notNull(),
		// Browser, screen and page, attached only if the sender agreed after seeing them
		env: text('env', { mode: 'json' }).$type<Record<string, string>>(),
		status: text('status', { enum: ['open', 'closed'] })
			.notNull()
			.default('open'),
		createdAt: createdAt()
	},
	(t) => [
		index('feedback_status_idx').on(t.status),
		// For the daily limit on sending
		index('feedback_user_created_idx').on(t.userId, t.createdAt)
	]
);

// Enrollment checks: a link sent to a university address was opened. One address
// verifies one account at a time. Checks lapse each spring, when students re-confirm.
export const univVerifications = sqliteTable('univ_verifications', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	universityId: text('university_id')
		.notNull()
		.references(() => universities.id),
	email: text('email').notNull().unique(),
	verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

// Links sent for enrollment checks. id is the SHA-256 of the token in the link.
export const verifyTokens = sqliteTable(
	'verify_tokens',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		universityId: text('university_id').notNull(),
		email: text('email').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('verify_tokens_user_idx').on(t.userId)]
);
