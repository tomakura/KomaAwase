<script lang="ts">
	import { fly } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { MAIL_COOLDOWN_SECONDS } from '$lib/mail';
	import { motion } from '$lib/motion';

	// What was sent, with a way to send it again once a minute has passed (the server says
	// the same) and to go back to the form for another address
	let { email, action, onother, children }: { email: string; action: string; onother: () => void; children: import('svelte').Snippet } =
		$props();

	let left = $state(MAIL_COOLDOWN_SECONDS);
	let sending = $state(false);
	$effect(() => {
		const started = Date.now();
		left = MAIL_COOLDOWN_SECONDS;
		const timer = setInterval(() => {
			left = Math.max(0, MAIL_COOLDOWN_SECONDS - Math.floor((Date.now() - started) / 1000));
			if (!left) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- Comes up from below, one after the other -->
<div class="sent" role="status" in:fly|global={{ y: 28, ...motion(420) }}>{@render children()}</div>
<form
	in:fly|global={{ y: 28, delay: 70, ...motion(420) }}
	method="POST"
	{action}
	use:enhance={() => {
		sending = true;
		return async ({ update }) => {
			await update();
			sending = false;
		};
	}}
>
	<input type="hidden" name="email" value={email} />
	<button class="btn" type="submit" disabled={left > 0 || sending}>
		{sending ? '送っています…' : left > 0 ? `もう一度送る（${left}秒）` : 'もう一度送る'}
	</button>
</form>
<button class="other" type="button" in:fly|global={{ y: 28, delay: 140, ...motion(420) }} onclick={onother}>別のアドレスにする</button>

<style>
	.sent {
		margin: 0;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}

	form {
		display: flex;
		flex-direction: column;
	}

	.other {
		align-self: center;
		min-height: 44px;
		padding: 0 12px;
		border: none;
		background: none;
		color: var(--accent-text);
		font: inherit;
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
