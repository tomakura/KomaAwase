<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { SHARE_CHOICES, SHARE_NOTES, type ShareChoice } from '$lib/sharing';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let friends = $state<ShareChoice>(data.friends);
	// svelte-ignore state_referenced_locally
	let groups = $state(Object.fromEntries(data.groups.map((g) => [g.id, g.share])) as Record<string, ShareChoice>);

	let friendsForm = $state<HTMLFormElement>();
	const groupForms: Record<string, HTMLFormElement> = $state({});

	// After the hidden input has the new choice
	const submit = (form: HTMLFormElement | undefined) => tick().then(() => form?.requestSubmit());
	const keep = () => async ({ update }: { update: (o: { reset: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head>
	<title>時間割の見せ方 · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="時間割の見せ方" back="/friends" />

	<section class="ui-section">
		<h2 class="ui-section-title">友だち</h2>
		<form class="ui-list" method="POST" action="?/friends" bind:this={friendsForm} use:enhance={keep}>
			<div class="choice">
				<Segmented options={SHARE_CHOICES} bind:value={friends} label="友だちへの見せ方" name="share" onchange={() => submit(friendsForm)} />
				<a class="preview" href="/friends/sharing/preview?as=friends">見え方を確かめる<Icon name="chevron" size={16} /></a>
			</div>
		</form>
		<p class="ui-note">{SHARE_NOTES[friends]}友だち全員に同じように見えます。</p>
	</section>

	{#if data.groups.length}
		<section class="ui-section">
			<h2 class="ui-section-title">グループ</h2>
			<div class="ui-list">
				{#each data.groups as g (g.id)}
					<form class="choice" method="POST" action="?/group" bind:this={groupForms[g.id]} use:enhance={keep}>
						<input type="hidden" name="id" value={g.id} />
						<span class="name">{g.name}</span>
						<Segmented
							options={SHARE_CHOICES}
							bind:value={groups[g.id]}
							label="「{g.name}」への見せ方"
							name="share"
							onchange={() => submit(groupForms[g.id])}
						/>
						<a class="preview" href="/friends/sharing/preview?as={g.id}">見え方を確かめる<Icon name="chevron" size={16} /></a>
					</form>
				{/each}
			</div>
		</section>
	{/if}

	<section class="ui-section">
		<p class="ui-note">友だちとグループの両方で見える人には、広いほうの見せ方になります。</p>
	</section>
</div>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}

	.name {
		font-size: 14px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.preview {
		align-self: flex-end;
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		color: var(--accent-text);
		text-decoration: none;
	}
</style>
