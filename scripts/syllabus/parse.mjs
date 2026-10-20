// Turns what the syllabus search shows into the courses the admin's シラバスの取り込み takes
// (src/lib/server/syllabus.ts). Plain JS so fetch.mjs runs with node alone; tested in
// src/lib/syllabus-parse.test.ts.

const DAYS = '月火水木金土日';

const clean = (s) => String(s ?? '').normalize('NFKC').replace(/[ \t]+/g, ' ').trim();
const lines = (s) =>
	String(s ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((l) => l.replace(/[ \t　]+$/g, '').replace(/^[ \t]+/, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/**
 * 水5 水6 → one slot of two periods. Periods of the same day that follow one another are one
 * class; `week` is every, odd or even (隔週奇数・隔週偶数).
 */
export function parseSlots(text, week = 'every') {
	const found = [...clean(text).matchAll(/([月火水木金土日])曜?\s*(\d+)限?/g)].map((m) => ({
		weekday: DAYS.indexOf(m[1]) + 1,
		period: Number(m[2])
	}));
	found.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
	const slots = [];
	for (const f of found) {
		const last = slots.at(-1);
		if (last && last.weekday === f.weekday && last.period + last.span === f.period) last.span += 1;
		else if (!last || last.weekday !== f.weekday || last.period + last.span <= f.period) slots.push({ ...f, span: 1, week });
	}
	return slots;
}

// 2026年度 3Q(後期) → Q3; 前期, 後期 and 通年 are the quarters in them
export function parseTerms(list) {
	const terms = new Set();
	let year = null;
	for (const raw of list) {
		const t = clean(raw);
		const y = t.match(/(\d{4})年度/);
		if (y) year ??= Number(y[1]);
		const q = t.match(/([1-4])\s*Q/i);
		if (q) terms.add(`Q${q[1]}`);
		else if (t.includes('通年') || t.includes('通期')) ['Q1', 'Q2', 'Q3', 'Q4'].forEach((x) => terms.add(x));
		else if (t.includes('前期')) ['Q1', 'Q2'].forEach((x) => terms.add(x));
		else if (t.includes('後期')) ['Q3', 'Q4'].forEach((x) => terms.add(x));
	}
	return { year, terms: [...terms].sort() };
}

const ONLINE = /オンデマンド|オンライン|遠隔|リモート|メディア授業/;

/**
 * 10000001 演習A 【セット履修】 ※旧… → its code and a plain name. Notes in 【】 and after ※
 * are left out, so the name matches what people typed; whether it is held online is kept.
 */
export function parseTitle(text) {
	const t = clean(text);
	const m = t.match(/^([0-9A-Za-z-]+)\s+(.*)$/);
	const code = m ? m[1] : '';
	const full = m ? m[2] : t;
	const title = clean(full.replace(/【[^】]*】/g, ' ').replace(/※.*$/, '').replace(/(オンデマンド|オンライン)\s*$/, ''));
	return { code, title: title || full, online: ONLINE.test(full) };
}

/**
 * One course from a row of the search results and the label/value pairs of its シラバス照会
 * dialog (pairs may be empty when only the list was read).
 * row: { slots, title, teachers, kind, terms: [..], credits }
 */
export function parseCourse(row, pairs = []) {
	const { code, title, online } = parseTitle(row.title);
	const kind = clean(row.kind);
	const week = kind.includes('偶数') ? 'even' : kind.includes('奇数') ? 'odd' : 'every';
	const intensive = kind.includes('集中');
	const slots = intensive ? [] : parseSlots(row.slots, week);
	const { year, terms } = parseTerms(row.terms ?? []);
	const credits = Number(clean(row.credits).match(/[\d.]+/)?.[0]);
	const teachers = clean(row.teachers)
		.split(/[／/、,]/)
		.map((t) => clean(t))
		.filter(Boolean);

	const value = (label) => lines(pairs.find((p) => clean(p.label) === label)?.text ?? '');
	const summary = value('授業概要');
	const goals = value('到達目標');
	const outline = [summary && `授業概要\n${summary}`, goals && `到達目標\n${goals}`].filter(Boolean).join('\n\n') || null;
	const classes = pairs
		.filter((p) => /^第\s*\d+\s*回$/.test(clean(p.label)))
		.map((p) => {
			const label = clean(p.label).replace(/\s/g, '');
			const text = lines(p.text);
			if (!text) return '';
			return clean(text.split('\n')[0]).replace(/\s/g, '').startsWith(label) ? text : `${label}\n${text}`;
		})
		.filter(Boolean);

	return {
		year,
		course: {
			code,
			title,
			terms,
			teachers,
			slots,
			delivery: intensive ? 'intensive' : slots.length ? null : 'ondemand',
			intensiveFrom: null,
			intensiveTo: null,
			credits: Number.isFinite(credits) ? credits : null,
			online,
			outline,
			schedule: classes.length ? classes.join('\n\n') : null
		}
	};
}
