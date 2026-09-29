<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import DayPicker from '$lib/components/DayPicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { daysLabel } from '$lib/courses';
	import { THEMES, applyTheme, type Theme } from '$lib/theme';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let theme = $state<Theme>(data.user.theme);
	// svelte-ignore state_referenced_locally
	let days = $state(data.user.days);
	let daysForm = $state<HTMLFormElement>();
	let themeForm = $state<HTMLFormElement>();
	let editingDays = $state(false);
</script>

<svelte:head>
	<title>その他 · コマあわせ</title>
</svelte:head>

{#snippet link(href: string, label: string, value?: string | null)}
	<a class="ui-row" {href}>
		<span>{label}</span>
		<span class="ui-row-value">{#if value}<span class="value">{value}</span>{/if}<Icon name="chevron" size={16} /></span>
	</a>
{/snippet}

<div class="screen">
	<header>
		<h1>その他</h1>
	</header>

	<main>
		<section class="ui-section">
			<h2 class="ui-section-title">時間割</h2>
			<div class="ui-list">
				{@render link('/more/timetable', '時間割の管理', data.timetableLabel)}
				{@render link('/more/past', '過去の時間割', data.pastCount ? `${data.pastCount}件` : 'なし')}
			</div>
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">表示</h2>
			<div class="ui-list">
				<div class="block">
					<button type="button" class="ui-row plain" aria-expanded={editingDays} onclick={() => (editingDays = !editingDays)}>
						<span>表示する曜日</span>
						<span class="ui-row-value">{daysLabel(days)}<Icon name="chevron" size={16} /></span>
					</button>
					{#if editingDays}
						<!-- Saved as soon as a day is switched -->
						<form method="POST" action="?/days" bind:this={daysForm} use:enhance={() => async ({ update }) => update({ reset: false })}>
							<div class="picker">
								<DayPicker bind:days name="days" onchange={() => queueMicrotask(() => daysForm?.requestSubmit())} />
							</div>
						</form>
					{/if}
				</div>
				<form
					class="block theme"
					method="POST"
					action="?/theme"
					bind:this={themeForm}
					use:enhance={() => async ({ update }) => update({ reset: false })}
				>
					<span class="label">テーマ</span>
					<Segmented
						options={THEMES}
						bind:value={theme}
						label="テーマ"
						name="theme"
						onchange={(t) => {
							applyTheme(t);
							queueMicrotask(() => themeForm?.requestSubmit());
						}}
					/>
				</form>
				{@render link('/more/periods', '時限と時刻', data.periodsLabel)}
				{@render link('/more/terms', '学期の区切り', data.termsLabel)}
			</div>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">アプリ</h2>
			<div class="ui-list">
				{@render link('/more/notifications', '通知')}
				{@render link('/install', 'ホーム画面に追加')}
			</div>
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">アカウント</h2>
			<div class="ui-list">
				<a class="ui-row" href="/more/icon">
					<span>アイコン</span>
					<span class="ui-row-value"><UserIcon user={data.user} size={28} /><Icon name="chevron" size={16} /></span>
				</a>
				{@render link('/more/nickname', 'ニックネーム', data.user.nickname)}
				{@render link('/more/university', '大学', data.universityName ?? '未設定')}
				{@render link('/more/passkeys', 'パスキー', data.passkeyCount ? `${data.passkeyCount}台` : 'なし')}
				<a class="ui-row" href="/more/verify">
					<span>在籍確認</span>
					<span class="ui-row-value">
						{#if data.verifyDays !== null}
							<span class="value" class:soon={data.verifyDays <= 30}>確認済み · あと{data.verifyDays}日</span>
						{:else}
							<span class="value">まだ</span>
						{/if}
						<Icon name="chevron" size={16} />
					</span>
				</a>
			</div>
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">サポート</h2>
			<div class="ui-list">
				{@render link('/feedback?from=/more', '不具合・要望を送る')}
				{#if data.supportUrl}
					<a class="ui-row" href={data.supportUrl} target="_blank" rel="noopener">
						<span>開発を応援する</span>
						<span class="ui-row-value"><Icon name="external" size={16} /></span>
					</a>
				{/if}
				{@render link('/terms', '利用規約')}
				{@render link('/privacy', 'プライバシーポリシー')}
				{@render link('/about', 'このアプリについて')}
				{#if data.isAdmin}{@render link('/admin', '運営（通報・要望）')}{/if}
			</div>
		</section>

		<section class="ui-section account-actions">
			<form method="POST" action="/logout">
				<button class="btn logout" type="submit">ログアウト</button>
			</form>
			<a class="delete" href="/more/delete">退会する</a>
		</section>
	</main>

	<BottomNav current="more" />
</div>

<style>
	header {
		padding: 18px 16px 4px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 22px;
	}

	main {
		padding-bottom: 28px;
	}

	.value.soon {
		font-weight: 600;
		color: var(--accent-text);
	}

	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.block {
		display: flex;
		flex-direction: column;
	}

	.plain {
		width: 100%;
		border: none;
		background: none;
		font-family: inherit;
		cursor: pointer;
	}

	.plain[aria-expanded='true'] :global(.icon) {
		transform: rotate(90deg);
	}

	.picker {
		padding: 0 14px 14px;
	}

	.theme {
		gap: 8px;
		padding: 12px 14px;
	}

	.label {
		font-size: 14px;
	}

	.account-actions {
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

	.error {
		padding: 0 4px;
	}
</style>
