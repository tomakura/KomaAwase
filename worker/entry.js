// The Worker's entry point. SvelteKit answers web requests; the screenshot queue and the
// daily sweep reuse its routes by calling them in-process, with a flag on env that a request
// from outside can never carry (see src/lib/server/internal.ts).
import { DurableObject } from 'cloudflare:workers';
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';
import { MINUTE, isEarly, minutesDue, nextAlarm, nextMinute, runEarly, runMinute } from '../src/lib/server/minute-clock.ts';
import { sendPart } from '../src/lib/server/push-queue.ts';

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

/**
 * Wakes the notifications at the start of each minute, and the iPhones' a little before
 * (src/lib/server/minute-clock.ts). One of it, named 'minute'. Its alarm sets the next one
 * before sending, so a failure can't stop it.
 */
export class MinuteClock extends DurableObject {
	/** Sets the alarm when there is none, or when it should have gone off a while ago */
	async ensure() {
		const at = await this.ctx.storage.getAlarm();
		const now = Date.now();
		if (at === null || at < now - 2 * MINUTE) await this.ctx.storage.setAlarm(nextAlarm(now));
	}

	async alarm() {
		const now = Date.now();
		await this.ctx.storage.setAlarm(nextAlarm(now));
		/** @type {number | undefined} */
		const last = await this.ctx.storage.get('last');
		/** @type {{ minute: number, sent: string[] } | undefined} */
		const early = await this.ctx.storage.get('early');
		for (const minute of minutesDue(last, now)) {
			const sentEarly = early?.minute === minute ? new Set(early.sent) : undefined;
			// A minute that failed stays unsent, to be tried with the next alarm
			if (!(await runMinute(this.env, minute, now, sentEarly))) break;
			await this.ctx.storage.put('last', minute);
		}
		if (isEarly(now)) {
			const minute = nextMinute(now);
			await this.ctx.storage.put('early', { minute, sent: await runEarly(this.env, minute) });
		}
	}
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
	 * Every minute: only makes sure the clock that sends the notifications is running.
	 * @param {ScheduledController} controller
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(controller, env, ctx) {
		if (controller.cron === REMINDER_CRON) {
			ctx.waitUntil(env.CLOCK.get(env.CLOCK.idFromName('minute')).ensure());
		} else {
			ctx.waitUntil(internal(env, ctx, '/internal/daily', {}));
		}
	}
};
