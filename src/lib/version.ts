// Like 2026.10.16-002: the day it was put out, and the how-manyth change that day (scripts/app-version.mjs)
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// The version each pull request went out in, for 更新情報. Empty when the build had no history.
const PR_VERSIONS: Record<string, string> = typeof __PR_VERSIONS__ === 'object' ? __PR_VERSIONS__ : {};

export const prVersion = (pr: number): string | null => PR_VERSIONS[pr] ?? null;
