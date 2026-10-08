<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import IconFields from '$lib/components/IconFields.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { ICON_COLORS, iconOf, isIconText } from '$lib/icons';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	const initial = iconOf(data.user);
	let text = $state(initial.text);
	// svelte-ignore state_referenced_locally
	let color = $state<string>(ICON_COLORS.find((c) => c.hex === initial.hex)?.id ?? ICON_COLORS[0].id);

	const valid = $derived(isIconText(text.trim()));
	const preview = $derived({ ...data.user, icon: { ...data.user.icon, color, text: text.trim() || initial.text } });

	let fields = $state<IconFields>();
</script>

<svelte:head>
	<title>アイコン · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="アイコン" back="/more/account" />

	<div class="preview">
		<UserIcon user={preview} size={88} />
		<span class="ui-note">友だちの一覧や、重ねた時間割に出ます。</span>
	</div>
	{#if form?.message}<p class="error top" role="alert">{form.message}</p>{/if}

	<!-- The button sits inside the save form but belongs to this one, so forms aren't nested -->
	<form id="remove-photo" method="POST" action="?/removePhoto" use:enhance hidden></form>

	<form
		method="POST"
		action="?/save"
		use:enhance={({ formData, cancel }) => {
			if (!fields?.prepare(formData)) cancel();
		}}
	>
		<IconFields bind:this={fields} bind:text bind:color hasPhoto={!!data.user.icon?.photo} removeFormId="remove-photo" />
		<div class="save">
			<button class="btn btn-primary" type="submit" disabled={!valid}>保存する</button>
		</div>
	</form>
</div>

<style>
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

	.save {
		padding: 18px 16px 0;
	}
</style>
