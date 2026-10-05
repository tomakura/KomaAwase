import { DRAFT_PREFIX } from './offline';
import { toast } from './toast.svelte';

// What was being typed in a form (a memo, a task, an event, feedback), kept on this device so
// it comes back when the form is opened again. Never sent anywhere; cleared on submitting, and
// with the page copies when someone signs out or another account signs in (src/lib/offline.ts).
type Fields = Record<string, string>;

// The fields worth keeping: what the person typed or chose, not hidden values or files
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const fieldsOf = (form: HTMLFormElement) =>
	[...form.elements].filter(
		(el) =>
			(el instanceof HTMLInputElement && !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button'].includes(el.type)) ||
			el instanceof HTMLTextAreaElement ||
			el instanceof HTMLSelectElement
	) as Field[];

// Only text the person wrote makes a draft; a date on its own does not
const hasText = (form: HTMLFormElement) =>
	fieldsOf(form).some((el) => (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) && el.value.trim());

function read(key: string): Fields | null {
	try {
		const saved = JSON.parse(localStorage.getItem(DRAFT_PREFIX + key) ?? 'null');
		return saved && typeof saved === 'object' ? saved : null;
	} catch {
		return null;
	}
}

function write(key: string, fields: Fields | null) {
	try {
		if (fields) localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(fields));
		else localStorage.removeItem(DRAFT_PREFIX + key);
	} catch {
		// Storage can be off or full: there is just no draft
	}
}

/**
 * use:draft={key} on a form: puts back what was being typed when it opens (saying so, with a
 * button to throw it away), keeps what is typed, and forgets it once the form is sent. No key:
 * nothing is kept (editing something that exists, say).
 */
export function draft(form: HTMLFormElement, key: string | null) {
	let stop = start(form, key);
	return {
		update(next: string | null) {
			if (next === key) return;
			stop();
			key = next;
			stop = start(form, key);
		},
		destroy: () => stop()
	};
}

function start(form: HTMLFormElement, key: string | null) {
	if (!key) return () => {};
	const set = (el: Field, value: string) => {
		el.value = value;
		// So a value bound in the component follows
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const save = () => {
		if (!hasText(form)) return write(key, null);
		write(key, Object.fromEntries(fieldsOf(form).filter((el) => el.name).map((el) => [el.name, el.value])));
	};

	const saved = read(key);
	// Only into an empty form: never over something already there
	if (saved && !hasText(form)) {
		const before = new Map(fieldsOf(form).map((el) => [el, el.value]));
		for (const el of fieldsOf(form)) if (el.name && el.name in saved) set(el, saved[el.name]);
		toast.show('下書きを復元しました', {
			label: '消す',
			run: () => {
				for (const [el, value] of before) if (el.isConnected) set(el, value);
				clearTimeout(timer);
				timer = undefined;
				write(key, null);
			}
		});
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	const keep = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			save();
		}, 300);
	};
	const sent = () => {
		clearTimeout(timer);
		timer = undefined;
		write(key, null);
	};
	form.addEventListener('input', keep);
	form.addEventListener('change', keep);
	form.addEventListener('submit', sent);
	return () => {
		// Typed just before closing: keep it now
		if (timer) {
			clearTimeout(timer);
			save();
		}
		form.removeEventListener('input', keep);
		form.removeEventListener('change', keep);
		form.removeEventListener('submit', sent);
	};
}
