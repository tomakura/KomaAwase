import { describe, expect, it } from 'vitest';
import { promptKind, type PushState } from './notify-prompt';

const kind = (state: PushState, reminders: number | null = null, asked = false, devices: number | null = 0) =>
	promptKind({ state, asked, reminders, devices });

describe('promptKind', () => {
	it('suggests installing on an iPhone in the browser, and turning on where it can be turned on', () => {
		expect(kind('install')).toBe('install');
		expect(kind('off')).toBe('enable');
	});

	it('tells a device that has notifications on about the reminders, once it is known there are none', () => {
		expect(kind('on', 0)).toBe('reminder');
		expect(kind('on', null)).toBeNull();
		expect(kind('on', 2)).toBeNull();
	});

	it('does not ask to turn notifications on where the person already has them on elsewhere', () => {
		expect(kind('off', null, false, 1)).toBeNull();
		expect(kind('install', null, false, 2)).toBeNull();
		// Not known yet: nothing is shown
		expect(kind('off', null, false, null)).toBeNull();
	});

	it('leaves alone a browser that cannot do it, and one that said no', () => {
		expect(kind('unsupported')).toBeNull();
		expect(kind('denied')).toBeNull();
	});

	it('shows nothing again once it was closed', () => {
		for (const state of ['install', 'off', 'on'] as const) expect(kind(state, 0, true)).toBeNull();
	});
});
