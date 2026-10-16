import { execFileSync } from 'node:child_process';

// Versions people see, like 2026.10.16-002: the Japan date of a change to main, and which
// change to main it was on that day (merges and direct pushes, counted along main's first
// parents). Builds of the same commit get the same versions.
//
// `current` is the commit being built. `byPr` gives the version each pull request went out in,
// read from the merge's subject ("Merge pull request #64 …" or "… (#62)"), for 更新情報.
//
// Workers Builds and GitHub Actions check out a shallow copy, so the rest of the history is
// fetched first. Without it the counts are unknown: `current` is only the date, `byPr` empty.
export function appVersions() {
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
				// Still shallow: only the date, below
			}
		}
		const commits = git('log', '--first-parent', '--reverse', '--format=%cd %s', '--date=format-local:%Y.%m.%d', 'HEAD')
			.split('\n')
			.map((line) => ({ day: line.slice(0, 10), subject: line.slice(11) }));
		if (git('rev-parse', '--is-shallow-repository') === 'true') return { current: commits.at(-1).day, byPr: {} };
		const byPr = {};
		let version = '';
		let count = 0;
		for (const [i, { day, subject }] of commits.entries()) {
			count = i > 0 && commits[i - 1].day === day ? count + 1 : 1;
			version = `${day}-${String(count).padStart(3, '0')}`;
			const pr = subject.match(/^Merge pull request #(\d+)/)?.[1] ?? subject.match(/\(#(\d+)\)$/)?.[1];
			if (pr) byPr[pr] = version;
		}
		return { current: version, byPr };
	} catch {
		// No git here: the build's own date
		const now = new Date(Date.now() + 9 * 3600_000);
		return { current: now.toISOString().slice(0, 10).replaceAll('-', '.'), byPr: {} };
	}
}
