// A short message at the bottom of the screen with one button: 削除しました ［元に戻す］,
// 下書きを復元しました ［消す］. One for the whole app (Toast in the root layout).
const SHOWN_MS = 6000;

export type ToastAction = { label: string; run: () => unknown };

class Toasts {
	current = $state<{ key: number; text: string; action?: ToastAction } | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;
	#key = 0;

	show(text: string, action?: ToastAction) {
		clearTimeout(this.#timer);
		this.current = { key: ++this.#key, text, action };
		this.#timer = setTimeout(() => (this.current = null), SHOWN_MS);
	}

	hide() {
		clearTimeout(this.#timer);
		this.current = null;
	}
}

export const toast = new Toasts();

/**
 * For a delete form's result: when the server kept what it deleted (src/lib/server/undo.ts),
 * offers 元に戻す for a few seconds. `refresh` shows it back on the page.
 */
export function offerUndo(result: { type: string; data?: Record<string, unknown> }, refresh: () => Promise<unknown>) {
	const id = result.type === 'success' ? result.data?.undo : null;
	if (typeof id !== 'string') return;
	toast.show('削除しました', {
		label: '元に戻す',
		run: async () => {
			const res = await fetch('/api/undo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(
				() => null
			);
			if (!res?.ok) return toast.show('元に戻せませんでした');
			await refresh();
		}
	});
}
