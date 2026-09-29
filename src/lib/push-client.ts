// What the browser side of notifications needs, shared by the settings page and the screen that
// suggests turning them on. Browser only.
import type { PushState } from './notify-prompt';

// iPhone and iPad only deliver notifications to the app added to the home screen
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
	matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// With `waitMs`, a worker that never gets ready (none is registered) ends as an error
function ready(waitMs?: number) {
	if (!waitMs) return navigator.serviceWorker.ready;
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no service worker')), waitMs))
	]);
}

export async function subscription(waitMs?: number) {
	return (await ready(waitMs)).pushManager.getSubscription();
}

/** What this device can do. With `waitMs`, no service worker in that time means it can't. */
export async function pushState(waitMs?: number): Promise<PushState> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
		return isIos() && !isStandalone() ? 'install' : 'unsupported';
	}
	if (Notification.permission === 'denied') return 'denied';
	try {
		return (await subscription(waitMs)) ? 'on' : 'off';
	} catch {
		return 'unsupported';
	}
}

function keyBytes(key: string) {
	const s = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4));
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Asks for permission and registers this browser. `state` is what the device is left as when it fails. */
export async function enablePush(publicKey: string): Promise<{ ok: true } | { ok: false; state: 'denied' | 'off'; message?: string }> {
	try {
		if ((await Notification.requestPermission()) !== 'granted') {
			return { ok: false, state: Notification.permission === 'denied' ? 'denied' : 'off' };
		}
		const registration = await navigator.serviceWorker.ready;
		const sub =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
		const res = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});
		if (!res.ok) {
			const message = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'この端末では通知を受け取れませんでした';
			await sub.unsubscribe();
			return { ok: false, state: 'off', message };
		}
		return { ok: true };
	} catch {
		return { ok: false, state: 'off', message: 'この端末では通知を受け取れませんでした' };
	}
}
