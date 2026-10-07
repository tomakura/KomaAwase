import { describe, expect, it } from 'vitest';
import { backTrail } from './back';

const ORIGIN = 'https://koma.test';

// The history as SvelteKit numbers it, and the page at each entry
function setup() {
	const at = { index: 1 as number | undefined, path: '/' };
	const trail = backTrail({ index: () => at.index, path: () => at.path });
	return {
		trail,
		/** A page change to `path`, at the entry `index` */
		go(index: number, path: string) {
			at.index = index;
			at.path = path;
			trail.arrived();
		},
		/** An entry added without a page change (a course opened over the timetable) */
		shallow(index: number, path: string) {
			at.index = index;
			at.path = path;
		},
		leadsTo: (href: string) => trail.leadsTo(href, ORIGIN)
	};
}

describe('backTrail', () => {
	it('goes back to the page just before, whatever its query', () => {
		const s = setup();
		s.go(1, '/more');
		s.go(2, '/more/nickname');
		expect(s.leadsTo('/more')).toBe(true);
		expect(s.leadsTo('/more?x=1')).toBe(true);
		expect(s.leadsTo('/friends')).toBe(false);
	});

	it('opens the page instead when it is not the one before (the app opened on this one, say)', () => {
		const s = setup();
		s.go(5, '/courses/c1');
		expect(s.leadsTo('/')).toBe(false);
	});

	it('counts an entry added without a page change', () => {
		const s = setup();
		s.go(1, '/');
		// The course over the timetable, then its edit page
		s.shallow(2, '/courses/c1');
		s.go(3, '/courses/c1/edit');
		expect(s.leadsTo('/')).toBe(false);
	});

	it('follows going back, and a page that replaced the one before', () => {
		const s = setup();
		s.go(1, '/');
		s.go(2, '/friends');
		s.go(3, '/friends/f1');
		s.go(2, '/friends');
		s.go(3, '/groups/g1');
		expect(s.leadsTo('/friends')).toBe(true);
		s.go(3, '/overlay');
		expect(s.leadsTo('/friends')).toBe(true);
		s.go(2, '/friends');
		expect(s.leadsTo('/')).toBe(true);
	});

	it('leaves other sites alone', () => {
		const s = setup();
		s.go(1, '/');
		s.go(2, '/more');
		expect(s.leadsTo('https://other.test/')).toBe(false);
	});
});
