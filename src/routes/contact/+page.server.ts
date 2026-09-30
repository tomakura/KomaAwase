import { fail } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { normalizeEmail } from '$lib/server/auth/email';
import { contactMessages, users } from '$lib/server/db/schema';
import { notify } from '$lib/server/notify';
import { passesTurnstile, turnstileSiteKey } from '$lib/server/turnstile';
import type { Actions, PageServerLoad } from './$types';

const NAME_MAX = 50;
const BODY_MAX = 2000;
// All senders together, and one address, in a day
const DAILY_MAX = 50;
const DAILY_MAX_PER_ADDRESS = 3;

// お問い合わせ: works signed out too, so people who left (or never signed up) can reach the
// operator, as the privacy policy says. A hidden field, Turnstile and daily limits keep
// scripts out.
export const load: PageServerLoad = ({ locals, platform }) => ({
	siteKey: turnstileSiteKey(platform?.env),
	name: locals.user?.nickname ?? '',
	email: locals.user?.email ?? ''
});

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, platform } = event;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const emailInput = String(form.get('email') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const values = { name, email: emailInput, body };
		// The field people don't see: whatever fills it is a script, told it went through
		if (String(form.get('website') ?? '')) return { sent: true };

		if (!name || [...name].length > NAME_MAX) return fail(400, { message: `名前は1〜${NAME_MAX}文字で入れてください`, ...values });
		const email = normalizeEmail(emailInput);
		if (!email) return fail(400, { message: 'メールアドレスを確かめてください', ...values });
		if (!body || [...body].length > BODY_MAX) return fail(400, { message: `内容は1〜${BODY_MAX}文字で書いてください`, ...values });
		if (!(await passesTurnstile(platform?.env, form.get('cf-turnstile-response'), event.getClientAddress()))) {
			return fail(400, { message: '確認がうまくいきませんでした。もう一度送ってください', ...values });
		}

		// Counted and saved in one statement, so sends at the same moment can't pass the limits together
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const [counts] = await locals.db.all<{ total: number; mine: number }>(sql`
			select count(*) as total, sum(${contactMessages.email} = ${email}) as mine
			from ${contactMessages} where ${contactMessages.createdAt} >= ${since}`);
		if (Number(counts?.mine ?? 0) >= DAILY_MAX_PER_ADDRESS) {
			return fail(429, { message: 'このアドレスからの問い合わせは、今日の上限に達しました。明日、もう一度送ってください。', ...values });
		}
		const saved = await locals.db.run(sql`
			insert into ${contactMessages} (id, name, email, body)
			select ${crypto.randomUUID()}, ${name}, ${email}, ${body}
			where (select count(*) from ${contactMessages} where ${contactMessages.createdAt} >= ${since}) < ${DAILY_MAX}
			and (select count(*) from ${contactMessages} where ${contactMessages.email} = ${email} and ${contactMessages.createdAt} >= ${since}) < ${DAILY_MAX_PER_ADDRESS}`);
		if (!saved.meta.changes) return fail(429, { message: '今日の問い合わせは、上限に達しました。明日、もう一度送ってください。', ...values });

		// The operator hears of it on their devices
		if (platform) {
			const admins = await locals.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
			platform.ctx.waitUntil(
				notify(platform.env, locals.db, admins.map((a) => a.id), null, { title: '問い合わせが届きました', body: name, url: '/admin', tag: 'contact' })
			);
		}
		return { sent: true };
	}
};
