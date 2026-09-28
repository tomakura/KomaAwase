import type { Db } from './db';
import { reports } from './db/schema';

export const REPORT_REASONS = {
	user: ['なりすまし', '迷惑な申請', 'いやがらせ', 'その他'],
	group: ['不適切な名前', '迷惑な招待', 'その他'],
	shared_course: ['内容がまちがっている', '同じ授業が2つある', '荒らされている', 'その他']
} as const;

export type ReportTarget = keyof typeof REPORT_REASONS;

const DETAIL_MAX = 500;

/** Saves a report, or returns the message to show. */
export async function saveReport(db: Db, reporterId: string, targetType: ReportTarget, targetId: string, form: FormData) {
	const reason = String(form.get('reason') ?? '');
	if (!(REPORT_REASONS[targetType] as readonly string[]).includes(reason)) return '理由を選んでください';
	const detail = String(form.get('detail') ?? '').trim();
	if ([...detail].length > DETAIL_MAX) return `くわしい内容は${DETAIL_MAX}文字までです`;
	await db.insert(reports).values({ reporterId, targetType, targetId, reason, detail: detail || null });
	return null;
}
