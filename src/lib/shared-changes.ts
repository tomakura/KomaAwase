import { DAY_NAMES, deliveryLabel, weekLabel, type Delivery, type WeekPattern } from './courses';

// The shared values of a course as an edit records them (src/lib/server/shared-courses.ts)
export type SharedValuesLike = {
	title: string;
	teachers: string[];
	slots: { weekday: number; period: number; span: number; week?: WeekPattern; room: string | null }[];
	delivery: Delivery | null;
	intensiveFrom: string | null;
	intensiveTo: string | null;
	credits?: number | null; // edits from before credits were kept have none
};

export const slotText = (s: SharedValuesLike['slots'][number]) =>
	`${DAY_NAMES[s.weekday]}${s.period}限${s.span > 1 ? `〜${s.period + s.span - 1}限` : ''}${weekLabel(s.week) ? `（${weekLabel(s.week)}）` : ''}`;

/** The values as people read them, by label */
export const sharedFields = (v: SharedValuesLike) => ({
	授業名: v.title,
	先生: v.teachers.join('・') || 'なし',
	'曜日・時限': v.slots.map(slotText).join('、') || deliveryLabel(v.delivery, v.intensiveFrom, v.intensiveTo) || 'なし',
	教室: [...new Set(v.slots.map((s) => s.room).filter(Boolean))].join('、') || 'なし',
	単位数: v.credits ? `${v.credits}単位` : 'なし'
});

export type SharedChange = { label: string; before: string; after: string };

/** What differs between two sets of values, field by field */
export function sharedChanges(before: SharedValuesLike, after: SharedValuesLike): SharedChange[] {
	const a = sharedFields(before);
	const b = sharedFields(after);
	return (Object.keys(b) as (keyof typeof b)[]).flatMap((label) => (a[label] === b[label] ? [] : [{ label, before: a[label], after: b[label] }]));
}

const monthDay = (ms: number) => {
	// Japan time
	const d = new Date(ms + 9 * 60 * 60 * 1000);
	return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};

/** Where a shared course's values come from, and when they were last looked at or changed */
export function sharedSource(c: { source: 'syllabus' | 'user'; version: number; createdAt: number; updatedAt: number }) {
	if (c.source === 'syllabus') {
		const base = `シラバスから（${monthDay(c.createdAt)} 確認）`;
		return c.version > 1 ? `${base}、利用者が直した（${monthDay(c.updatedAt)}）` : base;
	}
	return `利用者が入力（${monthDay(c.updatedAt)} 更新）`;
}
