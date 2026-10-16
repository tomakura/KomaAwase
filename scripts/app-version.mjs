import { execFileSync } from 'node:child_process';

// The version people see, like 2026.10.16-002: the Japan date of the commit being built, and
// which change to main it was on that day (merges and direct pushes, counted along main's
// first parents). Builds of the same commit get the same version.
//
// Workers Builds and GitHub Actions check out a shallow copy, so the rest of the history is
// fetched first. Without it the day's count is unknown and only the date is given.
export function appVersion() {
	const git = (...args) =>
		execFileSync('git', args, {
			encoding: 'utf8',
			env: { ...process.env, TZ: 'Asia/Tokyo' },
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	try {
		if (git('rev-parse', '--is-shallow-repository') === 'true') {
			try {
				git('fetch', '--quiet', '--unshallow');
			} catch {
				// Counted below only if the day's commits are all there anyway
			}
		}
		const days = git('log', '--first-parent', '--format=%cd', '--date=format-local:%Y.%m.%d', 'HEAD').split('\n');
		const other = days.findIndex((day) => day !== days[0]);
		if (other === -1 && git('rev-parse', '--is-shallow-repository') === 'true') return days[0];
		const count = other === -1 ? days.length : other;
		return `${days[0]}-${String(count).padStart(3, '0')}`;
	} catch {
		// No git here: the build's own date
		const now = new Date(Date.now() + 9 * 3600_000);
		return now.toISOString().slice(0, 10).replaceAll('-', '.');
	}
}
