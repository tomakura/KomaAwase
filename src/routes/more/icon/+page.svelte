<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PhotoPicker from '$lib/components/PhotoPicker.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { ICON_COLORS, ICON_TEXT_MAX, iconOf, isIconText } from '$lib/icons';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	const initial = iconOf(data.user);
	let text = $state(initial.text);
	// svelte-ignore state_referenced_locally
	let color = $state<string>(ICON_COLORS.find((c) => c.hex === initial.hex)?.id ?? ICON_COLORS[0].id);

	const valid = $derived(isIconText(text.trim()));
	const preview = $derived({ ...data.user, icon: { ...data.user.icon, color, text: text.trim() || initial.text } });

	// A photo, framed and shrunk here so only a small square is sent
	let photoSrc = $state<string | null>(null);
	let picker = $state<PhotoPicker>();
	let photoInput = $state<HTMLInputElement>();
	let photoError = $state<string | null>(null);
	function pickPhoto(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		if (photoSrc) URL.revokeObjectURL(photoSrc);
		photoSrc = URL.createObjectURL(file);
	}
	function cancelPhoto() {
		if (photoSrc) URL.revokeObjectURL(photoSrc);
		photoSrc = null;
		if (photoInput) photoInput.value = '';
	}
</script>

<svelte:head>
	<title>アイコン · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="アイコン" back="/more" />

	<div class="preview">
		<UserIcon user={preview} size={88} />
		<span class="ui-note">友だちの一覧や、重ねた時間割に出ます。</span>
	</div>
	{#if form?.message}<p class="error top" role="alert">{form.message}</p>{/if}

	<section class="photo">
		<h2>写真</h2>
		<input class="file" type="file" accept="image/*" bind:this={photoInput} onchange={(e) => pickPhoto(e.currentTarget.files)} />
		{#if photoSrc}
			<PhotoPicker src={photoSrc} bind:this={picker} />
			<form
				method="POST"
				action="?/photo"
				use:enhance={({ formData, cancel }) => {
					const url = picker?.render();
					photoError = null;
					if (url) formData.set('photo', url);
					else {
						// Not loaded (HEIC outside Safari, say) or too big even at low quality
						photoError = 'この写真は使えませんでした。別の写真でお試しください';
						cancel();
					}
				}}
			>
				{#if photoError}<p class="error" role="alert">{photoError}</p>{/if}
				<div class="row">
					<button class="btn" type="button" onclick={cancelPhoto}>やめる</button>
					<button class="btn btn-primary" type="submit">この写真にする</button>
				</div>
			</form>
		{:else}
			<div class="row">
				<button class="btn" type="button" onclick={() => photoInput?.click()}>
					{data.user.icon?.photo ? '写真を変える' : '写真を選ぶ'}
				</button>
				{#if data.user.icon?.photo}
					<form method="POST" action="?/removePhoto" use:enhance>
						<button class="btn" type="submit">写真をやめる</button>
					</form>
				{/if}
			</div>
			<p class="ui-note">写真は端末の中で小さく切り抜いてから送ります。友だちやグループの人に見えます。</p>
		{/if}
	</section>

	<form method="POST" action="?/letters" use:enhance>

		{#if data.user.icon?.photo}<p class="ui-note">写真を使っているあいだ、文字と色は写真を読み込むまでのあいだに出ます。</p>{/if}
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

		<button class="btn btn-primary" type="submit" disabled={!valid}>保存する</button>
	</form>
</div>

<style>
	.photo {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 6px 16px 18px;
		border-bottom: 1px solid var(--line);
	}

	.photo h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-sub);
	}

	.photo form {
		padding: 0;
	}

	.file {
		display: none;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.row > *,
	.row form .btn {
		flex: 1;
	}

	.row form {
		display: flex;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 6px 16px 0;
	}

	.top {
		margin: 0 16px 12px;
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
