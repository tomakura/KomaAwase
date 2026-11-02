import { and, count, eq, gt } from 'drizzle-orm';
import type { Db } from './db';
import { groups, reports, sharedCourses, users } from './db/schema';

export const REPORT_REASONS = {
	user: ['なりすまし', '迷惑な申請', 'いやがらせ', 'その他'],
	group: ['不適切な名前', '迷惑な招待', 'その他'],
	shared_course: ['内容が間違っている', '同じ授業が2つある', '不適切な内容', '荒らされている', 'その他']
} as const;

export type ReportTarget = keyof typeof REPORT_REASONS;

const DETAIL_MAX = 500;
// Reports one person can send in a day, so made-up targets can't fill the admin's list
export const REPORTS_A_DAY = 20;
const DAY = 24 * 60 * 60 * 1000;

/** Whether what is reported is there at all */
async function targetExists(db: Db, targetType: ReportTarget, targetId: string) {
	const table = targetType === 'user' ? users : targetType === 'group' ? groups : sharedCourses;
	return !!(await db.select({ id: table.id }).from(table).where(eq(table.id, targetId)).get());
}

/** Saves a report, or returns the message to show. */
export async function saveReport(db: Db, reporterId: string, targetType: ReportTarget, targetId: string, form: FormData) {
	const reason = String(form.get('reason') ?? '');
	if (!(REPORT_REASONS[targetType] as readonly string[]).includes(reason)) return '理由を選んでください';
	const detail = String(form.get('detail') ?? '').trim();
	if ([...detail].length > DETAIL_MAX) return `詳しい内容は${DETAIL_MAX}文字までです`;
	// One open report per person and target: sending again doesn't pile up
	const open = await db
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.reporterId, reporterId),
				eq(reports.targetType, targetType),
				eq(reports.targetId, targetId),
				eq(reports.status, 'open')
			)
		)
		.get();
	if (open) return 'すでに報告を受け取っています。運営が確認するまでお待ちください';
	if (targetType === 'user' && targetId === reporterId) return '自分は報告できません';
	const [exists, [sent]] = await Promise.all([
		targetExists(db, targetType, targetId),
		db
			.select({ n: count() })
			.from(reports)
			.where(and(eq(reports.reporterId, reporterId), gt(reports.createdAt, new Date(Date.now() - DAY))))
	]);
	if (!exists) return '報告する相手が見つかりません';
	if (sent.n >= REPORTS_A_DAY) return '今日はこれ以上報告できません。明日また送ってください';
	await db.insert(reports).values({ reporterId, targetType, targetId, reason, detail: detail || null });
	return null;
}
