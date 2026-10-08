<script lang="ts">
	import { ask } from '$lib/confirm.svelte';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { motion } from '$lib/motion';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import QrCode from '$lib/components/QrCode.svelte';
	import ReportForm from '$lib/components/ReportForm.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import UserIcon from '$lib/components/UserIcon.svelte';
	import VerifiedBadge from '$lib/components/VerifiedBadge.svelte';
	import { copyText, shareLink } from '$lib/share';
	import { INVITE_CLOSED, SHARE_CHOICES, SHARE_NOTES } from '$lib/sharing';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let share = $state(data.share);
	let shareForm = $state<HTMLFormElement>();
	let menu = $state(false);
	let inviting = $state(false);
	let renaming = $state(false);
	let reporting = $state(false);
	let bansOpen = $state(false);
	let remaking = $state(false);
	let days = $state('0');
	let uses = $state('0');
	// The member whose sheet is open: make admin, hand over, make leave
	let picked = $state<(typeof data.members)[number] | null>(null);
	let memberOpen = $state(false);
	let status = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let approval = $state(data.group.approval);
	let approvalForm = $state<HTMLFormElement>();

	// Members whose timetables can be laid over, at most as many as the overlay takes
	const overlayWith = $derived(data.members.filter((m) => m.visible).map((m) => m.id).slice(0, 20));

	// What the owner may do to a member, and what an admin may (only to members who aren't admins)
	const canAct = (m: (typeof data.members)[number]) =>
		m.id !== data.meId && (data.isOwner || (data.isManager && !m.owner && m.role !== 'admin'));

	const DAY_OPTIONS = [
		{ id: '0', label: 'なし' },
		{ id: '1', label: '1日' },
		{ id: '7', label: '7日' },
		{ id: '30', label: '30日' }
	] as const;
	const USE_OPTIONS = [
		{ id: '0', label: 'なし' },
		{ id: '1', label: '1人' },
		{ id: '5', label: '5人' },
		{ id: '10', label: '10人' },
		{ id: '30', label: '30人' }
	] as const;

	const limits = $derived(
		[
			data.inviteUsesLeft !== null ? `あと${data.inviteUsesLeft}人` : null,
			data.inviteExpiresAt
				? `${new Date(data.inviteExpiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}まで`
				: null
		]
			.filter(Boolean)
			.join('・')
	);

	async function sendInvite() {
		const result = await shareLink(data.invite, `コマあわせの「${data.group.name}」に参加しよう`);
		status = result === 'copied' ? 'リンクをコピーしました' : result === 'failed' ? 'リンクをコピーできませんでした' : null;
	}
</script>

<svelte:head>
	<title>{data.group.name} · コマあわせ</title>
</svelte:head>

{#snippet trailing()}
	<button class="icon-button" type="button" aria-label="グループのメニュー" onclick={() => (menu = true)}>
		<Icon name="more" size={22} />
	</button>
{/snippet}

<div class="ui-page">
	<PageHeader title={data.group.name} back="/friends" {trailing} />

	<section class="ui-section">
		<form
			class="ui-list"
			method="POST"
			action="?/share"
			bind:this={shareForm}
			use:enhance={() => async ({ update }) => update({ reset: false })}
		>
			<div class="share">
				<span class="field-label">このグループへの時間割の見せ方</span>
				<Segmented
					options={SHARE_CHOICES}
					bind:value={share}
					label="このグループへの時間割の見せ方"
					name="share"
					onchange={() => tick().then(() => shareForm?.requestSubmit())}
				/>
			</div>
		</form>
		<p class="ui-note">
			{SHARE_NOTES[share]}{share === 'none' ? 'あなたはほかのメンバーの時間割を見られます。' : ''}
			<a href="/friends/sharing/preview?as={data.group.id}">見え方を確かめる</a>
		</p>
	</section>

	<section class="ui-section group-actions">
		{#if overlayWith.length}
			<a class="btn btn-primary" href="/overlay?with={overlayWith.join(',')}"><Icon name="overlap" size={18} />メンバーと重ねる</a>
		{/if}
		<button class="btn" type="button" onclick={() => (inviting = true)}><Icon name="plus" size={18} />メンバーを招待する</button>
	</section>

	{#if data.requests.length}
		<section class="ui-section">
			<h2 class="ui-section-title">参加の申請（{data.requests.length}）</h2>
			<div class="ui-list">
				{#each data.requests as r (r.id)}
					<div transition:slide={motion()} class="member">
						<div class="who">
							<UserIcon user={r} size={36} />
							<span class="text">
								<span class="name">{r.nickname}</span>
								{#if r.university}<span class="sub">{r.university}</span>{/if}
							</span>
						</div>
						<form method="POST" action="?/approve" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<button class="small" type="submit">承認</button>
						</form>
						<form method="POST" action="?/decline" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<button class="remove" type="submit" aria-label="{r.nickname}さんの申請を断る"><Icon name="close" size={18} /></button>
						</form>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="ui-section">
		<h2 class="ui-section-title">メンバー（{data.members.length}人）</h2>
		<div class="ui-list">
			{#each data.members as m (m.id)}
				<div transition:slide={motion()} class="member">
					<svelte:element this={m.visible ? 'a' : 'div'} class="who" href={m.visible ? `/friends/${m.id}` : undefined}>
						<UserIcon user={m} size={36} />
						<span class="text">
							<span class="name">
								{m.nickname}{#if m.verified}<VerifiedBadge />{/if}{#if m.id === data.meId}<span class="tag">あなた</span>{/if}{#if m.owner}<span class="tag">持ち主</span>{:else if m.role === 'admin'}<span class="tag">管理者</span>{/if}
							</span>
							<span class="sub">
								{m.share === 'none' ? '時間割を見せていません' : m.share === 'free' ? '空き時間だけ見せています' : (m.university ?? '')}
							</span>
						</span>
						{#if m.visible}<Icon name="chevron" size={16} />{/if}
					</svelte:element>
					{#if canAct(m)}
						<button
							class="remove"
							type="button"
							aria-label="{m.nickname}さんのメニュー"
							onclick={() => {
								picked = m;
								memberOpen = true;
							}}><Icon name="more" size={18} /></button
						>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</div>

<Sheet bind:open={inviting} title="メンバーを招待する">
	{#if data.inviteClosed}
		<p class="ui-note" role="status">{INVITE_CLOSED[data.inviteClosed]}</p>
	{:else}
		<p class="ui-note">
			{data.group.approval
				? 'このリンクを開いた人は、参加を申請できます。グループの管理者が承認すると参加できます。'
				: 'このリンクを開いた人は、だれでもグループに参加できます。知らない人に広まったら作り直してください。'}
			{#if limits}このリンクは{limits}使えます。{/if}
		</p>
	{/if}
	{#if data.isManager && data.inviteClosed}
		<button
			class="btn btn-primary"
			type="button"
			onclick={() => {
				inviting = false;
				remaking = true;
			}}><Icon name="sync" size={18} />招待リンクを作り直す</button
		>
	{:else if !data.inviteClosed}
	<div class="qr"><QrCode text={data.invite} size={180} label="招待リンクのQRコード" /></div>
	<div class="buttons">
		<button class="btn btn-primary" type="button" onclick={sendInvite}><Icon name="share" size={18} />共有する</button>
		<button
			class="btn"
			type="button"
			onclick={async () => (status = (await copyText(data.invite)) === 'copied' ? 'リンクをコピーしました' : 'リンクをコピーできませんでした')}
		>
			<Icon name="copy" size={18} />リンクをコピー
		</button>
	</div>
	{/if}
	{#if status}<p class="ui-note" role="status">{status}</p>{/if}
</Sheet>

<Sheet bind:open={menu} title={data.group.name}>
	<div class="ui-list">
		{#if data.isOwner}
			<button
				class="ui-row"
				type="button"
				onclick={() => {
					menu = false;
					renaming = true;
				}}><span>名前を変える</span><Icon name="edit" size={18} /></button
			>
		{/if}
		{#if data.isManager}
			<button
				class="ui-row"
				type="button"
				onclick={() => {
					menu = false;
					remaking = true;
				}}><span>招待リンクを作り直す</span><Icon name="sync" size={18} /></button
			>
		{/if}
		{#if data.isOwner}
			<form
				method="POST"
				action="?/approval"
				bind:this={approvalForm}
				use:enhance={() => async ({ update }) => update({ reset: false })}
			>
				<div class="ui-row">
					<span id="approval-label">参加を承認制にする</span>
					<Switch
						bind:checked={approval}
						labelledby="approval-label"
						name="approval"
						onchange={() => queueMicrotask(() => approvalForm?.requestSubmit())}
					/>
				</div>
			</form>
		{/if}
		{#if data.isManager}
			<button
				class="ui-row"
				type="button"
				onclick={() => {
					menu = false;
					bansOpen = true;
				}}
			>
				<span>退出させた人</span>
				<span class="ui-row-value">{#if data.bans.length}<span class="value">{data.bans.length}人</span>{/if}<Icon name="chevron" size={16} /></span>
			</button>
		{/if}
		{#if !data.isOwner}
			<button
				class="ui-row"
				type="button"
				onclick={() => {
					menu = false;
					reporting = true;
				}}><span>通報する</span><Icon name="flag" size={18} /></button
			>
		{/if}
		<form
			method="POST"
			action="?/leave"
			use:enhance={async ({ cancel }) => {
				const next =
					data.isOwner && data.members.length > 1
						? data.members.some((m) => m.role === 'admin')
							? 'グループは管理者に引き継がれます。'
							: 'グループはいちばん前からいるメンバーに引き継がれます。'
						: '';
				if (!(await ask({ message: `「${data.group.name}」を抜けます。${next}`, ok: '抜ける', danger: true }))) return cancel();
			}}
		>
			<button class="ui-row" type="submit"><span>グループを抜ける</span></button>
		</form>
		{#if data.isOwner}
			<form
				method="POST"
				action="?/delete"
				use:enhance={async ({ cancel }) => {
					if (!(await ask({ message: `「${data.group.name}」を消します。メンバー全員がグループから外れます`, ok: '消す', danger: true }))) return cancel();
				}}
			>
				<button class="ui-row danger" type="submit"><span>グループを消す</span><Icon name="trash" size={18} /></button>
			</form>
		{/if}
	</div>
</Sheet>

<Sheet bind:open={renaming} title="名前を変える">
	<form
		class="rename"
		method="POST"
		action="?/rename"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') renaming = false;
			}}
	>
		<label class="field">
			グループの名前
			<input name="name" value={data.group.name} maxlength="30" required />
		</label>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="btn btn-primary" type="submit">保存する</button>
	</form>
</Sheet>

<Sheet bind:open={remaking} title="招待リンクを作り直す">
	<form
		class="rename"
		method="POST"
		action="?/regenerate"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					remaking = false;
					inviting = true;
				}
			}}
	>
		<p class="ui-note">今の招待リンクは使えなくなります。</p>
		<span class="field-label">使える期間</span>
		<Segmented options={DAY_OPTIONS} bind:value={days} label="使える期間" name="days" />
		<span class="field-label">参加できる人数</span>
		<Segmented options={USE_OPTIONS} bind:value={uses} label="参加できる人数" name="uses" />
		<button class="btn btn-primary" type="submit">作り直す</button>
	</form>
</Sheet>

<Sheet bind:open={memberOpen} title={picked ? `${picked.nickname}さん` : ''}>
	{#if picked}
		{@const m = picked}
		<div class="ui-list">
			{#if data.isOwner}
				<form
					method="POST"
					action="?/admin"
					use:enhance={() => async ({ update }) => {
						await update();
						memberOpen = false;
					}}
				>
					<input type="hidden" name="id" value={m.id} />
					{#if m.role !== 'admin'}<input type="hidden" name="admin" value="on" />{/if}
					<button class="ui-row" type="submit">
						<span>{m.role === 'admin' ? '管理者から外す' : '管理者にする'}</span>
					</button>
				</form>
				<form
					method="POST"
					action="?/transfer"
					use:enhance={async ({ cancel }) => {
						if (!(await ask({ message: `「${data.group.name}」の持ち主を${m.nickname}さんに渡します。あなたは管理者として残ります。`, ok: '渡す' }))) return cancel();
						return async ({ update }) => {
							await update();
							memberOpen = false;
						};
					}}
				>
					<input type="hidden" name="id" value={m.id} />
					<button class="ui-row" type="submit"><span>持ち主を渡す</span></button>
				</form>
			{/if}
			<form
				method="POST"
				action="?/remove"
				use:enhance={async ({ cancel }) => {
					if (!(await ask({ message: `${m.nickname}さんを退出させますか？ 退出させた人は、招待リンクから参加できなくなります。`, ok: '退出させる', danger: true }))) return cancel();
					return async ({ update }) => {
						await update();
						memberOpen = false;
					};
				}}
			>
				<input type="hidden" name="id" value={m.id} />
				<button class="ui-row danger" type="submit"><span>退出させる</span></button>
			</form>
		</div>
		{#if data.isOwner}
			<p class="ui-note">管理者は、参加の承認、退出させる、招待リンクの作り直しができます。</p>
		{/if}
	{/if}
</Sheet>

<Sheet bind:open={bansOpen} title="退出させた人">
	{#if data.bans.length}
		<p class="ui-note">この人たちは、招待リンクから参加できません。</p>
		<div class="ui-list">
			{#each data.bans as b (b.id)}
				<div transition:slide={motion()} class="member">
					<div class="who">
						<UserIcon user={b} size={36} />
						<span class="text"><span class="name">{b.nickname}</span></span>
					</div>
					<form method="POST" action="?/unban" use:enhance>
						<input type="hidden" name="id" value={b.id} />
						<button class="small" type="submit">参加できるようにする</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<p class="ui-note">退出させた人はいません。</p>
	{/if}
</Sheet>

<Sheet bind:open={reporting} title="グループを通報">
	<ReportForm reasons={data.reportReasons} action="?/report" done={() => (reporting = false)} />
</Sheet>

<style>
	.group-actions {
		gap: 8px;
	}

	.share {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
	}

	.field-label {
		font-size: 14px;
		font-weight: 700;
	}

	.icon-button {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.member {
		display: flex;
		align-items: center;
		padding-right: 4px;
	}

	.who {
		min-width: 0;
		min-height: 60px;
		flex-grow: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px 6px 12px;
		color: var(--ink);
		text-decoration: none;
	}

	.who > :global(.icon) {
		color: var(--ink-sub);
	}

	.text {
		min-width: 0;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		font-weight: 700;
	}

	.tag {
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--slot);
		color: var(--ink-soft);
		font-size: 10px;
		font-weight: 700;
	}

	.sub {
		font-size: 12px;
		color: var(--ink-sub);
	}

	.remove {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-sub);
		cursor: pointer;
	}

	.qr {
		display: flex;
		justify-content: center;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.rename {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.danger {
		color: var(--accent-text);
	}
</style>
