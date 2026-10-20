/**
 * Text as it is saved and searched: full-width letters, digits and spaces become half-width
 * (NFKC, so Ⅰ becomes I too), runs of spaces become one, and the ends are trimmed.
 * The same name typed two ways is then one name.
 */
export function cleanText(input: string) {
	return input.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** The room of a class held online, however it was typed */
export const ONLINE_ROOM = 'オンライン';

// Typed for an online class instead of a room (compared in lower case, spaces removed).
// 0032 changes the rooms saved before with the same list.
export const ONLINE_WORDS = ['オンライン', 'オンライン授業', '遠隔', '遠隔授業', 'リモート', 'リモート授業', 'online', 'zoom', 'teams', 'meet', 'googlemeet', 'webex'];

/** A room as it is saved: cleaned, with rooms split by a slash written E15 / E16, and オンライン for an online class */
export function cleanRoom(input: string) {
	const room = cleanText(input).replace(/\s*\/\s*/g, ' / ');
	return ONLINE_WORDS.includes(room.toLowerCase().replaceAll(' ', '')) ? ONLINE_ROOM : room;
}
