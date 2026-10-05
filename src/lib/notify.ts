import { toMinutes } from './time';

// The kinds of notification, as the settings list them. Each is on unless turned off, but
// those marked `off` start off.
export const NOTIFY_KINDS = [
	{ id: 'friendRequest', label: '友だち申請が届いたとき' },
	{ id: 'friendAccepted', label: '友だち申請が承認されたとき' },
	{ id: 'importDone', label: 'スクショの読み取りが終わったとき' },
	{ id: 'groupJoin', label: 'グループに新しい人が参加したとき' },
	{ id: 'groupRequest', label: '管理しているグループに参加の申請が届いたとき' },
	{ id: 'groupApproved', label: 'グループへの参加が承認されたとき' },
	{ id: 'planEve', label: '前の日の20時に、明日の課題と予定を知らせる' },
	{ id: 'taskMorning', label: '締め切りの日の朝8時に、今日の課題を知らせる', off: true },
	{ id: 'taskBefore3h', label: '締め切りの3時間前に知らせる', off: true },
	{ id: 'taskBefore1h', label: '締め切りの1時間前に知らせる', off: true },
	{ id: 'sharedChange', label: '同期している授業の内容が変わったとき' },
	{ id: 'feedbackReply', label: '送った要望に運営から返事が来たとき' }
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number]['id'];

const startsOff = new Set<string>(NOTIFY_KINDS.filter((k) => 'off' in k).map((k) => k.id));

/** Whether a person with these settings wants this kind */
export function wants(settings: Partial<Record<string, unknown>> | null | undefined, kind: NotifyKind) {
	const value = settings?.[kind];
	return typeof value === 'boolean' ? value : !startsOff.has(kind);
}

// When quiet hours are turned on, the times they start with
export const QUIET_DEFAULT = { from: '23:00', to: '07:00' };

/** Whether `minutes` (since midnight, Japan time) falls in the quiet hours; they may run past midnight */
export function isQuiet(quiet: { from: string; to: string } | undefined, minutes: number) {
	if (!quiet) return false;
	const from = toMinutes(quiet.from);
	const to = toMinutes(quiet.to);
	if (from === to) return false;
	return from < to ? from <= minutes && minutes < to : minutes >= from || minutes < to;
}
