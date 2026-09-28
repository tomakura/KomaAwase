export type Theme = 'system' | 'light' | 'dark';

export const THEMES: { id: Theme; label: string }[] = [
	{ id: 'system', label: '端末に合わせる' },
	{ id: 'light', label: 'ライト' },
	{ id: 'dark', label: 'ダーク' }
];

// Matches --bg in app.css, for the browser's toolbar
const BG = { light: '#F6F2EA', dark: '#1C1A18' };

export function themeColorTags(theme: Theme) {
	if (theme !== 'system') return `<meta name="theme-color" content="${BG[theme]}" />`;
	return (
		`<meta name="theme-color" content="${BG.light}" media="(prefers-color-scheme: light)" />` +
		`<meta name="theme-color" content="${BG.dark}" media="(prefers-color-scheme: dark)" />`
	);
}

// Switches the page right away, before the choice is saved.
export function applyTheme(theme: Theme) {
	document.documentElement.dataset.theme = theme;
	for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
	document.head.insertAdjacentHTML('afterbegin', themeColorTags(theme));
}
