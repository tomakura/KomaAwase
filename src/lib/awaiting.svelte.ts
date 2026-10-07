// Something the screen waits on that isn't a navigation (a course read before it opens over the
// timetable): the ring of src/lib/components/NavigationWait.svelte shows for it too
export const awaiting = $state({ count: 0 });

export async function awaited<T>(work: Promise<T>) {
	awaiting.count++;
	try {
		return await work;
	} finally {
		awaiting.count--;
	}
}
