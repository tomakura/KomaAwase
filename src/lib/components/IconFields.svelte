<script lang="ts">
	import { ICON_COLORS, ICON_TEXT_MAX } from '$lib/icons';
	import PhotoPicker from './PhotoPicker.svelte';

	// The photo, letters and color of an icon, for the icon page and はじめに. It sits inside
	// the form that saves them; `prepare` adds the framed photo to what is sent.
	let {
		text = $bindable(),
		color = $bindable(),
		hasPhoto = false,
		removeFormId
	}: {
		text: string;
		color: string;
		hasPhoto?: boolean;
		// A form (outside this one, so forms aren't nested) that removes the saved photo
		removeFormId?: string;
	} = $props();

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

	/** Puts the framed photo in `formData`; false when there is one that can't be sent */
	export function prepare(formData: FormData) {
		photoError = null;
		if (!photoSrc) return true;
		const url = picker?.render();
		if (url) {
			formData.set('photo', url);
			return true;
		}
		// Not loaded (HEIC outside Safari, say) or too big even at low quality
		photoError = 'この写真は使えませんでした。別の写真でやり直してください';
		return false;
	}
</script>

<section class="photo">
	<h2>写真</h2>
	<input class="file" type="file" accept="image/*" bind:this={photoInput} onchange={(e) => pickPhoto(e.currentTarget.files)} />
	{#if photoSrc}
		<PhotoPicker src={photoSrc} bind:this={picker} />
		{#if photoError}<p class="error" role="alert">{photoError}</p>{/if}
		<div class="row">
			<button class="btn" type="button" onclick={cancelPhoto}>やめる</button>
		</div>
	{:else}
		<div class="row">
			<button class="btn" type="button" onclick={() => photoInput?.click()}>
				{hasPhoto ? '写真を変える' : '写真を選ぶ'}
			</button>
			{#if hasPhoto && removeFormId}
				<button class="btn" type="submit" form={removeFormId}>写真をやめる</button>
			{/if}
		</div>
		<p class="ui-note">写真は友だちとグループのメンバーに表示されます。</p>
	{/if}
</section>

<div class="letters">
	{#if hasPhoto}<p class="ui-note">文字と色は、写真が表示されるまでの間に使われます。</p>{/if}
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

	.file {
		display: none;
	}

	.row {
		display: flex;
		gap: 10px;
	}

	.row > * {
		flex: 1;
	}

	.letters {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 6px 16px 0;
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
