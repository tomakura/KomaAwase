<script lang="ts">
	import { NOTE_LABELS, STATUS_PAGE_URL, fetchStatus, type StatusNote } from '$lib/status';

	// A thin strip at the top while the operator has a notice up (trouble, maintenance), to the status page.
	// Read when the app opens and again now and then while it is on screen.
	const EVERY_MS = 10 * 60 * 1000;
	let note = $state<StatusNote | null>(null);

	$effect(() => {
		let last = 0;
		const check = async () => {
			if (document.hidden || Date.now() - last < EVERY_MS) return;
			last = Date.now();
			const status = await fetchStatus();
			// Offline the strip stays as it was: the connection strip says the rest
			if (status) note = status.notes.find((n) => !n.resolvedAt) ?? null;
		};
		void check();
		const timer = setInterval(check, 60 * 1000);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', check);
		};
	});
</script>

{#if note}
	<a class="strip" class:trouble={note.level === 'trouble'} href={STATUS_PAGE_URL} target="_blank" rel="noopener">
		<span class="inner">
			<b>{NOTE_LABELS[note.level]}</b>
			<span class="body">{note.body}</span>
		</span>
	</a>
{/if}

<style>
	.strip {
		display: block;
		background: var(--course-yellow);
		color: var(--ink);
		font-size: 12px;
		text-decoration: none;
	}

	.inner {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 480px;
		margin: 0 auto;
		box-sizing: border-box;
		padding: 8px 16px;
	}

	.strip.trouble {
		background: var(--accent-text);
		color: var(--surface);
	}

	b {
		flex: none;
		white-space: nowrap;
	}

	.body {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
