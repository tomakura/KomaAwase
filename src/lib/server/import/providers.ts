// The two AIs that read screenshots. Neither trains on what it is sent: Groq with zero data
// retention turned on in its console, Workers AI by Cloudflare's terms (docs/architecture.md).
import { IMPORT_PROMPT, IMPORT_SCHEMA, IMPORT_TILE_PROMPT, IMPORT_TILE_SCHEMA } from '$lib/import';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'qwen/qwen3.8-27b';
export const WORKERS_AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

/** Busy for a moment: worth trying the same AI again after `seconds`. */
export class Busy extends Error {
	constructor(readonly seconds: number) {
		super(`busy for ${seconds}s`);
	}
}

/** Out of today's free quota: try the other AI, or tomorrow. */
export class OutOfQuota extends Error {}

// `tiled`: the browser cut the table into cells and stacked them (import-grid.ts), and what is
// asked for changes with it.
const messages = (image: string, tiled: boolean) => [
	{
		role: 'user',
		content: [
			{ type: 'text', text: tiled ? IMPORT_TILE_PROMPT : IMPORT_PROMPT },
			{ type: 'image_url', image_url: { url: image } }
		]
	}
];
const schemaOf = (tiled: boolean) => (tiled ? IMPORT_TILE_SCHEMA : IMPORT_SCHEMA);

export async function readWithGroq(apiKey: string, image: string, tiled: boolean): Promise<unknown> {
	const res = await fetch(GROQ_URL, {
		method: 'POST',
		headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			model: GROQ_MODEL,
			messages: messages(image, tiled),
			response_format: { type: 'json_schema', json_schema: { name: 'timetable', strict: true, schema: schemaOf(tiled) } },
			reasoning_effort: 'none',
			temperature: 0,
			max_completion_tokens: 4096
		}),
		signal: AbortSignal.timeout(90_000)
	});
	if (res.status === 429) {
		// Per-minute limits reset within a minute; the daily ones come back with hours.
		const seconds = Number(res.headers.get('retry-after'));
		if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) throw new Busy(Math.ceil(seconds));
		throw new OutOfQuota('groq: rate limited');
	}
	if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
	return data.choices?.[0]?.message?.content ?? null;
}

export async function readWithWorkersAi(ai: Ai, image: string, tiled: boolean): Promise<unknown> {
	try {
		const out = (await ai.run(WORKERS_AI_MODEL as Parameters<Ai['run']>[0], {
			messages: messages(image, tiled),
			response_format: { type: 'json_schema', json_schema: schemaOf(tiled) },
			temperature: 0,
			max_tokens: 4096
		} as never)) as { response?: unknown };
		return out?.response ?? null;
	} catch (e) {
		// 4006: the account's daily free neurons are used up
		if (e instanceof Error && /4006|neurons|allocation/i.test(e.message)) throw new OutOfQuota(e.message);
		throw e;
	}
}
