// The kinds of notification, as the settings list them. Each is on unless turned off.
export const NOTIFY_KINDS = [
	{ id: 'friendRequest', label: '友だち申請が届いたとき' },
	{ id: 'friendAccepted', label: '友だち申請が承認されたとき' },
	{ id: 'importDone', label: 'スクショの読み取りが終わったとき' },
	{ id: 'groupJoin', label: 'グループに新しい人が参加したとき' },
	{ id: 'groupRequest', label: '作ったグループに参加の申請が届いたとき' },
	{ id: 'groupApproved', label: 'グループへの参加が承認されたとき' },
	{ id: 'planEve', label: '前の日の20時に、明日の課題と予定を知らせる' }
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number]['id'];
