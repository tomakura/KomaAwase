<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { ICON_COLORS, ICON_TEXT_MAX, iconOf, isIconText } from '$lib/icons';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	const initial = iconOf(data.user);
	let text = $state(initial.text);
	// svelte-ignore state_referenced_locally
	let color = $state<string>(ICON_COLORS.find((c) => c.hex === initial.hex)?.id ?? ICON_COLORS[0].id);

	const valid = $derived(isIconText(text.trim()));
	const preview = $derived({ ...data.user, icon: { color, text: text.trim() || initial.text } });
</script>

<svelte:head>
	<title>アイコン · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="アイコン" back="/more" />
	<form method="POST" use:enhance>
		<div class="preview">
			<UserIcon user={preview} size={88} />
			<span class="ui-note">友だちの一覧や、重ねた時間割に出ます。</span>
		</div>

		<label class="field">
			文字（{ICON_TEXT_MAX}文字まで）
			<input name="text" bind:value={text} autocomplete="off" required />
		</label>

		<fieldset>
			<legend>色</legend>
			<div class="colors">
				{#each ICON_COLORS as c (c.id)}
					<label class="swatch" style:--c={c.hex}>
						<input type="radio" name="color" value={c.id} bind:group={color} />
						<span class="visually-hidden">{c.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit" disabled={!valid}>保存する</button>
	</form>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 6px 16px 0;
	}

	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 12px 0 4px;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-bottom: 8px;
		font-size: 12px;
		color: var(--ink-sub);
	}

	.colors {
		display: grid;
		grid-template-columns: repeat(auto-fill, 44px);
		gap: 10px;
	}

	.swatch {
		position: relative;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--c);
		cursor: pointer;
	}

	.swatch input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.swatch:has(input:checked) {
		box-shadow:
			0 0 0 3px var(--bg),
			0 0 0 5px var(--ink);
	}

	.swatch:has(input:focus-visible) {
		outline: 2px solid var(--accent-text);
		outline-offset: 5px;
	}
</style>
