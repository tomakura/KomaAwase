// One mailbox confirms one account: taro+1@ and taro+2@ reach taro@'s inbox, so they can't
// confirm a second account. The check still keeps (and shows) the address as typed.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finishVerification, mailboxOf, peekVerification, sendVerificationMail, startVerification, verificationOf, verifyByGoogle } from './verify';
import { testDatabase } from '../../test/db';

function world() {
	const t = testDatabase();
	t.run(`INSERT INTO universities (id, name, email_domains) VALUES ('uni', 'テスト大学', '["u.ac.jp"]')`);
	for (const id of ['a', 'b', 'c']) t.run(`INSERT INTO users (id, email, nickname, university_id) VALUES (?, ?, ?, 'uni')`, id, `${id}@example.test`, id);
	return t;
}

type World = ReturnType<typeof world>;

// A link for the address, as /more/verify makes one
async function link(t: World, userId: string, address: string) {
	const started = await startVerification(t.db, { id: userId, universityId: 'uni' }, address);
	if (!started.token) throw new Error(started.message);
	return started.token;
}

async function confirm(t: World, userId: string, address: string) {
	return finishVerification(t.db, await link(t, userId, address), userId);
}

const checks = (t: World) => t.rows(`SELECT user_id, email, mailbox FROM univ_verifications ORDER BY user_id`);

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('mailboxOf', () => {
	it('drops a +tag from the name, and nothing else', () => {
		expect(mailboxOf('taro@u.ac.jp')).toBe('taro@u.ac.jp');
		expect(mailboxOf('taro+koma@u.ac.jp')).toBe('taro@u.ac.jp');
		expect(mailboxOf('taro+a+b@u.ac.jp')).toBe('taro@u.ac.jp');
		expect(mailboxOf('taro+@u.ac.jp')).toBe('taro@u.ac.jp');
		// Nothing before the +: that is the name itself
		expect(mailboxOf('+taro@u.ac.jp')).toBe('+taro@u.ac.jp');
		// Subdomains stay apart, and a + in the domain isn't a tag
		expect(mailboxOf('taro@st.u.ac.jp')).toBe('taro@st.u.ac.jp');
		expect(mailboxOf('taro@a+b.u.ac.jp')).toBe('taro@a+b.u.ac.jp');
	});
});

describe('enrollment checks by mailbox', () => {
	it('mails the address as typed, and keeps and shows that address', async () => {
		const t = world();
		const sent: { to: string; link: string }[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			sent.push(JSON.parse(String(init.body)));
			return Response.json({ ok: true });
		});
		const event = {
			locals: { user: { id: 'a', universityId: 'uni' }, db: t.db },
			request: new Request('https://koma.example.test/more/verify', { method: 'POST', body: new URLSearchParams({ email: ' Taro+Koma@u.ac.jp ' }) }),
			url: new URL('https://koma.example.test/more/verify'),
			cookies: { get: () => undefined, set: () => {}, delete: () => {} },
			platform: {
				env: { EMAIL_LINK_LIMITER: { limit: async () => ({ success: true }) }, RELAY_URL: 'https://relay.example.test/send.php', RELAY_SECRET: 'secret' }
			},
			getClientAddress: () => '192.0.2.1'
		} as unknown as RequestEvent;
		expect(await sendVerificationMail(event)).toEqual({ sentTo: 'taro+koma@u.ac.jp' });
		expect(sent.map((m) => m.to)).toEqual(['taro+koma@u.ac.jp']);

		const token = sent[0].link.split('/verify/')[1];
		expect(await peekVerification(t.db, token)).toMatchObject({ email: 'taro+koma@u.ac.jp', taken: false });
		expect(await finishVerification(t.db, token, 'a')).toEqual({ university: 'テスト大学' });
		expect((await verificationOf(t.db, 'a'))?.email).toBe('taro+koma@u.ac.jp');
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro+koma@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('refuses a tagged address when the plain one confirms another account', async () => {
		const t = world();
		expect(await confirm(t, 'a', 'taro@u.ac.jp')).toEqual({ university: 'テスト大学' });
		const token = await link(t, 'b', 'taro+x@u.ac.jp');
		expect(await peekVerification(t.db, token)).toMatchObject({ taken: true });
		expect(await finishVerification(t.db, token, 'b')).toBe('taken');
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('refuses the plain address, or another tag, when a tagged one confirms another account', async () => {
		const t = world();
		expect(await confirm(t, 'a', 'taro+koma@u.ac.jp')).toEqual({ university: 'テスト大学' });
		const plain = await link(t, 'b', 'taro@u.ac.jp');
		expect(await peekVerification(t.db, plain)).toMatchObject({ taken: true });
		expect(await finishVerification(t.db, plain, 'b')).toBe('taken');
		expect(await confirm(t, 'c', 'taro+x@u.ac.jp')).toBe('taken');
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro+koma@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('lets the same account confirm again with another tag, or none', async () => {
		const t = world();
		expect(await confirm(t, 'a', 'taro+1@u.ac.jp')).toEqual({ university: 'テスト大学' });
		const token = await link(t, 'a', 'taro+2@u.ac.jp');
		expect(await peekVerification(t.db, token)).toMatchObject({ taken: false });
		expect(await finishVerification(t.db, token, 'a')).toEqual({ university: 'テスト大学' });
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro+2@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
		expect(await confirm(t, 'a', 'taro@u.ac.jp')).toEqual({ university: 'テスト大学' });
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('keeps other mailboxes and subdomains apart', async () => {
		const t = world();
		expect(await confirm(t, 'a', 'taro+1@u.ac.jp')).toEqual({ university: 'テスト大学' });
		expect(await confirm(t, 'b', 'hana+1@u.ac.jp')).toEqual({ university: 'テスト大学' });
		expect(await confirm(t, 'c', 'taro@st.u.ac.jp')).toEqual({ university: 'テスト大学' });
	});

	it('lets exactly one of two accounts confirming one mailbox at once through', async () => {
		const t = world();
		const [ta, tb] = [await link(t, 'a', 'taro+a@u.ac.jp'), await link(t, 'b', 'taro+b@u.ac.jp')];
		// Both links look free when opened
		expect((await peekVerification(t.db, ta))?.taken).toBe(false);
		expect((await peekVerification(t.db, tb))?.taken).toBe(false);
		const results = await Promise.all([finishVerification(t.db, ta, 'a'), finishVerification(t.db, tb, 'b')]);
		expect(results.filter((r) => r === 'taken')).toHaveLength(1);
		expect(results.filter((r) => typeof r === 'object' && r?.university === 'テスト大学')).toHaveLength(1);
		expect(t.rows(`SELECT mailbox FROM univ_verifications`)).toEqual([{ mailbox: 'taro@u.ac.jp' }]);
	});

	// As migration 0030 leaves a second account on one mailbox: still checked, without the mailbox
	it('holds the mailbox for a check from Google sign-in too', async () => {
		const t = world();
		const uni = { id: 'uni', emailDomains: ['u.ac.jp'] };
		expect(await verifyByGoogle(t.db, { id: 'a', email: 'taro@u.ac.jp', googleSub: 'g-a', googleAt: new Date() }, uni)).toBe(true);
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
		// The mail can't add a second account on that mailbox, nor can another Google sign-in
		const token = await link(t, 'b', 'taro+x@u.ac.jp');
		expect(await finishVerification(t.db, token, 'b')).toBe('taken');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await verifyByGoogle(t.db, { id: 'c', email: 'taro+y@u.ac.jp', googleSub: 'g-c', googleAt: new Date() }, uni)).toBe(false);
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('confirms by Google only right after a Google sign-in', async () => {
		const t = world();
		const uni = { id: 'uni', emailDomains: ['u.ac.jp'] };
		const user = { id: 'a', email: 'taro@u.ac.jp', googleSub: 'g-a' };
		// A sign-in from long ago (the school may have deleted the account since), or none
		expect(await verifyByGoogle(t.db, { ...user, googleAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }, uni)).toBe(false);
		expect(await verifyByGoogle(t.db, { ...user, googleAt: null }, uni)).toBe(false);
		expect(checks(t)).toEqual([]);
		// Within the hour that the nickname, passkey and はじめの設定 take
		expect(await verifyByGoogle(t.db, { ...user, googleAt: new Date(Date.now() - 30 * 60 * 1000) }, uni)).toBe(true);
		expect(checks(t)).toEqual([{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' }]);
	});

	it('refuses a check from before 0030 without its mailbox when it confirms again, and keeps it till then', async () => {
		const t = world();
		const later = Date.now() + 1000 * 60 * 60 * 24 * 30;
		t.run(
			`INSERT INTO univ_verifications (user_id, university_id, email, mailbox, verified_at, expires_at) VALUES ('a', 'uni', 'taro@u.ac.jp', 'taro@u.ac.jp', 1, ?), ('b', 'uni', 'taro+x@u.ac.jp', NULL, 2, ?)`,
			later,
			later
		);
		expect((await verificationOf(t.db, 'b'))?.email).toBe('taro+x@u.ac.jp');
		expect(await confirm(t, 'b', 'taro+x@u.ac.jp')).toBe('taken');
		// A minute on, so the address can be mailed again
		t.run(`UPDATE verify_tokens SET expires_at = expires_at - 120000`);
		// The address itself, held by b, is taken for a too (and doesn't fail)
		expect(await confirm(t, 'a', 'taro+x@u.ac.jp')).toBe('taken');
		expect(checks(t)).toEqual([
			{ user_id: 'a', email: 'taro@u.ac.jp', mailbox: 'taro@u.ac.jp' },
			{ user_id: 'b', email: 'taro+x@u.ac.jp', mailbox: null }
		]);
		expect(await confirm(t, 'a', 'taro+y@u.ac.jp')).toEqual({ university: 'テスト大学' });
	});
});

describe('migration 0030', () => {
	// The database as it was before 0030
	function before() {
		const sqlite = new DatabaseSync(':memory:');
		const dir = new URL('../../../drizzle/', import.meta.url);
		for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.sql') && f < '0030').sort()) {
			for (const s of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (s.trim()) sqlite.exec(s);
		}
		return sqlite;
	}

	it('gives each check its mailbox, and leaves a second account on one mailbox null but checked', () => {
		const sqlite = before();
		sqlite.exec(`INSERT INTO universities (id, name, email_domains) VALUES ('uni', 'テスト大学', '["u.ac.jp"]')`);
		const rows: [string, string, number][] = [
			// The plain address keeps the mailbox, though the tagged one was checked first
			['u1', 'taro@u.ac.jp', 2000],
			['u2', 'taro+x@u.ac.jp', 1000],
			// Only tags: the earliest check keeps it
			['u3', 'hana+b@u.ac.jp', 3000],
			['u4', 'hana+a@u.ac.jp', 4000],
			['u5', 'jiro+k@u.ac.jp', 1000],
			['u6', '+odd@u.ac.jp', 1000],
			['u7', 'taro@st.u.ac.jp', 1000]
		];
		for (const [id, email, at] of rows) {
			sqlite.prepare(`INSERT INTO users (id, email, nickname, university_id) VALUES (?, ?, ?, 'uni')`).run(id, `${id}@example.test`, id);
			sqlite
				.prepare(`INSERT INTO univ_verifications (user_id, university_id, email, verified_at, expires_at) VALUES (?, 'uni', ?, ?, 99999)`)
				.run(id, email, at);
		}
		for (const s of readFileSync(new URL('../../../drizzle/0030_univ_mailbox.sql', import.meta.url), 'utf8').split('--> statement-breakpoint')) {
			if (s.trim()) sqlite.exec(s);
		}

		const after = sqlite
			.prepare(`SELECT user_id, email, mailbox, verified_at, expires_at FROM univ_verifications ORDER BY user_id`)
			.all() as Record<string, unknown>[];
		expect(after.map((r) => [r.user_id, r.email, r.mailbox])).toEqual([
			['u1', 'taro@u.ac.jp', 'taro@u.ac.jp'],
			['u2', 'taro+x@u.ac.jp', null],
			['u3', 'hana+b@u.ac.jp', 'hana@u.ac.jp'],
			['u4', 'hana+a@u.ac.jp', null],
			['u5', 'jiro+k@u.ac.jp', 'jiro@u.ac.jp'],
			['u6', '+odd@u.ac.jp', '+odd@u.ac.jp'],
			['u7', 'taro@st.u.ac.jp', 'taro@st.u.ac.jp']
		]);
		// The same mailbox the app gives, and the addresses and checks themselves unchanged
		for (const r of after) if (r.mailbox !== null) expect(r.mailbox).toBe(mailboxOf(String(r.email)));
		expect(after.map((r) => [r.verified_at, r.expires_at])).toEqual(rows.map(([, , at]) => [at, 99999]));
	});
});
