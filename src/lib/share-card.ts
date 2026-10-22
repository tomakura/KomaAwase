// What shows when a link is shared (LINE, X, Slack…): a title, a line and a picture. Crawlers
// don't run scripts, so the root layout writes these into the page's HTML; a page with its own
// card returns `card` from its load. The pictures are drawn by scripts/make-og.mjs.
export type ShareCard = { title: string; description: string; image: string; alt: string };

export const APP_CARD: ShareCard = {
	title: 'コマあわせ',
	description: '友だちと時間割を共有しよう。',
	image: '/og.png',
	alt: 'コマあわせ。友だちと時間割を共有しよう。'
};

// Someone's friend link (/add/…)
export function friendCard(name: string): ShareCard {
	return {
		title: `${name}さんと友だちになろう`,
		description: 'コマあわせで時間割を共有しよう。',
		image: '/og-friend.png',
		alt: 'コマあわせ。友だちになって、時間割を見せあおう。'
	};
}

// A group invite (/join/…)
export function groupCard(name: string): ShareCard {
	return {
		title: `「${name}」に参加しよう`,
		description: 'コマあわせでメンバーの空きコマを確認しよう。',
		image: '/og-group.png',
		alt: 'コマあわせ。グループで空きコマを探そう。'
	};
}
