<script lang="ts">
	import Icon from './Icon.svelte';

	// Shown next to a nickname when the person confirmed their enrollment with a university address.
	let { label = false }: { label?: boolean } = $props();
</script>

<span class="badge" title="在籍確認済み">
	<Icon name="badge" size={15} label={label ? undefined : '在籍確認済み'} />
	{#if label}<span>在籍確認済み</span>{/if}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--ai);
		font-size: 11px;
		font-weight: 700;
		vertical-align: middle;
	}
</style>
