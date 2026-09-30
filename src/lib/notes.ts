// The order memos are shown in. Newest on top: the later day first, and of the same day the one
// added later. Once someone has put them in an order by hand, that order is kept. `list` comes
// in the order the memos were added.
export function orderMemos<T extends { date: string | null; sortOrder: number | null }>(list: T[]): T[] {
	const placed = list.some((n) => n.sortOrder !== null);
	return list
		.map((note, added) => ({ note, added }))
		.sort((a, b) => {
			if (placed) {
				// Added since the last hand-made order: on top (it has no place yet). Two of those
				// are equal here (NaN) and go by day.
				const byPlace = (a.note.sortOrder ?? -Infinity) - (b.note.sortOrder ?? -Infinity);
				if (byPlace) return byPlace;
			}
			return (b.note.date ?? '').localeCompare(a.note.date ?? '') || b.added - a.added;
		})
		.map((x) => x.note);
}

// `ids` with one moved a step up (-1) or down (1); unchanged at either end
export function moveId(ids: string[], id: string, step: -1 | 1) {
	const from = ids.indexOf(id);
	const to = from + step;
	if (from < 0 || to < 0 || to >= ids.length) return ids;
	const next = [...ids];
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}
