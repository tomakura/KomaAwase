// Demo data for the promo screenshots. Local D1 only: every id starts with "dm-", and the
// university, people, classes and teachers are all made up.
//   node promo/seed.mjs && npx wrangler d1 execute DB --local --file promo/out/seed.sql
// It signs in as あおい with a fixed session token (local only), which capture.mjs uses.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const TOKEN = 'demo-promo-session-token-komaawase-000000001';
const hash = createHash('sha256').update(TOKEN).digest('base64url');
const now = Date.now();
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const out = [];
const ins = (table, row) => out.push(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(q).join(',')});`);

const UNIV = 'dm-univ';
out.push("DELETE FROM users WHERE id LIKE 'dm-%';", "DELETE FROM friend_groups WHERE id LIKE 'dm-%';", "DELETE FROM shared_courses WHERE id LIKE 'dm-%';", "DELETE FROM universities WHERE id = 'dm-univ';");
ins('universities', { id: UNIV, name: 'みなと大学', email_domains: '["minato.example.ac.jp"]', source: 'preset' });

const people = [
	['dm-me', 'demo@example.test', 'あおい', 'shu', 'あ'],
	['dm-yui', 'yui@example.test', 'ゆい', 'beni', 'ゆ'],
	['dm-sota', 'sota@example.test', 'そうた', 'midori', 'そ'],
	['dm-rin', 'rin@example.test', 'りん', 'murasaki', 'り'],
	['dm-haru', 'haru@example.test', 'はる', 'ai', 'は'],
	['dm-kai', 'kai@example.test', 'かい', 'yamabuki', 'か'],
	['dm-takumi', 'takumi@example.test', 'たくみ', 'aomidori', 'た']
];
for (const [id, email, nick, color, text] of people) {
	ins('users', {
		id, email, nickname: nick, icon: JSON.stringify({ color, text }), theme: 'system', days_shown: '[1,2,3,4,5]',
		university_id: UNIV, setup_at: now - 20 * 864e5, friend_code: `DM${id.slice(3).toUpperCase().padEnd(8, 'X')}`.slice(0, 10),
		role: id === 'dm-me' ? 'admin' : null, notify: '{}', share_cancellations: 1, import_consent_at: null, created_at: now - 30 * 864e5
	});
	ins('univ_verifications', { user_id: id, university_id: UNIV, email: `${id.slice(3)}@minato.example.ac.jp`, verified_at: now - 20 * 864e5, expires_at: Date.UTC(2027, 3, 30, 15) });
	const tt = `dm-tt-${id.slice(3)}`;
	ins('timetables', { id: tt, user_id: id, university_id: UNIV, year: 2026, name: '2026年度', archived: 0, created_at: now - 20 * 864e5 });
	[['Q1', '前期', '2026-04-01', '2026-06-09'], ['Q2', '前期', '2026-06-10', '2026-08-11'], ['Q3', '後期', '2026-09-24', '2026-11-25'], ['Q4', '後期', '2026-11-30', '2027-02-08']].forEach(([n, g, s, e], i) =>
		ins('terms', { id: `${tt}-${n}`, timetable_id: tt, name: n, group_name: g, start_date: s, end_date: e, sort_order: i })
	);
	[['08:40', '10:10'], ['10:20', '11:50'], ['12:40', '14:10'], ['14:20', '15:50'], ['16:00', '17:30'], ['17:40', '19:10']].forEach(([s, e], i) =>
		ins('periods', { id: `${tt}-p${i + 1}`, timetable_id: tt, number: i + 1, start_time: s, end_time: e })
	);
}
// あおい shows five periods
out.push(`DELETE FROM sessions WHERE user_id = 'dm-me';`, `DELETE FROM periods WHERE id = 'dm-tt-me-p6';`);
ins('sessions', { id: hash, user_id: 'dm-me', expires_at: now + 30 * 864e5, created_at: now, last_used_at: now, authed_at: now, user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });

// Shared courses: key → [title, teachers, credits, slots [weekday, period, span, room, pattern], source, code]
const S = {
	EN: ['英語コミュニケーション', ['森 さやか'], 2, [[1, 1, 1, 'R201'], [3, 2, 1, 'R201']], 'syllabus', 'EN1021'],
	DES: ['デザイン論', ['高橋 りょう'], 2, [[1, 3, 1, '3A']], 'syllabus', 'DS2031'],
	MKT: ['マーケティング基礎', ['山本 けい'], 2, [[1, 4, 1, '4B']], 'syllabus', 'BM1104'],
	STAT: ['統計学入門', ['佐藤 ゆうこ'], 2, [[2, 2, 1, '2C']], 'syllabus', 'MA1201'],
	PROG: ['プログラミング演習', ['中村 たかし', '小林 あや'], 2, [[2, 3, 2, 'PC1']], 'syllabus', 'CS1301'],
	PSY: ['心理学概論', ['伊藤 まなぶ'], 2, [[3, 1, 1, '1A']], 'syllabus', 'HU1002'],
	PHOTO: ['写真表現', ['加藤 ひかり'], 1, [[3, 5, 1, 'S1', 'odd']], 'user', null],
	MGT: ['経営学入門', ['渡辺 こうじ'], 2, [[4, 2, 1, '5A']], 'syllabus', 'BM1001'],
	VIDEO: ['映像表現', ['吉田 あきら'], 2, [[4, 3, 1, 'M201']], 'syllabus', 'MD2105'],
	DATA: ['データ分析', ['佐藤 ゆうこ'], 2, [[4, 4, 1, 'PC2']], 'syllabus', 'MA2202'],
	INFO: ['情報リテラシー', ['松本 なお'], 1, [[5, 1, 1, 'PC1']], 'syllabus', 'CS1001'],
	SEMI: ['ゼミナール', ['井上 まこと'], 2, [[5, 3, 1, '7F']], 'syllabus', 'SM3001'],
	FR: ['フランス語', ['木村 える'], 1, [[1, 2, 1, 'R105']], 'syllabus', 'FL1101'],
	BOKI: ['簿記入門', ['林 ともこ'], 2, [[5, 2, 1, '4A']], 'syllabus', 'BM1202'],
	PE: ['体育実技', ['清水 だいち'], 1, [[2, 5, 1, '体育館']], 'syllabus', 'PE1001'],
	LAW: ['法学入門', ['山口 けんじ'], 2, [[1, 1, 1, '6C']], 'syllabus', 'LW1001'],
	CN: ['中国語', ['陳 りん'], 1, [[3, 2, 1, 'R106']], 'syllabus', 'FL1301'],
	DB: ['データベース', ['中村 たかし'], 2, [[4, 5, 1, 'PC2']], 'syllabus', 'CS2201'],
	PHIL: ['哲学', ['斎藤 しん'], 2, [[2, 1, 1, '1B']], 'syllabus', 'HU1101'],
	MUSIC: ['音楽論', ['石井 そら'], 2, [[5, 5, 1, 'ホール']], 'user', null],
	WEB: ['Webデザイン演習', ['高橋 りょう'], 2, [[3, 3, 1, 'PC3']], 'syllabus', 'DS2201'],
	LIT: ['日本文学論', ['前田 ふみ'], 2, [[3, 3, 1, '2A']], 'syllabus', 'HU2301'],
	ANIME: ['アニメーション基礎', ['岡田 じゅん'], 2, [[3, 3, 1, 'S2']], 'user', null],
	CAREER: ['キャリアデザイン', ['藤田 まい'], 1, [], 'syllabus', 'CA1001']
};
for (const [k, [title, teachers, credits, slots, source, code]] of Object.entries(S)) {
	const id = `dm-sc-${k}`;
	ins('shared_courses', { id, university_id: UNIV, year: 2026, code, title, terms: '["Q3"]', delivery: slots.length ? null : 'ondemand', credits, source, version: 1, created_at: now - 25 * 864e5, updated_at: now - 25 * 864e5 });
	slots.forEach(([w, p, span, room, pat], i) => ins('shared_course_slots', { id: `${id}-s${i}`, shared_course_id: id, weekday: w, period_number: p, span, week_pattern: pat ?? 'every', room }));
	teachers.forEach((name, i) => ins('shared_course_teachers', { id: `${id}-t${i}`, shared_course_id: id, name, sort_order: i }));
}

// Who takes what (all synced), with the color each person chose
const takes = {
	me: { EN: 'purple', DES: 'orange', MKT: 'mint', STAT: 'yellow', PROG: 'blue', PSY: 'red', PHOTO: 'lime', MGT: 'green', VIDEO: 'indigo', DATA: 'blue', INFO: 'mint', SEMI: 'gray', CAREER: 'orange' },
	yui: { EN: 'blue', FR: 'purple', STAT: 'yellow', PSY: 'red', VIDEO: 'indigo', DATA: 'mint', BOKI: 'green', PE: 'orange' },
	sota: { LAW: 'gray', DES: 'orange', PROG: 'blue', CN: 'red', MGT: 'green', DB: 'purple', INFO: 'mint' },
	rin: { PHIL: 'yellow', EN: 'purple', PSY: 'red', VIDEO: 'indigo', SEMI: 'gray', MUSIC: 'lime' },
	haru: { PHOTO: 'lime', MKT: 'mint', STAT: 'yellow' },
	kai: { PHOTO: 'lime', PROG: 'blue', DB: 'purple' },
	takumi: { EN: 'purple' }
};
for (const [who, list] of Object.entries(takes)) {
	const tt = `dm-tt-${who}`;
	for (const [k, color] of Object.entries(list)) {
		const [title, teachers, , slots] = S[k];
		const cid = `dm-c-${who}-${k}`;
		ins('courses', { id: cid, timetable_id: tt, shared_course_id: `dm-sc-${k}`, sync_mode: 'synced', title, color, delivery: slots.length ? null : 'ondemand', credits: null, absence_limit: who === 'me' ? 4 : null, created_at: now - 19 * 864e5 });
		ins('course_terms', { course_id: cid, term_id: `${tt}-Q3` });
		slots.forEach(([w, p, span, room, pat], i) => ins('course_slots', { id: `${cid}-s${i}`, course_id: cid, weekday: w, period_number: p, span, week_pattern: pat ?? 'every', room }));
		teachers.forEach((name, i) => ins('course_teachers', { id: `${cid}-t${i}`, course_id: cid, name, sort_order: i }));
	}
}

// Friends: yui, sota, rin accepted; takumi asks
const pair = (a, b) => [a, b].sort().join(':');
for (const f of ['dm-yui', 'dm-sota', 'dm-rin']) ins('friendships', { id: `dm-f-${f}`, requester_id: f, addressee_id: 'dm-me', pair: pair(f, 'dm-me'), status: 'accepted', created_at: now - 15 * 864e5, accepted_at: now - 15 * 864e5 });
ins('friendships', { id: 'dm-f-takumi', requester_id: 'dm-takumi', addressee_id: 'dm-me', pair: pair('dm-takumi', 'dm-me'), status: 'pending', created_at: now - 3600e3, accepted_at: null });

// 写真部 and a seminar
ins('friend_groups', { id: 'dm-g-photo', name: '写真部', owner_id: 'dm-me', invite_code: 'DMPHOTO001', approval: 0, created_at: now - 14 * 864e5 });
['dm-me', 'dm-yui', 'dm-haru', 'dm-kai'].forEach((u, i) => ins('group_members', { group_id: 'dm-g-photo', user_id: u, share_timetable: 1, created_at: now - (14 - i) * 864e5 }));
ins('friend_groups', { id: 'dm-g-seminar', name: '井上ゼミ', owner_id: 'dm-rin', invite_code: 'DMSEMI0001', approval: 1, created_at: now - 10 * 864e5 });
['dm-rin', 'dm-me'].forEach((u, i) => ins('group_members', { group_id: 'dm-g-seminar', user_id: u, share_timetable: 1, created_at: now - (10 - i) * 864e5 }));

// Notes, tasks, cancellations, around Thu 2026-10-01 (the time capture.mjs fixes)
const note = (id, who, k, kind, extra) => ins('course_notes', { id, course_id: `dm-c-${who}-${k}`, kind, date: null, body: '', due: null, done: 0, sort_order: null, created_at: now - 864e5, ...extra });
note('dm-n1', 'me', 'VIDEO', 'memo', { date: '2026-09-24', body: '次回までに絵コンテを3案。カメラは貸出予約する', created_at: now - 7 * 864e5 });
note('dm-n2', 'me', 'VIDEO', 'task', { body: '絵コンテ提出', due: '2026-10-07' });
note('dm-n3', 'me', 'VIDEO', 'memo', { date: '2026-10-01', body: '編集ソフトの課題は班で1本', created_at: now - 3600e3 });
note('dm-n4', 'me', 'DATA', 'task', { body: 'レポート①', due: '2026-10-03' });
note('dm-n5', 'me', 'DES', 'task', { body: 'ラフ案を3つ', due: '2026-10-01' });
note('dm-n6', 'me', 'EN', 'task', { body: '単語テスト Unit 3', due: '2026-10-05', done: 0 });
note('dm-n7', 'me', 'SEMI', 'cancel', { date: '2026-10-02', body: '先生の学会出張' });
note('dm-n8', 'yui', 'DATA', 'cancel', { date: '2026-10-08', body: '' });
note('dm-n10', 'me', 'STAT', 'task', { body: '練習問題 p.42', due: '2026-09-29', done: 1 });
ins('course_absences', { id: 'dm-a1', course_id: 'dm-c-me-VIDEO', date: '2026-09-24', created_at: now - 7 * 864e5 });
ins('course_files', { id: 'dm-file1', course_id: 'dm-c-me-VIDEO', storage_key: 'dm-demo-file-1', name: '第2回 カメラワーク.pdf', mime: 'application/pdf', size: 2480000, created_at: now - 7 * 864e5 });
ins('course_files', { id: 'dm-file2', course_id: 'dm-c-me-VIDEO', storage_key: 'dm-demo-file-2', name: '板書.jpg', mime: 'image/jpeg', size: 820000, created_at: now - 7 * 864e5 });

// Events for 予定
const ev = (id, title, date, s, e, place, courseId) => ins('events', { id, user_id: 'dm-me', title, date, start_time: s, end_time: e, place, memo: null, course_id: courseId, created_at: now - 2 * 864e5 });
ev('dm-e1', '写真部 ミーティング', '2026-10-02', '18:00', '19:00', '部室', null);
ev('dm-e2', 'ゆいと映画', '2026-10-04', null, null, null, null);
ev('dm-e3', '統計 小テスト', '2026-10-06', '10:20', '11:50', '2C', 'dm-c-me-STAT');
ev('dm-e4', 'バイト', '2026-10-03', '17:00', '21:00', null, null);
ev('dm-e5', '撮影ロケハン', '2026-10-09', '13:00', null, '中央公園', 'dm-c-me-VIDEO');

ins('class_reminders', { user_id: 'dm-me', minutes: 10 });

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/seed.sql', import.meta.url), out.join('\n') + '\n');
console.log(`promo/out/seed.sql: ${out.length} statements`);
