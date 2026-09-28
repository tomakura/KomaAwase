// A user's icon is one or two characters on a color. Every color keeps white text at 4.8:1 or more.
export const ICON_COLORS = [
	{ id: 'shu', label: '朱', hex: '#B9502B' },
	{ id: 'ai', label: '藍', hex: '#2F5F99' },
	{ id: 'murasaki', label: '紫', hex: '#7A4E96' },
	{ id: 'midori', label: '緑', hex: '#3E7A4E' },
	{ id: 'aomidori', label: '青緑', hex: '#2B7472' },
	{ id: 'beni', label: '紅', hex: '#A3405F' },
	{ id: 'yamabuki', label: '山吹', hex: '#8A6414' },
	{ id: 'cha', label: '茶', hex: '#6E5A48' },
	{ id: 'sumi', label: '墨', hex: '#4A443C' }
] as const;

export type IconColor = (typeof ICON_COLORS)[number]['id'];

export const ICON_TEXT_MAX = 2;
export const NICKNAME_MAX = 20;

const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });

export function splitGraphemes(text: string) {
	return [...graphemes.segment(text)].map((s) => s.segment);
}

export function isIconColor(id: string): id is IconColor {
	return ICON_COLORS.some((c) => c.id === id);
}

// People who haven't picked a color get one from their id, so it stays the same.
function colorFor(id: string) {
	let hash = 0;
	for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return ICON_COLORS[hash % ICON_COLORS.length];
}

export type IconSource = { id: string; nickname: string | null; icon: { color: string; text: string } | null };

export function iconOf(user: IconSource) {
	const color = user.icon && isIconColor(user.icon.color) ? ICON_COLORS.find((c) => c.id === user.icon!.color)! : colorFor(user.id);
	const text = user.icon?.text || splitGraphemes(user.nickname?.trim() || '?')[0];
	return { hex: color.hex, text };
}
