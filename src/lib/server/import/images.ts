// A screenshot job keeps its image in one column: a data URL, or, for a timetable cut into
// cells (import-grid.ts), a JSON list of the data URLs of its sheets.
export const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
export const SHEETS_MAX = 6;

/** The pictures a stored image holds, or null when it is not one or a list of them */
export function imagesOf(stored: string): string[] | null {
	if (!stored.startsWith('[')) return IMAGE_PATTERN.test(stored) ? [stored] : null;
	let list: unknown;
	try {
		list = JSON.parse(stored);
	} catch {
		return null;
	}
	if (!Array.isArray(list) || !list.length || list.length > SHEETS_MAX) return null;
	return list.every((u) => typeof u === 'string' && IMAGE_PATTERN.test(u)) ? (list as string[]) : null;
}
