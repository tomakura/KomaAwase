<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import TermBar from '$lib/components/TermBar.svelte';
	import { timetableHref } from '$lib/courses';
	import { DEFAULT_OPTIONS, SIZES, drawTimetable, loadFonts, type ExportData, type ExportOptions } from '$lib/export';
	import { iconOf } from '$lib/icons';
	import { currentTerm } from '$lib/terms';
	import { tokyoTime } from '$lib/time';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let termId = $state((data.terms.find((t) => t.id === data.termParam) ?? currentTerm(data.terms, tokyoTime(data.now).date))?.id);
	const term = $derived(data.terms.find((t) => t.id === termId));

	// Choices are remembered on this device.
	const STORAGE_KEY = 'koma.export';
	function saved(): ExportOptions {
		try {
			return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
		} catch {
			return { ...DEFAULT_OPTIONS };
		}
	}
	let options = $state<ExportOptions>({ ...DEFAULT_OPTIONS });
	let ready = $state(false);
	$effect(() => {
		options = saved();
		ready = true;
	});
	$effect(() => {
		if (!ready) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
		} catch {
			// private mode: the choices just aren't remembered
		}
	});

	const exportData = $derived.by((): ExportData => {
		const courses = data.courses.filter((c) => termId && c.termIds.includes(termId));
		const days = [...new Set([...data.days, ...courses.flatMap((c) => c.slots.map((s) => s.weekday))])].sort((a, b) => a - b);
		return {
			title: `${data.me.nickname ?? ''}の時間割`,
			icon: iconOf(data.me),
			termLabel: [String(data.year), term?.groupName, term?.name].filter(Boolean).join(' '),
			days,
			periods: data.periods,
			courses: courses.filter((c) => c.slots.length),
			unscheduled: courses.filter((c) => !c.slots.length).map((c) => c.title)
		};
	});

	let canvas = $state<HTMLCanvasElement>();
	let fontsFor = '';
	$effect(() => {
		const target = canvas;
		const d = exportData;
		const o = { ...options };
		if (!target || !ready) return;
		const size = SIZES[o.format];
		const key = JSON.stringify(d);
		(async () => {
			if (fontsFor !== key) {
				await loadFonts(d);
				fontsFor = key;
			}
			target.width = size.width;
			target.height = size.height;
			const ctx = target.getContext('2d');
			if (ctx) drawTimetable(ctx, d, o);
		})();
	});

	const fileName = $derived(`komaawase-${data.year}-${term?.name ?? 'timetable'}.png`);
	let message = $state<string | null>(null);
	let busy = $state(false);

	function blob() {
		return new Promise<Blob | null>((resolve) => {
			if (!canvas) resolve(null);
			else canvas.toBlob(resolve, 'image/png');
		});
	}

	async function save() {
		busy = true;
		const b = await blob();
		busy = false;
		if (!b) return;
		const url = URL.createObjectURL(b);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	const canShareFiles = $derived(
		ready && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [new File([], 'x.png', { type: 'image/png' })] })
	);

	async function share() {
		busy = true;
		message = null;
		const b = await blob();
		busy = false;
		if (!b) return;
		try {
			await navigator.share({ files: [new File([b], fileName, { type: 'image/png' })], title: exportData.title });
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError')) message = '共有できませんでした。「画像を保存」をお試しください';
		}
	}

	const TOGGLES: { key: 'hideRoom' | 'day' | 'period' | 'time' | 'name'; label: string }[] = [
		{ key: 'hideRoom', label: '教室名をかくす' },
		{ key: 'day', label: '曜日を入れる' },
		{ key: 'period', label: '時限を入れる' },
		{ key: 'time', label: '時刻を入れる' },
		{ key: 'name', label: 'アイコンとニックネームを入れる' }
	];
	const FORMATS = [
		{ id: 'tall', label: '縦長（ストーリー）' },
		{ id: 'wide', label: '横長（LINE・X）' }
	] as const;
</script>

<svelte:head>
	<title>画像で書き出す · コマあわせ</title>
</svelte:head>

<div class="ui-page">
	<PageHeader title="画像で書き出す" back={timetableHref(termId ?? null)} />
	<TermBar year={data.year} terms={data.terms} bind:termId />

	<div class="preview">
		<canvas bind:this={canvas} class={options.format}>書き出す画像のプレビュー</canvas>
	</div>

	<div class="controls">
		<Segmented options={FORMATS} bind:value={options.format} label="画像の形" />

		<div class="ui-list">
			{#each TOGGLES as t (t.key)}
				<div class="ui-row">
					<span id="opt-{t.key}">{t.label}</span>
					<Switch bind:checked={options[t.key]} labelledby="opt-{t.key}" />
				</div>
			{/each}
		</div>
		<p class="ui-note">メモ・資料・課題・休講は画像に入りません。</p>

		<div class="buttons" class:single={!canShareFiles}>
			<button class="btn btn-primary" type="button" onclick={save} disabled={busy}><Icon name="download" size={18} />画像を保存</button>
			{#if canShareFiles}
				<button class="btn outline" type="button" onclick={share} disabled={busy}><Icon name="share" size={18} />共有する</button>
			{/if}
		</div>
		{#if message}<p class="error" role="alert">{message}</p>{/if}
	</div>
</div>

<style>
	.preview {
		height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 16px;
		border-radius: 18px;
		background: var(--slot);
	}

	canvas {
		display: block;
		border-radius: 12px;
		box-shadow: 0 1px 0 var(--line-strong);
	}

	canvas.tall {
		height: 376px;
		aspect-ratio: 9 / 16;
	}

	canvas.wide {
		width: calc(100% - 24px);
		aspect-ratio: 16 / 9;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 16px 0;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.buttons.single {
		grid-template-columns: 1fr;
	}

	.buttons .btn {
		min-height: 50px;
	}

	.outline {
		border-color: var(--line-bold);
	}
</style>
