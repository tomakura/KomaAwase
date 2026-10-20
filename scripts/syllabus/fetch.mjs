// Reads the university's public syllabus search into a file for 運営 → シラバスの取り込み.
//
//   cd scripts/syllabus && npm install && npx playwright install chromium
//   node fetch.mjs --url <シラバス検索の URL> --out syllabus.json
//
// A browser opens on the search page. Pick the conditions there (開講年度学期, 授業管理部署 大学),
// press 検索 and show 100 a page, then press Enter in the terminal. Every course of the results
// is opened in turn (one a second) for its 授業概要・到達目標 and 授業内容. Run it again with
// other conditions and the same --out to add more courses (a quarter at a time, say); courses
// already in the file are read again only with --again. The URL isn't kept in the repository.

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { chromium } from 'playwright';
import { parseCourse } from './parse.mjs';

const arg = (name) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const url = arg('url');
const out = arg('out') ?? 'syllabus.json';
const again = process.argv.includes('--again');
const listOnly = process.argv.includes('--list-only');
if (!url) {
	console.error('--url にシラバス検索の URL を入れてください');
	process.exit(1);
}

const file = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { year: null, courses: [] };
const byCode = new Map(file.courses.map((c) => [c.code, c]));
const save = () => {
	file.courses = [...byCode.values()];
	fs.writeFileSync(out, `${JSON.stringify(file, null, '\t')}\n`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ROWS = '[id="funcForm:table_data"] tr[data-ri]';
const DIALOG = '.ui-dialog[aria-hidden="false"]';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const first = await context.newPage();
await first.goto(url);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('条件を選んで「検索」を押し、表示件数を100にしたら Enter を押してください ');
rl.close();

// The portal may open the syllabus search in a new tab: read the tab that shows the results
let page;
for (const p of context.pages().reverse()) {
	if (await p.$(ROWS).catch(() => null)) {
		page = p;
		break;
	}
}
if (!page) {
	console.error('検索結果の一覧が見つかりません。開いているタブ：');
	for (const p of context.pages()) console.error(`  ${await p.title().catch(() => '')} ${p.url()}`);
	await browser.close();
	process.exit(1);
}

async function readRows() {
	return page.$$eval(ROWS, (trs) =>
		trs.map((tr) => {
			const td = [...tr.querySelectorAll('td')].map((c) => c.innerText.trim());
			// data-ri counts across pages (100… on the second), as the row's ids do
			const ri = tr.getAttribute('data-ri');
			return { ri, slots: td[0], title: td[1], teachers: td[2], kind: td[3], terms: td[4].split('\n'), credits: td[5] };
		})
	);
}

// The シラバス照会 dialog of row ri: its label and value cells, in order
async function readDialog(ri, code) {
	await page.click(`[id="funcForm:table:${ri}:jugyoKmkName"]`);
	await page.waitForFunction(
		([sel, c]) => [...document.querySelectorAll(sel)].some((d) => d.innerText.includes(c) && d.innerText.includes('授業概要')),
		[DIALOG, code],
		{ timeout: 20000 }
	);
	const pairs = await page.$$eval(`${DIALOG} .ui-widget-header.colStyle`, (hs) =>
		hs.map((h) => ({ label: h.innerText.trim(), text: h.nextElementSibling?.innerText ?? '' }))
	);
	await page.click(`${DIALOG} .ui-dialog-titlebar-close`);
	await page.waitForSelector(DIALOG, { state: 'detached', timeout: 5000 }).catch(() => {});
	return pairs;
}

let pageNo = 1;
for (;;) {
	const rows = await readRows();
	console.log(`${pageNo}ページ目：${rows.length}件`);
	for (const row of rows) {
		const listed = parseCourse(row);
		const code = listed.course.code;
		if (!code) continue;
		file.year ??= listed.year;
		const had = byCode.get(code);
		// A course whose details couldn't be read is tried again
		if (had && !again && (listOnly || had.outline || had.schedule)) {
			// The same course in another quarter's search: only its terms grow
			had.terms = [...new Set([...had.terms, ...listed.course.terms])].sort();
			continue;
		}
		let pairs = [];
		if (!listOnly) {
			try {
				pairs = await readDialog(row.ri, code);
			} catch {
				console.log(`  ${code}：詳しい内容を読めませんでした（一覧の内容だけ入れます）`);
			}
			await wait(1000);
		}
		const { course } = parseCourse(row, pairs);
		byCode.set(code, had ? { ...course, terms: [...new Set([...had.terms, ...course.terms])].sort() } : course);
		console.log(`  ${code} ${course.title}`);
		save();
	}
	save();
	// The paginator is drawn above and below the table, and one of them can be hidden
	const next = page.locator('.ui-paginator-next:not(.ui-state-disabled):visible').first();
	if (!(await next.count())) break;
	const top = rows[0]?.title;
	await next.click();
	await page.waitForFunction(
		([sel, t]) => document.querySelector(sel)?.innerText.includes(t) === false,
		[`${ROWS} td:nth-child(2)`, top ?? ''],
		{ timeout: 20000 }
	);
	pageNo += 1;
}

await browser.close();
console.log(`${out} に ${byCode.size}件 書き出しました`);
