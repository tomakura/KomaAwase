<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import DayPicker from '$lib/components/DayPicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import { daysLabel } from '$lib/courses';
	import { STATUS_PAGE_URL } from '$lib/status';
	import { THEMES, applyTheme, type Theme } from '$lib/theme';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let theme = $state<Theme>(data.user.theme);
	// svelte-ignore state_referenced_locally
	let days = $state(data.user.days);
	let daysForm = $state<HTMLFormElement>();
	let themeForm = $state<HTMLFormElement>();
	let editingDays = $state(false);
	// svelte-ignore state_referenced_locally
	let shareCancel = $state(data.shareCancellations);
	let shareForm = $state<HTMLFormElement>();
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
		{#if data.isAdmin}
			<section class="ui-section">
				<div class="ui-list">
					<a class="ui-row" href="/login?reauth=admin&next=%2Fadmin">
						<span>運営（問い合わせ・通報・要望）</span>
						<span class="ui-row-value">
							<span class="value" class:soon={data.openReports > 0}>{data.openReports ? `未対応 ${data.openReports}件` : 'なし'}</span>
							<Icon name="chevron" size={16} />
						</span>
					</a>
				</div>
			</section>
		{/if}

		<section class="ui-section">
			<div class="ui-list">
				<a class="ui-row account" href="/more/account">
					<UserIcon user={data.user} size={48} />
					<span class="account-text">
						<span class="account-name">{data.user.nickname}</span>
						<span class="row-sub">{data.universityName ?? '大学は未設定'}</span>
					</span>
					<span class="ui-row-value"><Icon name="chevron" size={16} /></span>
				</a>
			</div>
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">時間割</h2>
			<div class="ui-list">
				{@render link('/more/timetable', '時間割の管理', data.timetableLabel)}
				{@render link('/more/past', '過去の時間割', data.pastCount ? `${data.pastCount}件` : 'なし')}
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
				{@render link('/more/periods', '時限と時刻', data.periodsLabel)}
				{@render link('/more/terms', '学期の区切り', data.termsLabel)}
				{@render link('/calendar?back=/more', '日程（休み・試験期間）')}
			</div>
			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">アプリ</h2>
			<div class="ui-list">
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
				{@render link('/more/notifications', '通知')}
				<!-- Class names here stay clear of ad blocker lists (a "share-text" class gets hidden) -->
				<form
					class="block switch-row"
					method="POST"
					action="?/shareCancellations"
					bind:this={shareForm}
					use:enhance={() => async ({ update }) => update({ reset: false })}
				>
					<span id="cancel-notice-label" class="row-text">
						休講を同じ授業の人に知らせる
						<span class="row-sub">名前は出ません。人数だけが見えます。</span>
					</span>
					<Switch
						bind:checked={shareCancel}
						name="share"
						labelledby="cancel-notice-label"
						onchange={() => queueMicrotask(() => shareForm?.requestSubmit())}
					/>
				</form>
				{@render link('/install', 'ホーム画面に追加')}
			</div>
		</section>

		<section class="ui-section">
			<h2 class="ui-section-title">サポート</h2>
			<div class="ui-list">
				{@render link('/feedback?from=/more', '不具合・要望を送る')}
				{@render link('/contact', 'お問い合わせ')}
				<a class="ui-row" href={STATUS_PAGE_URL} target="_blank" rel="noopener">
					<span>稼働状況</span>
					<span class="ui-row-value"><Icon name="external" size={16} /></span>
				</a>
				{#if data.supportUrl}
					<a class="ui-row" href={data.supportUrl} target="_blank" rel="noopener">
						<span>開発を応援する</span>
						<span class="ui-row-value"><Icon name="external" size={16} /></span>
					</a>
				{/if}
			</div>
		</section>

		<nav class="legal" aria-label="規約など">
			<a href="/terms">利用規約</a>
			<a href="/privacy">プライバシーポリシー</a>
			<a href="/about">このアプリについて</a>
		</nav>
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

	.switch-row {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		font-size: 14px;
	}

	.row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.account {
		justify-content: flex-start;
		padding: 12px 14px;
	}

	.account-text {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.account-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 16px;
		font-weight: 600;
	}

	.legal {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 16px;
		padding: 24px 16px 0;
		font-size: 12px;
	}

	.legal a {
		padding: 6px 0;
		color: var(--ink-sub);
	}

	.error {
		padding: 0 4px;
	}
</style>
