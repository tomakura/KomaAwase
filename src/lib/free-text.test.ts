import { expect, it } from 'vitest';
import { freeText } from './free-text';

it('writes the term and each day', () => {
	expect(
		freeText({ year: 2026, groupName: '後期', name: 'Q3' }, [
			[1, [2, 4]],
			[2, [1, 3]]
		])
	).toBe('みんな空いてるコマ（2026年度 後期 Q3）\n月 2限・4限\n火 1限・3限');
});

it('leaves out a term group that is not there', () => {
	expect(freeText({ year: 2026, groupName: null, name: '前期' }, [[3, [5]]])).toBe('みんな空いてるコマ（2026年度 前期）\n水 5限');
});
