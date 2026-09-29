import { fail, redirect } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { NOTIFY_KINDS } from '$lib/notify';
import { REMINDERS_MAX, readReminderMinutes } from '$lib/reminder';
import { classReminders, pushSubscriptions, users, type NotifySettings } from '$lib/server/db/schema';
import { notify, pushEnabled } from '$lib/server/notify';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) redirect(303, '/login');
	const [[devices], reminders] = await Promise.all([
		locals.db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, locals.user.id)),
		locals.db.select({ minutes: classReminders.minutes }).from(classReminders).where(eq(classReminders.userId, locals.user.id))
	]);
	const settings = locals.user.notify ?? {};
	return {
		available: pushEnabled(platform?.env),
		publicKey: platform?.env.VAPID_PUBLIC_KEY ?? null,
		devices: devices?.n ?? 0,
		reminders: reminders.map((r) => r.minutes).sort((a, b) => a - b),
		kinds: NOTIFY_KINDS.map((k) => ({ ...k, on: settings[k.id] !== false }))
	};
};

export const actions: Actions = {
	settings: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const notifySettings: NotifySettings = {};
		for (const k of NOTIFY_KINDS) notifySettings[k.id] = form.get(k.id) === 'on';
		await locals.db.update(users).set({ notify: notifySettings }).where(eq(users.id, locals.user.id));
		return { saved: true };
	},
	// The times before a class to be told, replacing the ones there were
	reminders: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const minutes = readReminderMinutes((await request.formData()).getAll('minutes'));
		if (!minutes) return fail(400, { message: `授業の前の通知は${REMINDERS_MAX}つまで選べます` });
		await locals.db.batch([
			locals.db.delete(classReminders).where(eq(classReminders.userId, locals.user.id)),
			...(minutes.length ? [locals.db.insert(classReminders).values(minutes.map((m) => ({ userId: locals.user!.id, minutes: m })))] : [])
		]);
		return { remindersSaved: true };
	},
	test: async ({ locals, platform }) => {
		if (!locals.user) redirect(303, '/login');
		if (!platform || !pushEnabled(platform.env)) return fail(400, { message: '通知はまだ使えません' });
		await notify(platform.env, locals.db, [locals.user.id], null, {
			title: 'テストの通知です',
			body: 'このように届きます',
			url: '/more/notifications',
			tag: 'test'
		});
		return { tested: true };
	}
};
