// How much of one's timetable friends, or a group, see: the classes, only when one is busy
// (A14), or nothing.
export type ShareChoice = 'all' | 'free' | 'none';

export const SHARE_CHOICES: readonly { id: ShareChoice; label: string }[] = [
	{ id: 'all', label: '全部' },
	{ id: 'free', label: '空き時間だけ' },
	{ id: 'none', label: '見せない' }
];

export const SHARE_NOTES: Record<ShareChoice, string> = {
	all: '授業名・教室も見えます。メモ・資料・課題は見えません。',
	free: '授業がある時間だけが見えます。授業名・教室、メモ・資料・課題は見えません。',
	none: '時間割は見えません。'
};

export function readShareChoice(input: FormDataEntryValue | null): ShareChoice | null {
	return input === 'all' || input === 'free' || input === 'none' ? input : null;
}

// A group member's choice is kept as two columns, so rows from before the choice had three keep working
export const choiceOf = (m: { shareTimetable: boolean; freeOnly: boolean }): ShareChoice =>
	!m.shareTimetable ? 'none' : m.freeOnly ? 'free' : 'all';

export const columnsOf = (choice: ShareChoice) => ({ shareTimetable: choice !== 'none', freeOnly: choice === 'free' });

// When a group's invite no longer lets anyone in (A16, A17)
export const INVITE_CLOSED = {
	expired: 'この招待リンクは期限が切れました。招待した人に新しいリンクをもらってください。',
	used: 'この招待リンクは決まった人数に達しました。招待した人に新しいリンクをもらってください。'
};
