// The backup files, made and read in the browser: the JSON from /more/data, or a ZIP with it
// and the course files. The ZIP is put together here, not on the server, since the files can
// add up to 100MB.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

type ExportFile = { name: string; mime: string; size: number; url?: string; path?: string };
type ExportData = { timetables: { year: number; courses: { title: string; files: ExportFile[] }[] }[] };

export function saveBlob(blob: Blob, name: string) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Names in the ZIP: no slashes or control characters, and kept short
const safe = (s: string) => [...s.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_')].slice(0, 40).join('') || '_';

/** The ZIP: data.json, and each file under files/. `progress` is told how many files are done. */
export async function makeBackupZip(progress: (done: number, total: number) => void = () => {}) {
	const res = await fetch('/more/data', { cache: 'no-store' });
	if (!res.ok) throw new Error('data');
	const data = (await res.json()) as ExportData;
	const files = data.timetables.flatMap((t) =>
		t.courses.flatMap((c, ci) => c.files.filter((f) => f.url).map((f, fi) => ({ f, path: `files/${t.year}/${ci + 1}-${safe(c.title)}/${fi + 1}-${safe(f.name)}` })))
	);
	const zip: Zippable = {};
	let done = 0;
	progress(0, files.length);
	for (const { f, path } of files) {
		const r = await fetch(f.url!, { cache: 'no-store' });
		if (!r.ok) throw new Error('file');
		// Already compressed (PDF, images, Office), so stored as they are
		zip[path] = [new Uint8Array(await r.arrayBuffer()), { level: 0 }];
		f.path = path;
		delete f.url;
		progress(++done, files.length);
	}
	for (const t of data.timetables) for (const c of t.courses) for (const f of c.files) delete f.url;
	zip['data.json'] = strToU8(JSON.stringify(data, null, 2));
	const bytes = zipSync(zip);
	return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

/** A chosen backup file: its JSON text and, from a ZIP, the files by their path */
export async function openBackup(file: File): Promise<{ json: string; files: Map<string, Uint8Array> } | null> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	// "PK": a ZIP
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		try {
			const entries = unzipSync(bytes);
			const json = entries['data.json'];
			if (!json) return null;
			return { json: strFromU8(json), files: new Map(Object.entries(entries).filter(([k]) => k.startsWith('files/'))) };
		} catch {
			return null;
		}
	}
	return { json: new TextDecoder().decode(bytes), files: new Map() };
}
