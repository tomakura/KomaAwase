import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { reports } from './db/schema';

export const REPORT_REASONS = {
	user: ['なりすまし', '迷惑な申請', 'いやがらせ', 'その他'],
	group: ['不適切な名前', '迷惑な招待', 'その他'],
	shared_course: ['内容がまちがっている', '同じ授業が2つある', '不適切な内容', '荒らされている', 'その他']
} as const;

export type ReportTarget = keyof typeof REPORT_REASONS;

const DETAIL_MAX = 500;

/** Saves a report, or returns the message to show. */
export async function saveReport(db: Db, reporterId: string, targetType: ReportTarget, targetId: string, form: FormData) {
	const reason = String(form.get('reason') ?? '');
	if (!(REPORT_REASONS[targetType] as readonly string[]).includes(reason)) return '理由を選んでください';
	const detail = String(form.get('detail') ?? '').trim();
	if ([...detail].length > DETAIL_MAX) return `くわしい内容は${DETAIL_MAX}文字までです`;
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
	await db.insert(reports).values({ reporterId, targetType, targetId, reason, detail: detail || null });
	return null;
}
