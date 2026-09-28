// The Worker's entry point. SvelteKit answers web requests; the screenshot queue and the
// daily sweep reuse its routes by calling them in-process, with a flag on env that a request
// from outside can never carry (see src/lib/server/internal.ts).
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';

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
	 * One screenshot at a time (max_concurrency 1 in wrangler.jsonc), to stay within Groq's
	 * per-minute limits. A busy Groq means waiting a little and trying the same message again.
	 * @param {MessageBatch<{ jobId: string }>} batch
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async queue(batch, env, ctx) {
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
	 * @param {ScheduledController} _controller
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 */
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(internal(env, ctx, '/internal/daily', {}));
	}
};
