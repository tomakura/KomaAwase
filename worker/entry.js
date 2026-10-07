// The Worker's entry point. SvelteKit answers web requests; the screenshot queue and the
// daily sweep reuse its routes by calling them in-process, with a flag on env that a request
// from outside can never carry (see src/lib/server/internal.ts).
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { sendPlanEve } from '../src/lib/server/plan-eve.ts';
import { sendPart } from '../src/lib/server/push-queue.ts';
import { sendDueReminders } from '../src/lib/server/reminders.ts';
import { sendTaskReminders } from '../src/lib/server/task-reminders.ts';

// The cron in wrangler.jsonc that runs every minute; the other one is the daily sweep
const REMINDER_CRON = '* * * * *';

/**
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @param {string} path
 * @param {unknown} body
 */
function internal(env, ctx, path, body) {
	const request = new Request(`https://internal.invalid${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	return sveltekit.fetch(request, Object.create(env, { KOMA_INTERNAL: { value: true } }), ctx);
}

export default {
	fetch: sveltekit.fetch,

	/**
	 * Screenshots, one at a time (max_concurrency 1 in wrangler.jsonc), to stay within Groq's
	 * per-minute limits. A busy Groq means waiting a little and trying the same message again.
	 * And notifications, up to 40 phones a message (src/lib/server/push-queue.ts), which sends
	 * the failed ones again itself.
	 * @param {MessageBatch<any>} batch
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async queue(batch, env, ctx) {
		if (batch.queue === 'koma-push') {
			for (const message of batch.messages) {
				try {
					await sendPart(env, message.body);
				} catch (e) {
					console.error('push message failed', e);
				}
				message.ack();
			}
			return;
		}
		for (const message of batch.messages) {
			try {
				const res = await internal(env, ctx, '/internal/import', message.body);
				const outcome = res.ok ? await res.json() : null;
				if (outcome?.status === 'busy') message.retry({ delaySeconds: outcome.seconds });
				else if (outcome) message.ack();
				else message.retry({ delaySeconds: 60 });
			} catch (e) {
				console.error('import message failed', e);
				message.retry({ delaySeconds: 60 });
			}
		}
	},

	/**
	 * The class reminders don't go through SvelteKit: they run every minute, so they must stay
	 * light (src/lib/server/reminders.ts).
	 * @param {ScheduledController} controller
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(controller, env, ctx) {
		if (controller.cron === REMINDER_CRON) {
			// The cron can start a minute or so late, so each run looks for what is due the next
			// minute and has the push queue hold it until then
			const next = controller.scheduledTime + 60_000;
			ctx.waitUntil(sendDueReminders(env, next));
			// 20:00 to 20:09 in Japan (11:00 UTC), when it has anything to do
			ctx.waitUntil(sendPlanEve(env, next));
			ctx.waitUntil(sendTaskReminders(env, next));
		} else {
			ctx.waitUntil(internal(env, ctx, '/internal/daily', {}));
		}
	}
};
