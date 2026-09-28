<script lang="ts">
	import { enhance } from '$app/forms';

	// Reasons come from REPORT_REASONS on the server, passed down with the page.
	let {
		reasons,
		action,
		done = () => {}
	}: { reasons: readonly string[]; action: string; done?: () => void } = $props();

	let message = $state<string | null>(null);
	let sent = $state(false);
</script>

{#if sent}
	<p class="sent" role="status">送りました。運営が確認します。ありがとうございます。</p>
	<button class="btn" type="button" onclick={done}>とじる</button>
{:else}
	<form
		method="POST"
		{action}
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'success') sent = true;
				else if (result.type === 'failure') message = String(result.data?.message ?? '送れませんでした');
				else await update();
			}}
	>
		<fieldset>
			<legend>理由</legend>
			{#each reasons as reason (reason)}
				<label class="choice">
					<input type="radio" name="reason" value={reason} required />
					{reason}
				</label>
			{/each}
		</fieldset>
		<label class="field">
			くわしい内容（なくてもOK）
			<textarea name="detail" rows="3" maxlength="500"></textarea>
		</label>
		{#if message}<p class="error" role="alert">{message}</p>{/if}
		<button class="btn btn-primary" type="submit">送る</button>
	</form>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 4px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.choice {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}

	.choice input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--ink);
	}

	textarea {
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink);
		font-family: inherit;
		font-size: 16px;
		resize: vertical;
	}

	.sent {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
	}
</style>
