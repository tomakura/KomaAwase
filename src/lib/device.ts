// A rough name for the device a session is on, from its browser's user agent, as in
// 「iPhone・Safari」. Model names aren't there (and aren't wanted); null when unknown.

const SYSTEMS: [RegExp, string][] = [
	[/iPhone|iPod/, 'iPhone'],
	[/iPad/, 'iPad'],
	[/Android/, 'Android'],
	[/CrOS/, 'Chromebook'],
	[/Windows/, 'Windows'],
	[/Macintosh|Mac OS X/, 'Mac'],
	[/Linux/, 'Linux']
];

// In order: most browsers also say Safari or Chrome
const BROWSERS: [RegExp, string][] = [
	[/\bLine\//, 'LINE'],
	[/EdgA?\/|EdgiOS\//, 'Edge'],
	[/OPR\/|OPiOS\//, 'Opera'],
	[/SamsungBrowser\//, 'Samsung Internet'],
	[/FxiOS\/|Firefox\//, 'Firefox'],
	[/CriOS\/|Chrome\//, 'Chrome'],
	[/Safari\//, 'Safari']
];

export function deviceName(userAgent: string | null | undefined): string | null {
	if (!userAgent) return null;
	const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
	const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
	if (!system && !browser) return null;
	return [system, browser].filter(Boolean).join('・');
}
