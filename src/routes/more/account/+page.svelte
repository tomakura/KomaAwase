<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { subscription } from '$lib/push-client';

	let { data } = $props();
</script>

<svelte:head>
	<title>アカウント · コマあわせ</title>
</svelte:head>

{#snippet link(href: string, label: string, value?: string | null)}
	<a class="ui-row" {href}>
		<span>{label}</span>
		<span class="ui-row-value">{#if value}<span class="value">{value}</span>{/if}<Icon name="chevron" size={16} /></span>
	</a>
{/snippet}

<div class="ui-page">
	<PageHeader title="アカウント" back="/more" />

	<div class="profile">
		<UserIcon user={data.user} size={72} />
		<p class="name">{data.user.nickname}</p>
		<p class="university">{data.universityName ?? '大学は未設定'}</p>
	</div>

	<section class="ui-section">
		<h2 class="ui-section-title">プロフィール</h2>
		<div class="ui-list">
			<a class="ui-row" href="/more/icon">
				<span>アイコン</span>
				<span class="ui-row-value"><UserIcon user={data.user} size={28} /><Icon name="chevron" size={16} /></span>
			</a>
			{@render link('/more/nickname', 'ニックネーム', data.user.nickname)}
			{@render link('/more/university', '大学', data.universityName ?? '未設定')}
		</div>
	</section>

	<section class="ui-section">
		<h2 class="ui-section-title">ログインとデータ</h2>
		<div class="ui-list">
			<a class="ui-row" href="/more/verify">
				<span>在籍確認</span>
				<span class="ui-row-value">
					{#if data.verifyDays !== null}
						<span class="value" class:soon={data.verifyDays <= 30}>
							確認済み{data.verifyDays <= 30 ? ` · あと${data.verifyDays}日` : ''}
						</span>
					{:else}
						<span class="value">まだ</span>
					{/if}
					<Icon name="chevron" size={16} />
				</span>
			</a>
			{@render link('/more/passkeys', 'パスキー', data.passkeyCount ? `${data.passkeyCount}台` : 'なし')}
			{@render link('/more/sessions', 'ログイン中の端末', `${data.sessionCount}台`)}
			{@render link('/more/backup', 'データの保存と復元')}
		</div>
	</section>

	<section class="ui-section actions">
		<form
			method="POST"
			action="/logout"
			use:enhance={async ({ formData }) => {
				// This browser stops getting notifications for the account it leaves
				const sub = await subscription(1000).catch(() => null);
				if (sub) {
					formData.set('endpoint', sub.endpoint);
					await sub.unsubscribe().catch(() => {});
				}
			}}
		>
			<button class="btn logout" type="submit">ログアウト</button>
		</form>
		<a class="delete" href="/login?reauth=delete&next=%2Fmore%2Fdelete">退会する</a>
	</section>
</div>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 16px 4px;
		text-align: center;
	}

	.profile p {
		margin: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name {
		padding-top: 8px;
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 700;
	}

	.university {
		font-size: 13px;
		color: var(--ink-sub);
	}

	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value.soon {
		font-weight: 600;
		color: var(--accent-text);
	}

	.actions {
		gap: 12px;
		padding-top: 24px;
	}

	.logout {
		width: 100%;
	}

	.delete {
		align-self: center;
		padding: 10px;
		color: var(--ink-sub);
		font-size: 13px;
	}
</style>
